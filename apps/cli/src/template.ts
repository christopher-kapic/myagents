import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Variables available for template interpolation in custom agent commands.
 */
export interface TemplateVariables {
  /** The user's message text */
  message: string;
  /** Path to a temporary file containing conversation history (JSON) */
  historyFile: string;
  /** The conversation ID */
  conversationId: string;
  /** The agent's slug identifier */
  agentSlug: string;
}

/**
 * Interpolate {{var}} template variables in a command string.
 * Only known variables are replaced; unknown {{var}} patterns are left as-is.
 * Simple string replacement — no Handlebars dependency.
 */
export function interpolateTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (key in variables) {
      return variables[key as keyof TemplateVariables];
    }
    return match;
  });
}

/**
 * Write conversation history to a temporary file and return the file path.
 * The file contains a JSON array of {role, content} objects.
 */
export function writeHistoryFile(
  conversationId: string,
  history: Array<{ role: "user" | "agent"; content: string }>,
): string {
  const dir = join(tmpdir(), "myagents");
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `history-${conversationId}.json`);
  writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
  return filePath;
}

/**
 * Build the full set of template variables for a custom agent command invocation.
 */
export function buildTemplateVariables(
  message: string,
  conversationId: string,
  agentSlug: string,
  history: Array<{ role: "user" | "agent"; content: string }>,
): TemplateVariables {
  const historyFile = writeHistoryFile(conversationId, history);
  return {
    message,
    historyFile,
    conversationId,
    agentSlug,
  };
}
