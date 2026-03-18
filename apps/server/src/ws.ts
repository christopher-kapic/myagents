import type { WSContext } from "hono/ws";
import { createHash } from "node:crypto";
import prisma from "@myagents/db";
import { auth } from "@myagents/auth";

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
      // Message handling will be implemented in US-007/US-010
      console.log(`[WS] message from ${authInfo.type}:`, event.data);
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
