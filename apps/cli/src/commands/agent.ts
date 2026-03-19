import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import WebSocket from "ws";
import {
  parseFrame,
  serializeFrame,
  createRequestFrame,
} from "@myagents/shared";
import { ApiClient } from "../api-client.js";
import { updateAgentConfig } from "../agent-config.js";
import { resolveApiKey, resolveServerUrl } from "../config.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  shared?: boolean;
  node?: { id: string; name: string; status: string } | null;
  user?: { username?: string | null } | null;
}

interface AgentListResult {
  own: AgentInfo[];
  shared: AgentInfo[];
}

// ─── Agent Command ───────────────────────────────────────────────────────────

export const agentCommand = new Command("agent")
  .description("Manage agents: list, send messages, add/remove custom agents");

// ─── agent list ──────────────────────────────────────────────────────────────

agentCommand
  .command("list")
  .description("List all agents from the server")
  .option("--type <type>", "Filter by type (hermes/openclaw/custom)")
  .option("--status <status>", "Filter by status (online/offline)")
  .option("--search <query>", "Search agents by name/slug/description")
  .option("--json", "Output as JSON")
  .action(async (opts: { type?: string; status?: string; search?: string; json?: boolean }) => {
    try {
      const client = new ApiClient();

      const input: Record<string, string> = {};
      if (opts.type) input.type = opts.type;
      if (opts.status) input.status = opts.status;
      if (opts.search) input.search = opts.search;

      const result = await client.call<AgentListResult>(
        "agents.list",
        Object.keys(input).length > 0 ? input : undefined,
      );

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      // Display own agents
      if (result.own.length === 0 && result.shared.length === 0) {
        console.log("No agents found.");
        return;
      }

      if (result.own.length > 0) {
        console.log("Your Agents:");
        console.log(formatAgentTable(result.own));
      }

      if (result.shared.length > 0) {
        if (result.own.length > 0) console.log();
        console.log("Shared with you:");
        console.log(formatAgentTable(result.shared, true));
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ─── agent send ──────────────────────────────────────────────────────────────

agentCommand
  .command("send <slug> <message>")
  .description("Send a message to an agent and print the response (slug can be username/slug for cross-user agents)")
  .option("--server <url>", "Server URL (overrides env/config)")
  .option("--api-key <key>", "API key (overrides env/config)")
  .option("--timeout <ms>", "Response timeout in milliseconds", "120000")
  .option("--as <slug>", "Identify as this agent (for agent-to-agent messaging)")
  .action(
    async (
      slug: string,
      message: string,
      opts: { server?: string; apiKey?: string; timeout?: string; as?: string },
    ) => {
      const apiKey = opts.apiKey ?? resolveApiKey();
      if (!apiKey) {
        console.error(
          "Error: No API key found. Set MYAGENTS_API_KEY environment variable, " +
            "pass --api-key, or add it to ~/.myagents/config.json",
        );
        process.exit(1);
      }

      const serverUrl = opts.server ?? resolveServerUrl();
      const timeout = parseInt(opts.timeout ?? "120000", 10);

      // Resolve sender agent identity: --as flag takes priority, then MYAGENTS_AGENT_SLUG env var
      const senderAgent = opts.as ?? process.env.MYAGENTS_AGENT_SLUG;

      try {
        const response = await sendMessageViaWebSocket(
          serverUrl,
          apiKey,
          slug,
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

// ─── agent add ───────────────────────────────────────────────────────────────

agentCommand
  .command("add")
  .description("Add a custom agent to ~/.myagents/agents.yaml")
  .option("--slug <slug>", "Agent slug")
  .option("--name <name>", "Agent display name")
  .option("--description <desc>", "Agent description")
  .option("--command <cmd>", "Command to run the agent")
  .option("--shell", "Use shell execution (default: true)")
  .option("--streaming", "Enable streaming output")
  .option("--timeout <ms>", "Command timeout in milliseconds")
  .action(
    async (opts: {
      slug?: string;
      name?: string;
      description?: string;
      command?: string;
      shell?: boolean;
      streaming?: boolean;
      timeout?: string;
    }) => {
      try {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const ask = (question: string, defaultValue?: string): Promise<string> =>
          new Promise((resolve) => {
            const prompt = defaultValue
              ? `${question} [${defaultValue}]: `
              : `${question}: `;
            rl.question(prompt, (answer) => {
              resolve(answer.trim() || defaultValue || "");
            });
          });

        const slug = opts.slug || (await ask("Agent slug (e.g., my-agent)"));
        if (!slug) {
          console.error("Error: slug is required.");
          rl.close();
          process.exit(1);
        }
        if (!/^[a-zA-Z0-9-]+$/.test(slug)) {
          console.error("Error: slug must match [a-zA-Z0-9-]+");
          rl.close();
          process.exit(1);
        }

        const name = opts.name || (await ask("Display name", slug));
        const description =
          opts.description || (await ask("Description (optional)"));
        const command =
          opts.command ||
          (await ask('Command (e.g., my-tool chat "{{message}}")'));
        if (!command) {
          console.error("Error: command is required.");
          rl.close();
          process.exit(1);
        }

        const streamingStr =
          opts.streaming !== undefined
            ? String(opts.streaming)
            : await ask("Streaming output? (true/false)", "false");
        const streaming = streamingStr === "true";

        const timeoutStr =
          opts.timeout || (await ask("Timeout in ms (optional)", "120000"));
        const timeoutMs = parseInt(timeoutStr, 10) || 120000;

        rl.close();

        // Write to agents.yaml
        addAgentToYaml({
          slug,
          name,
          description: description || undefined,
          command,
          shell: true,
          streaming,
          timeout: timeoutMs,
        });

        console.log(`\nAgent "${name}" (${slug}) added to ~/.myagents/agents.yaml`);
        console.log(
          'Run "myagents connect" to register it with the server.',
        );
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    },
  );

// ─── agent remove ────────────────────────────────────────────────────────────

agentCommand
  .command("remove <slug>")
  .description("Remove a custom agent from agents.yaml and unregister from server")
  .option("--local-only", "Only remove from local config, don't unregister from server")
  .action(async (slug: string, opts: { localOnly?: boolean }) => {
    try {
      const removed = removeAgentFromYaml(slug);

      if (removed) {
        console.log(`Removed "${slug}" from ~/.myagents/agents.yaml`);
      } else {
        console.log(`Agent "${slug}" not found in ~/.myagents/agents.yaml`);
      }

      if (!opts.localOnly) {
        // Try to unregister from server via API
        try {
          const client = new ApiClient();

          // First get the agent to find its ID
          const agent = await client.call<AgentInfo>("agents.get", { slug });
          if (agent?.id) {
            await client.call("agents.remove", { id: agent.id });
            console.log(`Unregistered "${slug}" from server.`);
          }
        } catch {
          // Server unregistration is best-effort
          if (!removed) {
            console.log(`Agent "${slug}" not found on server either.`);
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ─── agent rename ───────────────────────────────────────────────────────────

agentCommand
  .command("rename <old-slug> <new-slug>")
  .description("Rename an agent's slug (updates server and local agents.yaml)")
  .action(async (oldSlug: string, newSlug: string) => {
    try {
      if (!/^[a-zA-Z0-9-]+$/.test(newSlug)) {
        console.error("Error: new slug must match [a-zA-Z0-9-]+");
        process.exit(1);
      }

      const client = new ApiClient();

      // Find the agent by its current slug
      const agent = await client.call<AgentInfo>("agents.get", { slug: oldSlug });
      if (!agent?.id) {
        console.error(`Error: Agent "${oldSlug}" not found on server.`);
        process.exit(1);
      }

      // Update slug on server
      await client.call("agents.update", { id: agent.id, slug: newSlug });
      console.log(`Renamed "${oldSlug}" → "${newSlug}" on server.`);

      // Update local agents.yaml if the agent is defined there
      const changes = updateAgentConfig(oldSlug, { newSlug });
      if (changes.length > 0) {
        console.log(`Updated local config: ${changes.join(", ")}`);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAgentTable(agents: AgentInfo[], showOwner = false): string {
  const rows: string[][] = [];
  const headers = ["SLUG", "NAME", "TYPE", "STATUS", "NODE"];
  if (showOwner) headers.splice(0, 0, "OWNER");

  rows.push(headers);

  for (const agent of agents) {
    const row = [
      agent.slug,
      agent.name,
      agent.type,
      agent.status,
      agent.node?.name ?? "-",
    ];
    if (showOwner) {
      const username = agent.user?.username ?? "?";
      row.splice(0, 0, username);
    }
    rows.push(row);
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

/**
 * Send a message to an agent via a temporary WebSocket client connection
 * and wait for the full response.
 */
function sendMessageViaWebSocket(
  serverUrl: string,
  apiKey: string,
  agentSlug: string,
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
      // Build payload — include sender/target agent identity for agent-to-agent messaging
      const payload: Record<string, string> = {
        agentSlug,
        content: message,
      };

      // For cross-user agents (username/slug format), set targetAgent explicitly
      if (agentSlug.includes("/")) {
        payload.targetAgent = agentSlug;
      }

      // Include sender agent identity if provided (--as flag or MYAGENTS_AGENT_SLUG env var)
      if (senderAgent) {
        payload.senderAgent = senderAgent;
      }

      const frame = createRequestFrame("message.send", payload);
      ws.send(serializeFrame(frame));
    });

    ws.on("message", (data: WebSocket.RawData) => {
      const frame = parseFrame(data.toString());
      if (!frame) return;

      // Handle response to our message.send
      if (frame.method === "message.send" && frame.type === "res") {
        if (frame.error) {
          cleanup();
          reject(new Error(frame.error));
          return;
        }
        const payload = frame.payload as { conversationId?: string } | undefined;
        // conversationId confirmed — subsequent events are for our message
        void payload?.conversationId;
      }

      // Handle streaming chunks
      if (frame.method === "message.chunk" && frame.type === "event") {
        const payload = frame.payload as { chunk?: string; conversationId?: string } | undefined;
        if (payload?.chunk) {
          fullContent += payload.chunk;
          // Write chunk to stdout for real-time display
          process.stdout.write(payload.chunk);
        }
      }

      // Handle final response
      if (frame.method === "message.done" && frame.type === "event") {
        const payload = frame.payload as { content?: string } | undefined;
        if (payload?.content) {
          // Use server's authoritative content
          fullContent = payload.content;
        }
        cleanup();
        // Add newline after streaming output
        if (fullContent.length > 0) {
          process.stdout.write("\n");
        }
        resolve(fullContent);
      }

      // Handle error responses
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

// ─── YAML Helpers ────────────────────────────────────────────────────────────

const AGENTS_YAML_PATH = join(homedir(), ".myagents", "agents.yaml");

interface CustomAgentConfig {
  slug: string;
  name: string;
  description?: string;
  command: string;
  shell: boolean;
  streaming: boolean;
  timeout: number;
}

/**
 * Add a custom agent entry to ~/.myagents/agents.yaml.
 * Creates the file if it doesn't exist.
 */
function addAgentToYaml(config: CustomAgentConfig): void {
  mkdirSync(join(homedir(), ".myagents"), { recursive: true });

  let existing = "";
  if (existsSync(AGENTS_YAML_PATH)) {
    existing = readFileSync(AGENTS_YAML_PATH, "utf-8");
  }

  // Check if agent already exists
  if (existing.includes(`slug: ${config.slug}`) || existing.includes(`slug: "${config.slug}"`)) {
    throw new Error(`Agent "${config.slug}" already exists in agents.yaml`);
  }

  // Build YAML entry
  const entry = buildAgentYamlEntry(config);

  // Append to file
  if (!existing.trim()) {
    // New file — add header
    writeFileSync(AGENTS_YAML_PATH, `agents:\n${entry}`, "utf-8");
  } else {
    // Append to existing file
    const content = existing.endsWith("\n") ? existing : existing + "\n";
    writeFileSync(AGENTS_YAML_PATH, content + entry, "utf-8");
  }
}

function buildAgentYamlEntry(config: CustomAgentConfig): string {
  let yaml = `  - slug: ${config.slug}\n`;
  yaml += `    name: ${quoteIfNeeded(config.name)}\n`;
  if (config.description) {
    yaml += `    description: ${quoteIfNeeded(config.description)}\n`;
  }
  yaml += `    adapter:\n`;
  yaml += `      command: ${quoteIfNeeded(config.command)}\n`;
  yaml += `      shell: ${config.shell}\n`;
  yaml += `      streaming: ${config.streaming}\n`;
  yaml += `      timeout: ${config.timeout}\n`;
  return yaml;
}

function quoteIfNeeded(s: string): string {
  // Quote if contains special YAML characters
  if (/[:#{}[\],&*?|>!%@`'"]/.test(s) || s.includes("{{")) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Remove a custom agent from ~/.myagents/agents.yaml by slug.
 * Returns true if the agent was found and removed.
 */
function removeAgentFromYaml(slug: string): boolean {
  if (!existsSync(AGENTS_YAML_PATH)) return false;

  const content = readFileSync(AGENTS_YAML_PATH, "utf-8");
  const lines = content.split("\n");

  let found = false;
  let inTarget = false;
  const outputLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check if this line starts a new agent entry
    if (/^\s*-\s+slug:\s*/.test(line)) {
      const match = line.match(/slug:\s*"?([^"\s]+)"?/);
      if (match?.[1] === slug) {
        inTarget = true;
        found = true;
        continue; // Skip this line
      }
      inTarget = false;
    }

    if (inTarget) {
      // Skip lines that belong to the target agent (indented, not a new entry)
      if (/^\s{4,}/.test(line) && !/^\s*-\s+/.test(line)) {
        continue;
      }
      // New entry or non-indented line — stop skipping
      inTarget = false;
    }

    outputLines.push(line);
  }

  if (found) {
    writeFileSync(AGENTS_YAML_PATH, outputLines.join("\n"), "utf-8");
  }

  return found;
}
