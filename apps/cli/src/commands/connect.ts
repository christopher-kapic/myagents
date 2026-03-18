import { Command } from "commander";
import { resolveApiKey, resolveServerUrl, resolveNodeId } from "../config.js";
import { WsClient } from "../ws-client.js";
import type { Frame } from "@myagents/shared";

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

    console.log(`Connecting to ${serverUrl}...`);
    console.log(`Node ID: ${nodeId}`);

    const client = new WsClient({
      serverUrl,
      apiKey,
      nodeId,
      onOpen() {
        console.log("Connected to server.");
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

function handleFrame(frame: Frame, client: WsClient): void {
  switch (frame.method) {
    case "message.send": {
      // Server is forwarding a user message to this node's agent
      // For now, acknowledge receipt — actual agent adapters will handle this in US-013/014
      console.log(`Received message for agent: ${JSON.stringify(frame.payload)}`);
      client.sendResponse("message.response", {
        conversationId: (frame.payload as Record<string, unknown>)?.["conversationId"] ?? "",
        content: "Agent adapter not yet configured.",
      }, frame.id);
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
