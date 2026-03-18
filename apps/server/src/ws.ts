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

  const connType = params.get("type");

  // Node (CLI) connection: ?type=node&apiKey=...&nodeId=...
  if (connType === "node") {
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

  // Client connection via API key: ?type=client&apiKey=...
  if (connType === "client") {
    const apiKey = params.get("apiKey");
    if (!apiKey) return null;

    const result = await authenticateApiKey(apiKey);
    if (!result) return null;

    return { type: "client", userId: result.userId };
  }

  // Client (web app) connection: authenticated via session cookie
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  const result = await authenticateSession(cookieHeader);
  if (!result) return null;

  return { type: "client", userId: result.userId };
}

/**
 * Handle node disconnection: mark node and its agents as offline,
 * log uptime transitions, and send push notifications.
 */
async function handleNodeDisconnect(nodeId: string): Promise<void> {
  try {
    await prisma.node.update({
      where: { id: nodeId },
      data: { status: "offline", lastSeen: new Date() },
    });

    // Find agents on this node that are currently online (going offline)
    const affectedAgents = await prisma.agent.findMany({
      where: { nodeId, status: "online" },
      select: { id: true, slug: true, name: true, userId: true },
    });

    await prisma.agent.updateMany({
      where: { nodeId },
      data: { status: "offline" },
    });

    // Log uptime transitions and send push notifications for each affected agent
    if (affectedAgents.length > 0) {
      await prisma.agentUptimeLog.createMany({
        data: affectedAgents.map((agent) => ({
          agentId: agent.id,
          status: "offline" as const,
        })),
      });

      // Send push notifications (fire-and-forget)
      for (const agent of affectedAgents) {
        void sendAgentOfflinePush(agent.userId, agent.name, agent.slug);
      }
    }
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

    case "agent.list": {
      return handleAgentList(frame, connection);
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

    // Log the online transition for uptime tracking
    void prisma.agentUptimeLog.create({
      data: { agentId: agent.id, status: "online" },
    });

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

// ─── Agent List (Permission-Gated Discovery) ─────────────────────────────────

/**
 * Handle agent.list from a connection:
 *
 * - Node connections with senderAgentSlug: return only agents the specified
 *   agent has permission to send messages to (permission-gated discovery).
 * - Client connections: return the user's own agents + shared agents from
 *   other users that the user has permissions for.
 */
async function handleAgentList(
  frame: Frame,
  connection: Connection,
): Promise<Frame | null> {
  const payload = frame.payload as {
    senderAgentSlug?: string;
    search?: string;
    type?: string;
    status?: string;
  };

  const userId = connection.userId;

  // Agent-perspective: node connection with senderAgentSlug
  if (connection.type === "node" && payload?.senderAgentSlug) {
    const senderAgent = await prisma.agent.findUnique({
      where: {
        userId_slug: { userId, slug: payload.senderAgentSlug },
      },
      select: { id: true },
    });

    if (!senderAgent) {
      return createResponseFrame(
        "agent.list",
        undefined,
        frame.id,
        `Agent "${payload.senderAgentSlug}" not found`,
      );
    }

    // Query permissions: find all agents this agent can send to
    const permissionWhere: Record<string, unknown> = {
      agentId: senderAgent.id,
    };

    // Build filters for the target agent
    const targetFilters: Record<string, unknown> = {};
    if (payload.type) targetFilters.type = payload.type;
    if (payload.status) targetFilters.status = payload.status;
    if (payload.search) {
      targetFilters.OR = [
        { name: { contains: payload.search, mode: "insensitive" } },
        { slug: { contains: payload.search, mode: "insensitive" } },
        { description: { contains: payload.search, mode: "insensitive" } },
      ];
    }

    if (Object.keys(targetFilters).length > 0) {
      permissionWhere.targetAgent = targetFilters;
    }

    const permissions = await prisma.agentPermission.findMany({
      where: permissionWhere,
      select: {
        targetAgent: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            type: true,
            status: true,
            shared: true,
            userId: true,
            node: { select: { id: true, name: true, status: true } },
            user: { select: { username: true } },
          },
        },
      },
    });

    const agents = permissions.map((p) => {
      const agent = p.targetAgent;
      const isCrossUser = agent.userId !== userId;
      return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        description: agent.description,
        type: String(agent.type),
        status: String(agent.status),
        shared: agent.shared,
        node: agent.node
          ? {
              id: agent.node.id,
              name: agent.node.name,
              status: String(agent.node.status),
            }
          : null,
        // Include owner username for cross-user agents (displayed as username/slug)
        owner: isCrossUser ? (agent.user?.username ?? null) : null,
        address: isCrossUser && agent.user?.username
          ? `${agent.user.username}/${agent.slug}`
          : agent.slug,
      };
    });

    return createResponseFrame("agent.list", { agents }, frame.id);
  }

  // User-perspective: client connection — own agents + shared
  const ownWhere: Record<string, unknown> = { userId };
  if (payload?.type) ownWhere.type = payload.type;
  if (payload?.status) ownWhere.status = payload.status;
  if (payload?.search) {
    ownWhere.OR = [
      { name: { contains: payload.search, mode: "insensitive" } },
      { slug: { contains: payload.search, mode: "insensitive" } },
      { description: { contains: payload.search, mode: "insensitive" } },
    ];
  }

  const ownAgents = await prisma.agent.findMany({
    where: ownWhere,
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      type: true,
      status: true,
      shared: true,
      node: { select: { id: true, name: true, status: true } },
    },
    orderBy: { name: "asc" },
  });

  // Find shared agents from other users
  const sharedPermissions = await prisma.agentPermission.findMany({
    where: {
      createdBy: userId,
      targetAgent: {
        userId: { not: userId },
        shared: true,
      },
    },
    select: { targetAgentId: true },
  });

  const sharedAgentIds = sharedPermissions.map((p) => p.targetAgentId);
  let sharedAgents: Array<Record<string, unknown>> = [];

  if (sharedAgentIds.length > 0) {
    const sharedWhere: Record<string, unknown> = {
      id: { in: sharedAgentIds },
    };
    if (payload?.type) sharedWhere.type = payload.type;
    if (payload?.status) sharedWhere.status = payload.status;
    if (payload?.search) {
      sharedWhere.OR = [
        { name: { contains: payload.search, mode: "insensitive" } },
        { slug: { contains: payload.search, mode: "insensitive" } },
        { description: { contains: payload.search, mode: "insensitive" } },
      ];
    }

    const results = await prisma.agent.findMany({
      where: sharedWhere,
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        type: true,
        status: true,
        shared: true,
        userId: true,
        node: { select: { id: true, name: true, status: true } },
        user: { select: { username: true } },
      },
      orderBy: { name: "asc" },
    });

    sharedAgents = results.map((agent) => ({
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      type: String(agent.type),
      status: String(agent.status),
      shared: agent.shared,
      node: agent.node
        ? {
            id: agent.node.id,
            name: agent.node.name,
            status: String(agent.node.status),
          }
        : null,
      owner: agent.user?.username ?? null,
      address: agent.user?.username
        ? `${agent.user.username}/${agent.slug}`
        : agent.slug,
    }));
  }

  const own = ownAgents.map((agent) => ({
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    type: String(agent.type),
    status: String(agent.status),
    shared: agent.shared,
    node: agent.node
      ? {
          id: agent.node.id,
          name: agent.node.name,
          status: String(agent.node.status),
        }
      : null,
    owner: null,
    address: agent.slug,
  }));

  return createResponseFrame(
    "agent.list",
    { own, shared: sharedAgents },
    frame.id,
  );
}

// ─── Message Routing ──────────────────────────────────────────────────────────

/**
 * Tracks agent-to-agent conversations so responses can be routed back
 * to the sender agent's node. Maps conversationId → sender info.
 */
interface A2AConversationInfo {
  senderAgentId: string;
  senderAgentSlug: string;
  senderNodeId: string;
  senderUserId: string;
}
const a2aConversations = new Map<string, A2AConversationInfo>();

/**
 * Resolve a target agent address. Accepts:
 *  - bare slug: resolves to the requesting user's agent
 *  - username/slug: resolves to a cross-user agent
 * Returns the agent record or null.
 */
async function resolveTargetAgent(
  targetAddress: string,
  requestingUserId: string,
): Promise<{
  id: string;
  slug: string;
  nodeId: string;
  status: string;
  userId: string;
  name: string;
} | null> {
  const parts = targetAddress.split("/");

  if (parts.length === 2 && parts[0] && parts[1]) {
    // Cross-user: username/slug
    const username = parts[0];
    const slug = parts[1];
    const targetUser = await prisma.user.findFirst({
      where: { username },
      select: { id: true },
    });
    if (!targetUser) return null;

    const agent = await prisma.agent.findUnique({
      where: { userId_slug: { userId: targetUser.id, slug } },
      select: { id: true, slug: true, nodeId: true, status: true, userId: true, name: true },
    });
    return agent ?? null;
  }

  // Bare slug: same user's agent
  const agent = await prisma.agent.findUnique({
    where: { userId_slug: { userId: requestingUserId, slug: targetAddress } },
    select: { id: true, slug: true, nodeId: true, status: true, userId: true, name: true },
  });
  return agent ?? null;
}

/**
 * Handle message.send from a web client or a node (agent-to-agent):
 * 1. Look up the target agent and its node connection
 * 2. For A2A: check permissions via AgentPermission
 * 3. Create/get conversation and save message to DB
 * 4. Forward to the target agent's CLI node via WebSocket
 */
async function handleMessageSend(
  frame: Frame,
  connection: Connection,
): Promise<Frame | null> {
  const payload = frame.payload as {
    agentSlug?: string;
    targetAgent?: string;
    senderAgent?: string;
    conversationId?: string;
    content?: string;
  };

  // Agent-to-agent: node connection with senderAgent and targetAgent
  if (
    connection.type === "node" &&
    payload?.senderAgent &&
    payload?.targetAgent &&
    payload?.content
  ) {
    return handleAgentToAgentSend(frame, connection, payload as {
      senderAgent: string;
      targetAgent: string;
      content: string;
      conversationId?: string;
    });
  }

  // User-to-agent: original flow
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
 * Handle agent-to-agent message routing:
 * 1. Resolve sender and target agents
 * 2. Check AgentPermission (sender → target)
 * 3. Create/continue conversation between agents
 * 4. Save message, forward to target node, track for response routing
 */
async function handleAgentToAgentSend(
  frame: Frame,
  connection: NodeConnection,
  payload: {
    senderAgent: string;
    targetAgent: string;
    content: string;
    conversationId?: string;
  },
): Promise<Frame | null> {
  const { senderAgent: senderSlug, targetAgent: targetAddress, content } = payload;
  const userId = connection.userId;

  // Resolve sender agent (must belong to this node's user)
  const senderAgent = await prisma.agent.findUnique({
    where: { userId_slug: { userId, slug: senderSlug } },
    select: { id: true, slug: true, nodeId: true, name: true },
  });

  if (!senderAgent) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      `Sender agent "${senderSlug}" not found`,
    );
  }

  // Verify sender agent runs on this node
  if (senderAgent.nodeId !== connection.nodeId) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      `Sender agent "${senderSlug}" is not on this node`,
    );
  }

  // Resolve target agent (bare slug or username/slug)
  const targetAgent = await resolveTargetAgent(targetAddress, userId);
  if (!targetAgent) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      `Target agent "${targetAddress}" not found`,
    );
  }

  // Prevent self-messaging
  if (senderAgent.id === targetAgent.id) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      "An agent cannot send messages to itself",
    );
  }

  // Check permission: sender → target
  const permission = await prisma.agentPermission.findUnique({
    where: {
      agentId_targetAgentId: {
        agentId: senderAgent.id,
        targetAgentId: targetAgent.id,
      },
    },
  });

  if (!permission) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      `Agent "${senderSlug}" does not have permission to message "${targetAddress}"`,
    );
  }

  // For cross-user targets, verify the target agent is shared
  if (targetAgent.userId !== userId && !await isAgentShared(targetAgent.id)) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      `Target agent "${targetAddress}" is not shared`,
    );
  }

  // Check if target node is connected
  const targetNodeConn = connectionRegistry.getNodeConnection(targetAgent.nodeId);
  if (!targetNodeConn || targetNodeConn.ws.readyState !== 1) {
    return createResponseFrame(
      "message.send",
      undefined,
      frame.id,
      `Target agent "${targetAddress}" is offline`,
    );
  }

  // Get or create conversation between the two agents
  // Conversation is owned by the sender's user, with agentId = target agent
  let conversationId = payload.conversationId;
  if (!conversationId) {
    // Look for an existing conversation between these agents
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        userId,
        agentId: targetAgent.id,
        // Check that the last message was from the sender agent
        messages: {
          some: {
            senderType: "agent",
            senderId: senderAgent.id,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (existingConversation) {
      conversationId = existingConversation.id;
    } else {
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          agentId: targetAgent.id,
          title: `${senderAgent.name} → ${targetAgent.name}`,
        },
        select: { id: true },
      });
      conversationId = conversation.id;
    }
  } else {
    // Verify conversation exists
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId },
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

  // Save sender agent message to DB
  const message = await prisma.message.create({
    data: {
      conversationId,
      senderType: "agent",
      senderId: senderAgent.id,
      content,
    },
    select: { id: true },
  });

  // Track this as an A2A conversation for response routing
  a2aConversations.set(conversationId, {
    senderAgentId: senderAgent.id,
    senderAgentSlug: senderAgent.slug,
    senderNodeId: connection.nodeId,
    senderUserId: userId,
  });

  // Forward to target agent's CLI node
  const forwardFrame = createRequestFrame("message.send", {
    conversationId,
    agentSlug: targetAgent.slug,
    content,
    messageId: message.id,
    senderAgent: senderAgent.slug,
  });
  targetNodeConn.ws.send(serializeFrame(forwardFrame));

  // Respond to sender with conversation and message IDs
  return createResponseFrame(
    "message.send",
    { conversationId, messageId: message.id },
    frame.id,
  );
}

/**
 * Check if an agent has shared=true.
 */
async function isAgentShared(agentId: string): Promise<boolean> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { shared: true },
  });
  return agent?.shared === true;
}

/**
 * Handle message.response from CLI:
 * Forward the full response to the user's WebSocket connection(s),
 * and/or to the sender agent's node for A2A conversations.
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

  // Check if this is an A2A conversation — route to sender agent's node
  const a2aInfo = a2aConversations.get(payload.conversationId);
  if (a2aInfo) {
    const senderNodeConn = connectionRegistry.getNodeConnection(a2aInfo.senderNodeId);
    if (senderNodeConn && senderNodeConn.ws.readyState === 1) {
      const eventFrame = createEventFrame("message.response", {
        conversationId: payload.conversationId,
        content: payload.content,
        targetAgent: a2aInfo.senderAgentSlug,
      });
      senderNodeConn.ws.send(serializeFrame(eventFrame));
    }
  }

  // Also forward to user's client connections (so they can see in the UI)
  const conversation = await prisma.conversation.findUnique({
    where: { id: payload.conversationId },
    select: { userId: true },
  });
  if (!conversation) return null;

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
 * Forward streaming chunks to the user's WebSocket connection(s),
 * and/or to the sender agent's node for A2A conversations.
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

  // Check if this is an A2A conversation — route chunks to sender agent's node
  const a2aInfo = a2aConversations.get(payload.conversationId);
  if (a2aInfo) {
    const senderNodeConn = connectionRegistry.getNodeConnection(a2aInfo.senderNodeId);
    if (senderNodeConn && senderNodeConn.ws.readyState === 1) {
      const eventFrame = createEventFrame("message.chunk", {
        conversationId: payload.conversationId,
        chunk: payload.chunk,
        targetAgent: a2aInfo.senderAgentSlug,
      });
      senderNodeConn.ws.send(serializeFrame(eventFrame));
    }
  }

  // Also forward to user's client connections
  const conversation = await prisma.conversation.findUnique({
    where: { id: payload.conversationId },
    select: { userId: true },
  });
  if (!conversation) return null;

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
 * Save the complete agent message to DB, notify the user,
 * and route back to sender agent's node for A2A conversations.
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
    select: {
      userId: true,
      agentId: true,
      agent: { select: { slug: true, name: true } },
    },
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

  // Check if this is an A2A conversation — route done event to sender agent's node
  const a2aInfo = a2aConversations.get(payload.conversationId);
  if (a2aInfo) {
    const senderNodeConn = connectionRegistry.getNodeConnection(a2aInfo.senderNodeId);
    if (senderNodeConn && senderNodeConn.ws.readyState === 1) {
      const doneFrame = createEventFrame("message.done", {
        conversationId: payload.conversationId,
        messageId: message.id,
        content: payload.content,
        targetAgent: a2aInfo.senderAgentSlug,
      });
      senderNodeConn.ws.send(serializeFrame(doneFrame));
    }
    // Clean up A2A tracking after done — conversation can be reused via conversationId
    a2aConversations.delete(payload.conversationId);
  }

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

  // Send push notification (fire-and-forget)
  void sendAgentResponsePush(
    conversation.userId,
    conversation.agent.name,
    conversation.agent.slug,
    payload.conversationId,
    payload.content,
  );

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

// ─── Push Notifications ───────────────────────────────────────────────────────

/**
 * Send a push notification to the user when an agent responds.
 * Skipped silently if VAPID keys are not configured or user has no subscriptions.
 */
async function sendAgentResponsePush(
  userId: string,
  agentName: string,
  agentSlug: string,
  conversationId: string,
  content: string,
): Promise<void> {
  try {
    const { sendPushNotification } = await import("@myagents/api/lib/web-push");

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subscriptions.length === 0) return;

    const preview = content.length > 120 ? content.slice(0, 120) + "…" : content;
    const payload = JSON.stringify({
      title: agentName,
      body: preview,
      data: {
        url: `/agents/${agentSlug}/conversations/${conversationId}`,
        conversationId,
      },
    });

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await sendPushNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
        }
      }),
    );
  } catch {
    // Push notifications are best-effort — don't break message flow
  }
}

/**
 * Send a push notification to the user when an agent goes offline unexpectedly.
 */
async function sendAgentOfflinePush(
  userId: string,
  agentName: string,
  agentSlug: string,
): Promise<void> {
  try {
    const { sendPushNotification } = await import("@myagents/api/lib/web-push");

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title: `${agentName} went offline`,
      body: `Agent ${agentSlug} has disconnected unexpectedly.`,
      data: {
        url: `/agents/${agentSlug}`,
      },
    });

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await sendPushNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
        }
      }),
    );
  } catch {
    // Push notifications are best-effort
  }
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
