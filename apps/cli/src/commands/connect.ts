import { Command } from "commander";
import { resolveApiKey, resolveServerUrl, resolveNodeId } from "../config.js";
import { WsClient } from "../ws-client.js";
import { scanForAgents, type DetectedAgent } from "../scanner.js";
import { createAdapter } from "../adapter-registry.js";
import type { AgentAdapter } from "../adapters/types.js";
import type { Frame } from "@myagents/shared";

/** Map of agent slug → adapter instance, populated after agent detection */
const agentAdapters = new Map<string, AgentAdapter>();

export const connectCommand = new Command("connect")
  .description("Connect this machine to the MyAgents server via WebSocket")
  .option("--api-key <key>", "API key (overrides env/config)")
  .option("--server <url>", "Server URL (overrides env/config)")
  .option("--node-id <id>", "Node ID (overrides env/config)")
  .action(async (opts: { apiKey?: string; server?: string; nodeId?: string }) => {
    const apiKey = opts.apiKey ?? resolveApiKey();
    if (!apiKey) {
      console.error(
        "Error: No API key found. Set MYAGENTS_API_KEY environment variable, " +
          "pass --api-key, or add it to ~/.myagents/config.json",
      );
      process.exit(1);
    }

    const serverUrl = opts.server ?? resolveServerUrl();
    const nodeId = opts.nodeId ?? resolveNodeId();

    // Scan for agents before connecting
    console.log("Scanning for agents...");
    const detectedAgents = scanForAgents();

    if (detectedAgents.length === 0) {
      console.log("No agents detected on this machine.");
    } else {
      console.log(`Found ${detectedAgents.length} agent(s).`);
    }

    // Create adapters for detected agents
    for (const agent of detectedAgents) {
      const adapter = createAdapter(agent);
      if (adapter) {
        agentAdapters.set(agent.slug, adapter);
        console.log(`  Adapter created for ${agent.name} (${agent.type})`);
      }
    }

    console.log(`Connecting to ${serverUrl}...`);
    console.log(`Node ID: ${nodeId}`);

    const client = new WsClient({
      serverUrl,
      apiKey,
      nodeId,
      onOpen() {
        console.log("Connected to server.");

        // Register detected agents with the server
        if (detectedAgents.length > 0) {
          registerAgents(client, detectedAgents);
        }

        console.log("Waiting for messages... (Ctrl+C to disconnect)");
      },
      onFrame(frame: Frame) {
        handleFrame(frame, client);
      },
      onClose(code: number, reason: string) {
        console.log(`Disconnected (code: ${code}, reason: ${reason})`);
      },
      onError(error: Error) {
        // Only log if not a connection refused (those are handled by reconnect)
        if (!error.message.includes("ECONNREFUSED")) {
          console.error(`WebSocket error: ${error.message}`);
        }
      },
    });

    client.connect();

    // Handle graceful shutdown
    const shutdown = () => {
      console.log("\nDisconnecting...");
      client.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

/**
 * Register detected agents with the server via WebSocket.
 */
function registerAgents(client: WsClient, agents: DetectedAgent[]): void {
  for (const agent of agents) {
    console.log(`Registering agent: ${agent.name} (${agent.slug})`);
    client.sendRequest("agent.register", {
      slug: agent.slug,
      name: agent.name,
      description: agent.description,
      type: agent.type,
      adapterConfig: agent.adapterConfig,
    });
  }
}

function handleFrame(frame: Frame, client: WsClient): void {
  switch (frame.method) {
    case "message.send": {
      const payload = frame.payload as Record<string, unknown>;
      const agentSlug = payload?.["agentSlug"] as string | undefined;
      const message = payload?.["content"] as string | undefined;
      const conversationId = payload?.["conversationId"] as string | undefined;

      console.log(`Received message for agent "${agentSlug}": ${message?.slice(0, 80)}`);

      if (!agentSlug || !message) {
        client.sendResponse("message.response", {
          conversationId: conversationId ?? "",
          content: "Invalid message: missing agentSlug or content.",
        }, frame.id);
        break;
      }

      const adapter = agentAdapters.get(agentSlug);
      if (!adapter) {
        client.sendResponse("message.response", {
          conversationId: conversationId ?? "",
          content: `No adapter configured for agent "${agentSlug}".`,
        }, frame.id);
        break;
      }

      // Process message asynchronously through the adapter
      void processMessage(adapter, message, conversationId ?? "", agentSlug, frame.id, client);
      break;
    }
    case "agent.status": {
      console.log(`Agent status update: ${JSON.stringify(frame.payload)}`);
      break;
    }
    default: {
      // Log unexpected frames for debugging
      if (frame.type === "res" && frame.error) {
        console.error(`Server error: ${frame.error}`);
      }
      break;
    }
  }
}

/**
 * Process a message through an agent adapter and send response chunks back.
 */
async function processMessage(
  adapter: AgentAdapter,
  message: string,
  conversationId: string,
  agentSlug: string,
  frameId: string,
  client: WsClient,
): Promise<void> {
  try {
    let fullContent = "";

    for await (const chunk of adapter.sendMessage(message, [])) {
      fullContent += chunk;

      // Send chunk for streaming display
      client.sendRequest("message.chunk", {
        conversationId,
        agentSlug,
        chunk,
      });
    }

    // Send the final done message
    client.sendRequest("message.done", {
      conversationId,
      agentSlug,
      content: fullContent,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Error processing message for ${agentSlug}: ${errorMessage}`);

    client.sendResponse("message.response", {
      conversationId,
      content: `Error from agent "${agentSlug}": ${errorMessage}`,
    }, frameId);
  }
}
