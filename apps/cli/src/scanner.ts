import { execSync, execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface DetectedAgent {
  slug: string;
  name: string;
  description?: string;
  type: "hermes" | "openclaw" | "custom";
  adapterConfig?: Record<string, unknown>;
}

/**
 * Scan for all detectable agents on this machine.
 * Checks for Hermes, OpenClaw, and custom agents from ~/.myagents/agents.yaml.
 */
export function scanForAgents(): DetectedAgent[] {
  const agents: DetectedAgent[] = [];

  const hermes = detectHermes();
  if (hermes) {
    agents.push(hermes);
    console.log(`  Detected Hermes agent`);
  }

  const openclaw = detectOpenClaw();
  if (openclaw) {
    agents.push(openclaw);
    console.log(`  Detected OpenClaw agent`);
  }

  const custom = detectCustomAgents();
  for (const agent of custom) {
    agents.push(agent);
    console.log(`  Detected custom agent: ${agent.name} (${agent.slug})`);
  }

  return agents;
}

/**
 * Detect Hermes agent by checking:
 * 1. `which hermes` — is the binary available?
 * 2. ~/.hermes/config.yaml — does the config exist?
 */
function detectHermes(): DetectedAgent | null {
  const binaryExists = commandExists("hermes");
  const configPath = join(homedir(), ".hermes", "config.yaml");
  const configExists = existsSync(configPath);

  if (!binaryExists && !configExists) {
    return null;
  }

  return {
    slug: "hermes",
    name: "Hermes",
    description: "Hermes AI agent",
    type: "hermes",
    adapterConfig: {
      binaryPath: binaryExists ? findBinaryPath("hermes") : undefined,
      configPath: configExists ? configPath : undefined,
    },
  };
}

/**
 * Detect OpenClaw agent by checking:
 * 1. `which openclaw` — is the binary available?
 * 2. ~/.openclaw/config.json — does the config exist?
 */
function detectOpenClaw(): DetectedAgent | null {
  const binaryExists = commandExists("openclaw");
  const configPath = join(homedir(), ".openclaw", "config.json");
  const configExists = existsSync(configPath);

  if (!binaryExists && !configExists) {
    return null;
  }

  const binaryPath = binaryExists ? findBinaryPath("openclaw") : undefined;

  // Discover available openclaw agents
  let availableAgents: Array<{ id: string; name?: string; isDefault: boolean }> = [];
  let defaultAgentId: string | undefined;
  if (binaryPath) {
    try {
      const output = execSync(`${binaryPath} agents list --json`, {
        encoding: "utf-8",
        timeout: 10_000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      availableAgents = JSON.parse(output);
      const defaultAgent = availableAgents.find((a) => a.isDefault);
      if (defaultAgent) {
        defaultAgentId = defaultAgent.id;
      }
    } catch {
      // Ignore — agents list is optional
    }
  }

  return {
    slug: "openclaw",
    name: "OpenClaw",
    description: "OpenClaw AI agent",
    type: "openclaw",
    adapterConfig: {
      binaryPath,
      configPath: configExists ? configPath : undefined,
      ...(availableAgents.length > 0 ? { availableAgents } : {}),
      ...(defaultAgentId ? { agentId: defaultAgentId } : {}),
    },
  };
}

/**
 * Detect custom agents from ~/.myagents/agents.yaml.
 * Uses a simple YAML parser (key: value per line) to avoid external dependencies.
 */
function detectCustomAgents(): DetectedAgent[] {
  const agentsFile = join(homedir(), ".myagents", "agents.yaml");
  if (!existsSync(agentsFile)) {
    return [];
  }

  try {
    const content = readFileSync(agentsFile, "utf-8");
    return parseAgentsYaml(content);
  } catch (err) {
    console.warn(`  Warning: Failed to parse ${agentsFile}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

/**
 * Simple YAML parser for agents.yaml.
 * Supports a list of agents with flat key-value pairs and nested adapter config.
 *
 * Expected format:
 * ```yaml
 * agents:
 *   - slug: my-agent
 *     name: My Agent
 *     description: A custom agent
 *     adapter:
 *       command: my-agent chat "{{message}}"
 *       shell: true
 *       streaming: false
 *       timeout: 30000
 * ```
 */
function parseAgentsYaml(content: string): DetectedAgent[] {
  const agents: DetectedAgent[] = [];
  const lines = content.split("\n");

  let currentAgent: Partial<DetectedAgent> | null = null;
  let inAdapter = false;
  let adapterConfig: Record<string, unknown> = {};

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    // New agent entry (starts with "  - " or "- ")
    if (/^\s*-\s+\w+:/.test(line)) {
      // Save previous agent
      if (currentAgent?.slug && currentAgent?.name) {
        agents.push(finalizeAgent(currentAgent, adapterConfig));
      }
      currentAgent = {};
      adapterConfig = {};
      inAdapter = false;

      // Parse the first key on the same line as the dash
      const match = line.match(/^\s*-\s+(\w+):\s*(.*)/);
      if (match?.[1] && match[2] !== undefined) {
        setAgentField(currentAgent, match[1], match[2].trim());
      }
      continue;
    }

    if (!currentAgent) continue;

    // Check for adapter section
    if (/^\s+adapter:\s*$/.test(line)) {
      inAdapter = true;
      continue;
    }

    // Adapter nested key
    if (inAdapter && /^\s{6,}\w+:/.test(line)) {
      const match = line.match(/^\s+(\w+):\s*(.*)/);
      if (match?.[1] && match[2] !== undefined) {
        adapterConfig[match[1]] = parseYamlValue(match[2].trim());
      }
      continue;
    }

    // Regular agent key (not inside adapter)
    if (/^\s{4,}\w+:/.test(line) && !inAdapter) {
      const match = line.match(/^\s+(\w+):\s*(.*)/);
      if (match?.[1] && match[2] !== undefined) {
        setAgentField(currentAgent, match[1], match[2].trim());
        continue;
      }
    }

    // If we hit a non-adapter key while in adapter mode, exit adapter
    if (inAdapter && /^\s{4}\w+:/.test(line)) {
      inAdapter = false;
      const match = line.match(/^\s+(\w+):\s*(.*)/);
      if (match?.[1] && match[2] !== undefined) {
        setAgentField(currentAgent, match[1], match[2].trim());
      }
    }
  }

  // Save last agent
  if (currentAgent?.slug && currentAgent?.name) {
    agents.push(finalizeAgent(currentAgent, adapterConfig));
  }

  return agents;
}

function setAgentField(agent: Partial<DetectedAgent>, key: string, value: string): void {
  switch (key) {
    case "slug":
      agent.slug = unquote(value);
      break;
    case "name":
      agent.name = unquote(value);
      break;
    case "description":
      agent.description = unquote(value);
      break;
  }
}

function finalizeAgent(
  partial: Partial<DetectedAgent>,
  adapterConfig: Record<string, unknown>,
): DetectedAgent {
  return {
    slug: partial.slug!,
    name: partial.name!,
    description: partial.description,
    type: "custom",
    adapterConfig: Object.keys(adapterConfig).length > 0 ? adapterConfig : undefined,
  };
}

function parseYamlValue(value: string): unknown {
  const unquoted = unquote(value);
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  if (/^\d+$/.test(unquoted)) return parseInt(unquoted, 10);
  return unquoted;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findBinaryPath(cmd: string): string | undefined {
  try {
    return execSync(`which ${cmd}`, { encoding: "utf-8" }).trim();
  } catch {
    return undefined;
  }
}
