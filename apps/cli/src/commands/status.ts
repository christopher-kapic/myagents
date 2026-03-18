import { Command } from "commander";
import { ApiClient } from "../api-client.js";
import { resolveApiKey, resolveServerUrl, loadConfig } from "../config.js";

interface AgentInfo {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  node?: { id: string; name: string; status: string } | null;
}

interface AgentListResult {
  own: AgentInfo[];
  shared: AgentInfo[];
}

export const statusCommand = new Command("status")
  .description("Show connection status and list agents with their online/offline status")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    const apiKey = resolveApiKey();
    const serverUrl = resolveServerUrl();
    const config = loadConfig();

    if (!apiKey) {
      console.error(
        "Error: No API key configured. Set MYAGENTS_API_KEY or add apiKey to ~/.myagents/config.json",
      );
      process.exit(1);
    }

    // Check server connectivity
    let serverReachable = false;
    let agents: AgentListResult | null = null;

    try {
      const client = new ApiClient({ serverUrl, apiKey });
      agents = await client.call<AgentListResult>("agents.list");
      serverReachable = true;
    } catch {
      serverReachable = false;
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            server: {
              url: serverUrl,
              reachable: serverReachable,
            },
            nodeId: config.nodeId ?? null,
            agents: agents ?? { own: [], shared: [] },
          },
          null,
          2,
        ),
      );
      return;
    }

    // Display status
    console.log("MyAgents Status");
    console.log("═══════════════════════════════════════");
    console.log(`Server:   ${serverUrl}`);
    console.log(`Status:   ${serverReachable ? "✓ Connected" : "✗ Unreachable"}`);
    console.log(`Node ID:  ${config.nodeId ?? "(not set)"}`);
    console.log();

    if (!serverReachable) {
      console.log("Cannot reach server. Is it running?");
      return;
    }

    if (!agents || (agents.own.length === 0 && agents.shared.length === 0)) {
      console.log("No agents registered.");
      return;
    }

    if (agents.own.length > 0) {
      console.log("Your Agents:");
      console.log("───────────────────────────────────────");
      for (const agent of agents.own) {
        const statusIcon = agent.status === "online" ? "●" : "○";
        const nodeInfo = agent.node ? ` (node: ${agent.node.name})` : "";
        console.log(`  ${statusIcon} ${agent.name} [${agent.slug}] — ${agent.type}, ${agent.status}${nodeInfo}`);
      }
    }

    if (agents.shared.length > 0) {
      console.log();
      console.log("Shared Agents:");
      console.log("───────────────────────────────────────");
      for (const agent of agents.shared) {
        const statusIcon = agent.status === "online" ? "●" : "○";
        console.log(`  ${statusIcon} ${agent.name} [${agent.slug}] — ${agent.type}, ${agent.status}`);
      }
    }

    // Summary
    const totalOwn = agents.own.length;
    const onlineOwn = agents.own.filter((a) => a.status === "online").length;
    console.log();
    console.log(`Total: ${totalOwn} agent(s), ${onlineOwn} online`);
  });
