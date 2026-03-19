import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const AGENTS_YAML_PATH = join(homedir(), ".myagents", "agents.yaml");

/**
 * Ensure that scanner-detected agents are persisted to agents.yaml so that
 * subsequent config updates from the web UI can find and modify them.
 */
export function ensureAgentsInYaml(
  agents: Array<{
    slug: string;
    name: string;
    description?: string;
    type: string;
    adapterConfig?: Record<string, unknown>;
  }>,
): void {
  mkdirSync(dirname(AGENTS_YAML_PATH), { recursive: true });

  let content: string;
  if (existsSync(AGENTS_YAML_PATH)) {
    content = readFileSync(AGENTS_YAML_PATH, "utf-8");
  } else {
    content = "agents:\n";
  }

  let added = false;

  for (const agent of agents) {
    // Check if slug already exists using same pattern as renameAgentInYaml
    const escaped = agent.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `^\\s*-\\s+slug:\\s*"?${escaped}"?\\s*$`,
      "m",
    );

    if (pattern.test(content)) continue;

    // Build the YAML entry
    let entry = `  - slug: ${agent.slug}\n`;
    entry += `    name: ${agent.name}\n`;
    if (agent.description) {
      entry += `    description: ${agent.description}\n`;
    }
    entry += `    type: ${agent.type}\n`;
    entry += `    adapter:\n`;

    if (agent.adapterConfig) {
      for (const [key, value] of Object.entries(agent.adapterConfig)) {
        entry += `      ${key}: ${value}\n`;
      }
    }

    content += entry;
    added = true;
  }

  if (added) {
    writeFileSync(AGENTS_YAML_PATH, content, "utf-8");
  }
}

/**
 * Update an agent's local configuration (agents.yaml) when the server
 * pushes a config change. Returns a list of changes that were applied.
 */
export function updateAgentConfig(
  oldSlug: string,
  updates: { newSlug?: string; timeout?: number; name?: string; description?: string },
): string[] {
  const changes: string[] = [];

  if (updates.newSlug && updates.newSlug !== oldSlug) {
    if (renameAgentInYaml(oldSlug, updates.newSlug)) {
      changes.push(`slug: ${oldSlug} → ${updates.newSlug}`);
    }
  }

  const slugForUpdates = updates.newSlug ?? oldSlug;

  if (updates.timeout !== undefined) {
    if (updateTimeoutInYaml(slugForUpdates, updates.timeout)) {
      changes.push(`timeout: ${updates.timeout}ms`);
    }
  }

  if (updates.name !== undefined) {
    if (updateNameInYaml(slugForUpdates, updates.name)) {
      changes.push(`name: ${updates.name}`);
    }
  }

  if (updates.description !== undefined) {
    if (updateDescriptionInYaml(slugForUpdates, updates.description)) {
      changes.push(`description: ${updates.description}`);
    }
  }

  return changes;
}

/**
 * Rename an agent's slug in ~/.myagents/agents.yaml.
 */
function renameAgentInYaml(oldSlug: string, newSlug: string): boolean {
  if (!existsSync(AGENTS_YAML_PATH)) return false;

  const content = readFileSync(AGENTS_YAML_PATH, "utf-8");

  // Match slug lines like "  - slug: old-slug" or "  - slug: "old-slug""
  const escaped = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(^\\s*-\\s+slug:\\s*)"?${escaped}"?\\s*$`,
    "m",
  );

  if (!pattern.test(content)) return false;

  const updated = content.replace(pattern, `$1${newSlug}`);
  writeFileSync(AGENTS_YAML_PATH, updated, "utf-8");
  return true;
}

/**
 * Update an agent's timeout in ~/.myagents/agents.yaml.
 * Looks for the agent entry by slug, then finds/updates the timeout line
 * within its adapter block.
 */
function updateTimeoutInYaml(slug: string, timeout: number): boolean {
  if (!existsSync(AGENTS_YAML_PATH)) return false;

  const content = readFileSync(AGENTS_YAML_PATH, "utf-8");
  const lines = content.split("\n");

  let inTargetAgent = false;
  let inAdapter = false;
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // New agent entry?
    if (/^\s*-\s+slug:\s*/.test(line)) {
      const match = line.match(/slug:\s*"?([^"\s]+)"?/);
      inTargetAgent = match?.[1] === slug;
      inAdapter = false;
      continue;
    }

    if (!inTargetAgent) continue;

    // Entered adapter section?
    if (/^\s+adapter:\s*$/.test(line)) {
      inAdapter = true;
      continue;
    }

    // Hit a non-indented line or new entry — stop
    if (/^\s*-\s+/.test(line) || /^\S/.test(line)) {
      break;
    }

    // Update timeout line within adapter block
    if (inAdapter && /^\s+timeout:\s*/.test(line)) {
      lines[i] = line.replace(/timeout:\s*\d+/, `timeout: ${timeout}`);
      modified = true;
      break;
    }
  }

  if (modified) {
    writeFileSync(AGENTS_YAML_PATH, lines.join("\n"), "utf-8");
  }
  return modified;
}

/**
 * Update an agent's name in ~/.myagents/agents.yaml.
 * Finds the agent entry by slug, then finds/updates the name line.
 */
function updateNameInYaml(slug: string, name: string): boolean {
  if (!existsSync(AGENTS_YAML_PATH)) return false;

  const content = readFileSync(AGENTS_YAML_PATH, "utf-8");
  const lines = content.split("\n");

  let inTargetAgent = false;
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // New agent entry?
    if (/^\s*-\s+slug:\s*/.test(line)) {
      const match = line.match(/slug:\s*"?([^"\s]+)"?/);
      inTargetAgent = match?.[1] === slug;
      continue;
    }

    if (!inTargetAgent) continue;

    // Hit a new entry or non-indented line — stop
    if (/^\s*-\s+/.test(line) || /^\S/.test(line)) {
      break;
    }

    // Update name line within the agent entry
    if (/^\s+name:\s*/.test(line)) {
      lines[i] = line.replace(/name:\s*.*$/, `name: ${name}`);
      modified = true;
      break;
    }
  }

  if (modified) {
    writeFileSync(AGENTS_YAML_PATH, lines.join("\n"), "utf-8");
  }
  return modified;
}

/**
 * Update an agent's description in ~/.myagents/agents.yaml.
 * Finds the agent entry by slug, then finds/updates the description line.
 */
function updateDescriptionInYaml(slug: string, description: string): boolean {
  if (!existsSync(AGENTS_YAML_PATH)) return false;

  const content = readFileSync(AGENTS_YAML_PATH, "utf-8");
  const lines = content.split("\n");

  let inTargetAgent = false;
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // New agent entry?
    if (/^\s*-\s+slug:\s*/.test(line)) {
      const match = line.match(/slug:\s*"?([^"\s]+)"?/);
      inTargetAgent = match?.[1] === slug;
      continue;
    }

    if (!inTargetAgent) continue;

    // Hit a new entry or non-indented line — stop
    if (/^\s*-\s+/.test(line) || /^\S/.test(line)) {
      break;
    }

    // Update description line within the agent entry
    if (/^\s+description:\s*/.test(line)) {
      lines[i] = line.replace(/description:\s*.*$/, `description: ${description}`);
      modified = true;
      break;
    }
  }

  if (modified) {
    writeFileSync(AGENTS_YAML_PATH, lines.join("\n"), "utf-8");
  }
  return modified;
}
