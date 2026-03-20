import { Command } from "commander";
import WebSocket from "ws";
import {
  parseFrame,
  serializeFrame,
  createRequestFrame,
} from "@myagents/shared";
import { ApiClient } from "../api-client.js";
import { resolveApiKey, resolveServerUrl } from "../config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  slug: string;
  name: string;
}

interface ConversationInfo {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  agentId: string;
  agent?: {
    slug: string;
    name: string;
    type: string;
    status: string;
  };
  lastMessage?: {
    id: string;
    content: string;
    senderType: string;
    createdAt: string;
  } | null;
}

interface MessageInfo {
  id: string;
  content: string;
  senderType: string;
  senderId: string | null;
  createdAt: string;
}

// ─── Chat Command ────────────────────────────────────────────────────────────

export const chatCommand = new Command("chat")
  .description("Manage chats: list recent, view messages, rename, send messages, start new chats");

// ─── chat list ───────────────────────────────────────────────────────────────

chatCommand
  .command("list")
  .description("List most recently used chats")
  .option("-n, --limit <number>", "Number of chats to show", "5")
  .option("--agent <slug>", "Filter chats to a specific agent")
  .option("--json", "Output as JSON")
  .action(async (opts: { limit?: string; agent?: string; json?: boolean }) => {
    try {
      const client = new ApiClient();
      const limit = parseInt(opts.limit ?? "5", 10);

      let items: ConversationInfo[];

      if (opts.agent) {
        // Look up agent by slug to get its ID, then list chats for that agent
        const agent = await client.call<AgentInfo>("agents.get", { slug: opts.agent });
        if (!agent?.id) {
          console.error(`Error: Agent "${opts.agent}" not found.`);
          process.exit(1);
        }
        const conversations = await client.call<ConversationInfo[]>(
          "conversations.list",
          { agentId: agent.id },
        );
        // conversations.list returns all, so we slice to limit
        items = conversations.slice(0, limit);
      } else {
        // List all chats across all agents
        const result = await client.call<{
          items: ConversationInfo[];
          nextCursor: string | null;
        }>("conversations.listAll", { limit });
        items = result.items;
      }

      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }

      if (items.length === 0) {
        console.log("No chats found.");
        return;
      }

      console.log(formatChatTable(items));
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ─── chat messages ───────────────────────────────────────────────────────────

chatCommand
  .command("messages <chat-id>")
  .description("Show recent messages in a chat")
  .option("-n, --limit <number>", "Number of messages to show", "3")
  .option("--json", "Output as JSON")
  .action(async (chatId: string, opts: { limit?: string; json?: boolean }) => {
    try {
      const client = new ApiClient();
      const limit = parseInt(opts.limit ?? "3", 10);

      const result = await client.call<{
        items: MessageInfo[];
        nextCursor: string | null;
      }>("messages.list", { conversationId: chatId, limit });

      if (opts.json) {
        console.log(JSON.stringify(result.items, null, 2));
        return;
      }

      if (result.items.length === 0) {
        console.log("No messages in this chat.");
        return;
      }

      // Messages come in desc order from the API, reverse for chronological display
      const messages = [...result.items].reverse();

      for (const msg of messages) {
        const sender = msg.senderType === "user" ? "You" : "Agent";
        const time = new Date(msg.createdAt).toLocaleString();
        console.log(`[${time}] ${sender}:`);
        console.log(`  ${msg.content}`);
        console.log();
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ─── chat rename ─────────────────────────────────────────────────────────────

chatCommand
  .command("rename <chat-id> <title>")
  .description("Rename a chat")
  .action(async (chatId: string, title: string) => {
    try {
      const client = new ApiClient();

      const result = await client.call<ConversationInfo>(
        "conversations.update",
        { id: chatId, title },
      );

      console.log(`Renamed chat to: ${result.title}`);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ─── chat send ───────────────────────────────────────────────────────────────

chatCommand
  .command("send <chat-id> <message>")
  .description("Send a message to an existing chat and print the agent response")
  .option("--as <slug>", "Identify as this agent (for agent-to-agent messaging)")
  .option("--timeout <ms>", "Response timeout in milliseconds", "120000")
  .action(
    async (
      chatId: string,
      message: string,
      opts: { as?: string; timeout?: string },
    ) => {
      const apiKey = resolveApiKey();
      if (!apiKey) {
        console.error(
          "Error: No API key found. Set MYAGENTS_API_KEY environment variable, " +
            "pass --api-key, or add it to ~/.myagents/config.json",
        );
        process.exit(1);
      }

      const serverUrl = resolveServerUrl();
      const timeout = parseInt(opts.timeout ?? "120000", 10);
      const senderAgent = opts.as ?? process.env.MYAGENTS_AGENT_SLUG;

      try {
        // Look up the chat to find the target agent slug
        const client = new ApiClient({ apiKey, serverUrl });
        const chat = await client.call<{
          id: string;
          agent?: { slug: string };
        }>("conversations.get", { id: chatId });

        if (!chat?.agent?.slug) {
          console.error("Error: Could not determine agent for this chat.");
          process.exit(1);
        }

        const response = await sendMessageToChat(
          serverUrl,
          apiKey,
          chat.agent.slug,
          chatId,
          message,
          timeout,
          senderAgent,
        );
        console.log(response);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    },
  );

// ─── chat new ────────────────────────────────────────────────────────────────

chatCommand
  .command("new <agent-slug> <message>")
  .description("Start a new chat with an agent (agent posts the first message)")
  .option("--title <title>", "Chat title (defaults to first 50 chars of message)")
  .option("--timeout <ms>", "Timeout in milliseconds", "30000")
  .option("--json", "Output result as JSON")
  .action(
    async (
      agentSlug: string,
      message: string,
      opts: { title?: string; timeout?: string; json?: boolean },
    ) => {
      const apiKey = resolveApiKey();
      if (!apiKey) {
        console.error(
          "Error: No API key found. Set MYAGENTS_API_KEY environment variable, " +
            "pass --api-key, or add it to ~/.myagents/config.json",
        );
        process.exit(1);
      }

      const serverUrl = resolveServerUrl();
      const timeout = parseInt(opts.timeout ?? "30000", 10);

      try {
        const result = await startChat(
          serverUrl,
          apiKey,
          agentSlug,
          message,
          timeout,
          opts.title,
        );

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.conversationId);
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    },
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatChatTable(chats: ConversationInfo[]): string {
  const rows: string[][] = [];
  const headers = ["ID", "TITLE", "AGENT", "LAST MESSAGE", "UPDATED"];
  rows.push(headers);

  for (const chat of chats) {
    const title = chat.title || "(untitled)";
    const agentName = chat.agent?.slug ?? "-";
    const lastMsg = chat.lastMessage
      ? truncate(chat.lastMessage.content, 40)
      : "-";
    const updated = new Date(chat.updatedAt).toLocaleString();

    rows.push([chat.id, title, agentName, lastMsg, updated]);
  }

  // Calculate column widths
  const colWidths = headers.map((_, i) =>
    Math.max(...rows.map((row) => (row[i] ?? "").length)),
  );

  return rows
    .map((row) =>
      row.map((cell, i) => (cell ?? "").padEnd(colWidths[i]!)).join("  "),
    )
    .join("\n");
}

function truncate(s: string, maxLen: number): string {
  const clean = s.replace(/\n/g, " ");
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + "...";
}

/**
 * Start a new chat via WebSocket conversation.start.
 * The agent posts the first message into a new conversation.
 */
function startChat(
  serverUrl: string,
  apiKey: string,
  agentSlug: string,
  message: string,
  timeoutMs: number,
  title?: string,
): Promise<{ conversationId: string; messageId: string }> {
  return new Promise((resolve, reject) => {
    const wsUrl = serverUrl.replace(/^http/, "ws");
    const url = new URL("/ws", wsUrl);
    url.searchParams.set("type", "client");
    url.searchParams.set("apiKey", apiKey);

    const ws = new WebSocket(url.toString());
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try {
        ws.close(1000, "Done");
      } catch {
        // ignore
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for server response"));
    }, timeoutMs);

    ws.on("open", () => {
      const frame = createRequestFrame("conversation.start", {
        agentSlug,
        content: message,
        ...(title ? { title } : {}),
      });
      ws.send(serializeFrame(frame));
    });

    ws.on("message", (data: WebSocket.RawData) => {
      const frame = parseFrame(data.toString());
      if (!frame) return;

      if (frame.method === "conversation.start" && frame.type === "res") {
        cleanup();
        if (frame.error) {
          reject(new Error(frame.error));
          return;
        }
        const payload = frame.payload as {
          conversationId?: string;
          messageId?: string;
        };
        resolve({
          conversationId: payload?.conversationId ?? "",
          messageId: payload?.messageId ?? "",
        });
      }
    });

    ws.on("error", (err: Error) => {
      cleanup();
      reject(new Error(`WebSocket error: ${err.message}`));
    });

    ws.on("close", (code: number, reason: Buffer) => {
      if (timer) clearTimeout(timer);
      if (code !== 1000) {
        reject(
          new Error(
            `WebSocket closed unexpectedly (code: ${code}, reason: ${reason.toString()})`,
          ),
        );
      }
    });
  });
}

/**
 * Send a message to an existing chat via a temporary WebSocket connection.
 * Targets an existing conversationId and streams the agent's response.
 */
function sendMessageToChat(
  serverUrl: string,
  apiKey: string,
  agentSlug: string,
  conversationId: string,
  message: string,
  timeoutMs: number,
  senderAgent?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const wsUrl = serverUrl.replace(/^http/, "ws");
    const url = new URL("/ws", wsUrl);
    url.searchParams.set("type", "client");
    url.searchParams.set("apiKey", apiKey);

    const ws = new WebSocket(url.toString());
    let fullContent = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try {
        ws.close(1000, "Done");
      } catch {
        // ignore
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for agent response"));
    }, timeoutMs);

    ws.on("open", () => {
      const payload: Record<string, string> = {
        agentSlug,
        conversationId,
        content: message,
      };

      if (senderAgent) {
        payload.senderAgent = senderAgent;
      }

      const frame = createRequestFrame("message.send", payload);
      ws.send(serializeFrame(frame));
    });

    ws.on("message", (data: WebSocket.RawData) => {
      const frame = parseFrame(data.toString());
      if (!frame) return;

      if (frame.method === "message.send" && frame.type === "res") {
        if (frame.error) {
          cleanup();
          reject(new Error(frame.error));
          return;
        }
      }

      if (frame.method === "message.chunk" && frame.type === "event") {
        const payload = frame.payload as { chunk?: string } | undefined;
        if (payload?.chunk) {
          fullContent += payload.chunk;
          process.stdout.write(payload.chunk);
        }
      }

      if (frame.method === "message.done" && frame.type === "event") {
        const payload = frame.payload as { content?: string } | undefined;
        if (payload?.content) {
          fullContent = payload.content;
        }
        cleanup();
        if (fullContent.length > 0) {
          process.stdout.write("\n");
        }
        resolve(fullContent);
      }

      if (frame.method === "message.response" && frame.type === "event") {
        const payload = frame.payload as { content?: string } | undefined;
        if (payload?.content) {
          cleanup();
          resolve(payload.content);
        }
      }
    });

    ws.on("error", (err: Error) => {
      cleanup();
      reject(new Error(`WebSocket error: ${err.message}`));
    });

    ws.on("close", (code: number, reason: Buffer) => {
      if (timer) clearTimeout(timer);
      if (!fullContent && code !== 1000) {
        reject(
          new Error(
            `WebSocket closed unexpectedly (code: ${code}, reason: ${reason.toString()})`,
          ),
        );
      }
    });
  });
}
