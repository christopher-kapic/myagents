import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const AGENTS_YAML_PATH = join(homedir(), ".myagents", "agents.yaml");

/**
 * Update an agent's local configuration (agents.yaml) when the server
 * pushes a config change. Returns a list of changes that were applied.
 */
export function updateAgentConfig(
  oldSlug: string,
  updates: { newSlug?: string; timeout?: number },
): string[] {
  const changes: string[] = [];

  if (updates.newSlug && updates.newSlug !== oldSlug) {
    if (renameAgentInYaml(oldSlug, updates.newSlug)) {
      changes.push(`slug: ${oldSlug} → ${updates.newSlug}`);
    }
  }

  const slugForTimeout = updates.newSlug ?? oldSlug;
  if (updates.timeout !== undefined) {
    if (updateTimeoutInYaml(slugForTimeout, updates.timeout)) {
      changes.push(`timeout: ${updates.timeout}ms`);
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
