import type { WSContext } from "hono/ws";
import { createHash } from "node:crypto";
import prisma from "@myagents/db";
import { auth } from "@myagents/auth";
import {
  parseFrame,
  serializeFrame,
  createRequestFrame,
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
async function handleFrame(
  frame: Frame,
  connection: Connection,
): Promise<Frame | null> {
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

    case "message.send": {
      return handleMessageSend(frame, connection);
    }

    case "message.response": {
      return handleMessageResponse(frame, connection);
    }

    case "message.chunk": {
      return handleMessageChunk(frame, connection);
    }

    case "message.done": {
      return handleMessageDone(frame, connection);
    }

    case "agent.register": {
      return handleAgentRegister(frame, connection);
    }

    case "agent.status":
    case "auth":
      console.log(`[WS] received ${frame.method} from ${connection.type}`);
      return null;
  }
}

// ─── Agent Registration ───────────────────────────────────────────────────────

/**
 * Handle agent.register from a CLI node:
 * Upsert the agent record in the database, linking it to the node and user.
 */
async function handleAgentRegister(
  frame: Frame,
  connection: Connection,
): Promise<Frame | null> {
  if (connection.type !== "node") {
    return createResponseFrame(
      "agent.register",
      undefined,
      frame.id,
      "Only node connections can register agents",
    );
  }

  const payload = frame.payload as {
    slug?: string;
    name?: string;
    description?: string;
    type?: string;
    adapterConfig?: Record<string, unknown>;
  };

  if (!payload?.slug || !payload?.name) {
    return createResponseFrame(
      "agent.register",
      undefined,
      frame.id,
      "Missing required fields: slug, name",
    );
  }

  // Validate slug format: [a-zA-Z0-9-]+ only
  if (!/^[a-zA-Z0-9-]+$/.test(payload.slug)) {
    return createResponseFrame(
      "agent.register",
      undefined,
      frame.id,
      "Invalid slug format: must match [a-zA-Z0-9-]+",
    );
  }

  const agentType = payload.type === "hermes" || payload.type === "openclaw"
    ? payload.type
    : "custom";

  try {
    // Upsert: create if not exists, update if exists
    const agent = await prisma.agent.upsert({
      where: {
        userId_slug: {
          userId: connection.userId,
          slug: payload.slug,
        },
      },
      update: {
        name: payload.name,
        description: payload.description ?? null,
        type: agentType,
        nodeId: connection.nodeId,
        status: "online",
        adapterConfig: payload.adapterConfig
          ? JSON.parse(JSON.stringify(payload.adapterConfig))
          : undefined,
      },
      create: {
        slug: payload.slug,
        name: payload.name,
        description: payload.description ?? null,
        type: agentType,
        nodeId: connection.nodeId,
        userId: connection.userId,
        status: "online",
        adapterConfig: payload.adapterConfig
          ? JSON.parse(JSON.stringify(payload.adapterConfig))
          : undefined,
      },
      select: { id: true, slug: true, name: true },
    });

    console.log(`[WS] agent registered: ${agent.slug} (${agent.id}) on node ${connection.nodeId}`);

    return createResponseFrame(
      "agent.register",
      { agentId: agent.id, slug: agent.slug, name: agent.name },
      frame.id,
    );
  } catch (err) {
    console.error("[WS] agent registration error:", err);
    return createResponseFrame(
      "agent.register",
      undefined,
      frame.id,
      "Failed to register agent",
    );
  }
}

// ─── Message Routing ──────────────────────────────────────────────────────────

/**
 * Handle message.send from a web client:
 * 1. Look up the target agent and its node connection
 * 2. Create/get conversation and save user message to DB
 * 3. Forward to the agent's CLI node via WebSocket
 */
async function handleMessageSend(
  frame: Frame,
  connection: Connection,
): Promise<Frame | null> {
  const payload = frame.payload as {
    agentSlug?: string;
    conversationId?: string;
    content?: string;
  };

  if (!payload?.agentSlug || !payload?.content) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      "Missing agentSlug or content",
    );
  }

  const { agentSlug, content } = payload;
  const userId = connection.userId;

  // Look up the target agent
  const agent = await prisma.agent.findFirst({
    where: { slug: agentSlug, userId },
    select: { id: true, nodeId: true, status: true, slug: true },
  });

  if (!agent) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      `Agent "${agentSlug}" not found`,
    );
  }

  // Check if agent's node is connected
  const nodeConn = connectionRegistry.getNodeConnection(agent.nodeId);
  if (!nodeConn || nodeConn.ws.readyState !== 1) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      `Agent "${agentSlug}" is offline`,
    );
  }

  // Get or create conversation
  let conversationId = payload.conversationId;
  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: {
        userId,
        agentId: agent.id,
        title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
      },
      select: { id: true },
    });
    conversationId = conversation.id;
  } else {
    // Verify conversation exists and belongs to user
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!conversation) {
      return createResponseFrame(
        "message.send",
        undefined,
        frame.id,
        "Conversation not found",
      );
    }
  }

  // Save user message to DB
  const message = await prisma.message.create({
    data: {
      conversationId,
      senderType: "user",
      senderId: userId,
      content,
    },
    select: { id: true },
  });

  // Forward to CLI node
  const forwardFrame = createRequestFrame("message.send", {
    conversationId,
    agentSlug: agent.slug,
    content,
    messageId: message.id,
  });
  nodeConn.ws.send(serializeFrame(forwardFrame));

  // Respond to sender with conversation and message IDs
  return createResponseFrame(
    "message.send",
    { conversationId, messageId: message.id },
    frame.id,
  );
}

/**
 * Handle message.response from CLI:
 * Forward the full response to the user's WebSocket connection(s).
 */
async function handleMessageResponse(
  frame: Frame,
  connection: Connection,
): Promise<Frame | null> {
  if (connection.type !== "node") return null;

  const payload = frame.payload as {
    conversationId?: string;
    content?: string;
  };

  if (!payload?.conversationId || !payload?.content) return null;

  // Look up the conversation to find the user
  const conversation = await prisma.conversation.findUnique({
    where: { id: payload.conversationId },
    select: { userId: true },
  });
  if (!conversation) return null;

  // Forward to user's client connections
  const clientConns = connectionRegistry.getClientConnections(
    conversation.userId,
  );
  const eventFrame = createEventFrame("message.response", {
    conversationId: payload.conversationId,
    content: payload.content,
  });
  const serialized = serializeFrame(eventFrame);
  for (const client of clientConns) {
    if (client.ws.readyState === 1) {
      client.ws.send(serialized);
    }
  }

  return null;
}

/**
 * Handle message.chunk from CLI:
 * Forward streaming chunks to the user's WebSocket connection(s).
 */
async function handleMessageChunk(
  frame: Frame,
  connection: Connection,
): Promise<Frame | null> {
  if (connection.type !== "node") return null;

  const payload = frame.payload as {
    conversationId?: string;
    chunk?: string;
  };

  if (!payload?.conversationId || payload?.chunk === undefined) return null;

  // Look up the conversation to find the user
  const conversation = await prisma.conversation.findUnique({
    where: { id: payload.conversationId },
    select: { userId: true },
  });
  if (!conversation) return null;

  // Forward chunk to user's client connections
  const clientConns = connectionRegistry.getClientConnections(
    conversation.userId,
  );
  const eventFrame = createEventFrame("message.chunk", {
    conversationId: payload.conversationId,
    chunk: payload.chunk,
  });
  const serialized = serializeFrame(eventFrame);
  for (const client of clientConns) {
    if (client.ws.readyState === 1) {
      client.ws.send(serialized);
    }
  }

  return null;
}

/**
 * Handle message.done from CLI:
 * Save the complete agent message to DB and notify the user.
 */
async function handleMessageDone(
  frame: Frame,
  connection: Connection,
): Promise<Frame | null> {
  if (connection.type !== "node") return null;

  const payload = frame.payload as {
    conversationId?: string;
    content?: string;
  };

  if (!payload?.conversationId || !payload?.content) return null;

  // Look up the conversation to find the user and agent
  const conversation = await prisma.conversation.findUnique({
    where: { id: payload.conversationId },
    select: { userId: true, agentId: true },
  });
  if (!conversation) return null;

  // Save agent message to DB
  const message = await prisma.message.create({
    data: {
      conversationId: payload.conversationId,
      senderType: "agent",
      senderId: conversation.agentId,
      content: payload.content,
    },
    select: { id: true },
  });

  // Update conversation updatedAt
  await prisma.conversation.update({
    where: { id: payload.conversationId },
    data: { updatedAt: new Date() },
  });

  // Notify user's client connections
  const clientConns = connectionRegistry.getClientConnections(
    conversation.userId,
  );
  const eventFrame = createEventFrame("message.done", {
    conversationId: payload.conversationId,
    messageId: message.id,
    content: payload.content,
  });
  const serialized = serializeFrame(eventFrame);
  for (const client of clientConns) {
    if (client.ws.readyState === 1) {
      client.ws.send(serialized);
    }
  }

  return null;
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

    async onMessage(event: MessageEvent, _ws: WSContext) {
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

      try {
        const response = await handleFrame(frame, connection);
        if (response && connection.ws.readyState === 1) {
          connection.ws.send(serializeFrame(response));
        }
      } catch (err) {
        console.error(`[WS] error handling frame ${frame.method}:`, err);
        if (connection.ws.readyState === 1) {
          const errorResponse = createResponseFrame(
            frame.method,
            undefined,
            frame.id,
            "Internal server error",
          );
          connection.ws.send(serializeFrame(errorResponse));
        }
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
