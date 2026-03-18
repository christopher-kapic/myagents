import type { WSContext } from "hono/ws";
import { createHash } from "node:crypto";
import prisma from "@myagents/db";
import { auth } from "@myagents/auth";
import {
  parseFrame,
  serializeFrame,
  createResponseFrame,
  createEventFrame,
  type Frame,
} from "@myagents/shared";

interface ClientConnection {
  type: "client";
  userId: string;
  ws: WSContext;
}

interface NodeConnection {
  type: "node";
  userId: string;
  nodeId: string;
  ws: WSContext;
  lastSeen: number;
}

type Connection = ClientConnection | NodeConnection;

/** Maps nodeId → NodeConnection */
const nodeConnections = new Map<string, NodeConnection>();

/** Maps userId → ClientConnection[] */
const clientConnections = new Map<string, ClientConnection[]>();

export const connectionRegistry = {
  getNodeConnection(nodeId: string): NodeConnection | undefined {
    return nodeConnections.get(nodeId);
  },

  getClientConnections(userId: string): ClientConnection[] {
    return clientConnections.get(userId) ?? [];
  },

  addConnection(conn: Connection): void {
    if (conn.type === "node") {
      nodeConnections.set(conn.nodeId, conn);
    } else {
      const existing = clientConnections.get(conn.userId) ?? [];
      existing.push(conn);
      clientConnections.set(conn.userId, existing);
    }
  },

  removeConnection(conn: Connection): void {
    if (conn.type === "node") {
      nodeConnections.delete(conn.nodeId);
    } else {
      const existing = clientConnections.get(conn.userId);
      if (existing) {
        const filtered = existing.filter((c) => c.ws !== conn.ws);
        if (filtered.length === 0) {
          clientConnections.delete(conn.userId);
        } else {
          clientConnections.set(conn.userId, filtered);
        }
      }
    }
  },

  get allNodeConnections() {
    return nodeConnections;
  },

  get allClientConnections() {
    return clientConnections;
  },
};

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Authenticate a node (CLI) connection via API key.
 * Returns the userId if valid, null otherwise.
 */
async function authenticateApiKey(
  apiKey: string,
): Promise<{ userId: string } | null> {
  const keyHash = hashKey(apiKey);
  const record = await prisma.apiKey.findFirst({
    where: { keyHash },
    select: { userId: true, id: true },
  });

  if (!record) return null;

  // Update lastUsedAt
  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return { userId: record.userId };
}

/**
 * Authenticate a client (web app) connection via session cookie.
 * Returns the userId if valid, null otherwise.
 */
async function authenticateSession(
  cookieHeader: string,
): Promise<{ userId: string } | null> {
  try {
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookieHeader }),
    });
    if (!session?.user?.id) return null;
    return { userId: session.user.id };
  } catch {
    return null;
  }
}

/**
 * Determine connection type and authenticate from the upgrade request.
 */
export async function authenticateWebSocket(
  req: Request,
): Promise<
  | { type: "client"; userId: string }
  | { type: "node"; userId: string; nodeId: string }
  | null
> {
  const url = new URL(req.url, "http://localhost");
  const params = url.searchParams;

  // Node (CLI) connection: ?type=node&apiKey=...&nodeId=...
  if (params.get("type") === "node") {
    const apiKey = params.get("apiKey");
    const nodeId = params.get("nodeId");
    if (!apiKey || !nodeId) return null;

    const result = await authenticateApiKey(apiKey);
    if (!result) return null;

    // Verify the node belongs to this user
    const node = await prisma.node.findFirst({
      where: { id: nodeId, userId: result.userId },
    });
    if (!node) {
      // Auto-create the node if it doesn't exist
      await prisma.node.create({
        data: {
          id: nodeId,
          name: `Node ${nodeId.slice(0, 8)}`,
          userId: result.userId,
          status: "online",
          lastSeen: new Date(),
        },
      });
    } else {
      await prisma.node.update({
        where: { id: nodeId },
        data: { status: "online", lastSeen: new Date() },
      });
    }

    return { type: "node", userId: result.userId, nodeId };
  }

  // Client (web app) connection: authenticated via session cookie
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const result = await authenticateSession(cookieHeader);
  if (!result) return null;

  return { type: "client", userId: result.userId };
}

/**
 * Handle node disconnection: mark node and its agents as offline.
 */
async function handleNodeDisconnect(nodeId: string): Promise<void> {
  try {
    await prisma.node.update({
      where: { id: nodeId },
      data: { status: "offline", lastSeen: new Date() },
    });
    await prisma.agent.updateMany({
      where: { nodeId },
      data: { status: "offline" },
    });
  } catch {
    // Node may have been deleted
  }
}

/**
 * Handle an incoming frame from a connection.
 * Returns an optional response frame.
 */
function handleFrame(
  frame: Frame,
  connection: Connection,
): Frame | null {
  switch (frame.method) {
    case "agent.heartbeat": {
      if (connection.type === "node") {
        connection.lastSeen = Date.now();
        void prisma.node.update({
          where: { id: connection.nodeId },
          data: { lastSeen: new Date(), status: "online" },
        });
        return createResponseFrame("agent.heartbeat", { ok: true }, frame.id);
      }
      return null;
    }

    case "agent.register":
    case "agent.status":
    case "message.send":
    case "message.response":
    case "message.chunk":
    case "message.done":
    case "auth":
      // These will be fully implemented in US-010 (message routing) and US-012 (agent registration)
      console.log(`[WS] received ${frame.method} from ${connection.type}`);
      return null;
  }
}

/**
 * Create WebSocket event handlers for a connection.
 */
export function createWSHandlers(authInfo: {
  type: "client" | "node";
  userId: string;
  nodeId?: string;
}) {
  let connection: Connection | null = null;

  return {
    onOpen(_event: Event, ws: WSContext) {
      if (authInfo.type === "node" && authInfo.nodeId) {
        connection = {
          type: "node",
          userId: authInfo.userId,
          nodeId: authInfo.nodeId,
          ws,
          lastSeen: Date.now(),
        };
      } else {
        connection = {
          type: "client",
          userId: authInfo.userId,
          ws,
        };
      }
      connectionRegistry.addConnection(connection);
      console.log(
        `[WS] ${authInfo.type} connected: userId=${authInfo.userId}${authInfo.nodeId ? ` nodeId=${authInfo.nodeId}` : ""}`,
      );
    },

    onMessage(event: MessageEvent, _ws: WSContext) {
      if (!connection) return;

      const data = event.data;
      const frame = parseFrame(typeof data === "string" ? data : String(data));
      if (!frame) {
        console.warn(`[WS] invalid frame from ${authInfo.type}:`, data);
        return;
      }

      // Update lastSeen for node connections on any message
      if (connection.type === "node") {
        connection.lastSeen = Date.now();
      }

      const response = handleFrame(frame, connection);
      if (response && connection.ws.readyState === 1) {
        connection.ws.send(serializeFrame(response));
      }
    },

    onClose() {
      if (connection) {
        connectionRegistry.removeConnection(connection);
        if (connection.type === "node") {
          void handleNodeDisconnect(connection.nodeId);
        }
        console.log(
          `[WS] ${authInfo.type} disconnected: userId=${authInfo.userId}`,
        );
      }
    },

    onError(event: Event) {
      console.error(`[WS] error for ${authInfo.type}:`, event);
      if (connection) {
        connectionRegistry.removeConnection(connection);
        if (connection.type === "node") {
          void handleNodeDisconnect(connection.nodeId);
        }
      }
    },
  };
}

// ─── Heartbeat System ─────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000; // Ping every 30 seconds
const HEARTBEAT_TIMEOUT_MS = 90_000;  // Mark offline after 90 seconds of silence

/**
 * Start the heartbeat interval that pings node connections and marks
 * unresponsive nodes as offline.
 */
export function startHeartbeat(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    const pingFrame = createEventFrame("agent.heartbeat", { ping: true });
    const pingMessage = serializeFrame(pingFrame);

    for (const [nodeId, conn] of nodeConnections) {
      // Check if node has been silent too long
      if (now - conn.lastSeen > HEARTBEAT_TIMEOUT_MS) {
        console.log(`[WS] node ${nodeId} timed out (no heartbeat for ${HEARTBEAT_TIMEOUT_MS / 1000}s)`);
        try {
          conn.ws.close(4002, "Heartbeat timeout");
        } catch {
          // Connection may already be closed
        }
        connectionRegistry.removeConnection(conn);
        void handleNodeDisconnect(nodeId);
        continue;
      }

      // Send heartbeat ping
      try {
        if (conn.ws.readyState === 1) {
          conn.ws.send(pingMessage);
        }
      } catch {
        // Send failed, will be caught by timeout on next cycle
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}
