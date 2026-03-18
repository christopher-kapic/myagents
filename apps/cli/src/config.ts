import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface CliConfig {
  apiKey?: string;
  serverUrl?: string;
  nodeId?: string;
}

const CONFIG_DIR = join(homedir(), ".myagents");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function loadConfig(): CliConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Resolve the API key from (in order of priority):
 * 1. MYAGENTS_API_KEY environment variable
 * 2. config.json file
 */
export function resolveApiKey(): string | undefined {
  return process.env["MYAGENTS_API_KEY"] ?? loadConfig().apiKey;
}

/**
 * Resolve the server URL from (in order of priority):
 * 1. MYAGENTS_SERVER_URL environment variable
 * 2. config.json file
 * 3. Default: http://localhost:3000
 */
export function resolveServerUrl(): string {
  return (
    process.env["MYAGENTS_SERVER_URL"] ??
    loadConfig().serverUrl ??
    "http://localhost:3000"
  );
}

/**
 * Get or generate a stable node ID for this machine.
 * Stored in config so it persists across restarts.
 */
export function resolveNodeId(): string {
  const envNodeId = process.env["MYAGENTS_NODE_ID"];
  if (envNodeId) return envNodeId;

  const config = loadConfig();
  if (config.nodeId) return config.nodeId;

  // Generate a new node ID and persist it
  const nodeId = crypto.randomUUID();
  saveConfig({ ...config, nodeId });
  return nodeId;
}
