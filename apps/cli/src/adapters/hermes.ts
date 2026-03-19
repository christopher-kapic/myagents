import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentAdapter, AgentStatus, HermesAdapterConfig, MessageContext } from "./types.js";

const SESSION_MAP_PATH = join(homedir(), ".myagents", "hermes-sessions.json");

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * Process raw terminal output to handle carriage returns and ANSI escape codes.
 * Terminals use \r to overwrite the current line (e.g., spinners), but when
 * captured as a string and displayed in a web UI, every frame appears as a
 * separate line. This simulates terminal behavior by keeping only the final
 * state of each line after \r processing.
 */
function cleanTerminalOutput(raw: string): string {
  // Strip ANSI escape codes (colors, cursor movement, etc.)
  const stripped = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");

  // Process carriage returns: split into lines, then for each line
  // keep only the text after the last \r (simulating terminal overwrite)
  return stripped
    .split("\n")
    .map((line) => {
      const parts = line.split("\r");
      // The last non-empty segment is what the terminal would display
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].trim()) return parts[i];
      }
      return "";
    })
    .filter((line) => line.trim())
    .join("\n");
}

/**
 * Parse the hermes session_id from stdout output.
 * Hermes outputs `session_id: <id>` as the last line in quiet mode.
 */
function parseSessionId(output: string): { response: string; sessionId: string | null } {
  const match = output.match(/\nsession_id:\s*(\S+)\s*$/);
  if (match) {
    return {
      response: output.slice(0, match.index).trimEnd(),
      sessionId: match[1],
    };
  }
  return { response: output, sessionId: null };
}

export class HermesAdapter implements AgentAdapter {
  private config: HermesAdapterConfig;
  private binaryPath: string;
  private agentSlug: string;

  constructor(config: HermesAdapterConfig = {}, agentSlug: string) {
    this.config = config;
    this.binaryPath = config.binaryPath ?? "hermes";
    this.agentSlug = agentSlug;
  }

  async *sendMessage(
    message: string,
    history: Array<{ role: "user" | "agent"; content: string }>,
    context?: MessageContext,
  ): AsyncGenerator<string> {
    // When resuming a conversation, prepend history as context so the LLM
    // has the full conversation regardless of hermes' internal session state.
    const prompt = this.buildPromptWithHistory(message, history);
    const args = ["chat", "-q", prompt, "--quiet"];

    // Resume existing hermes session if we have one for this conversation
    const conversationId = context?.conversationId;
    if (conversationId) {
      const existingSessionId = this.getSessionId(conversationId);
      if (existingSessionId) {
        args.push("--resume", existingSessionId);
      }
    }

    // Support --toolsets passthrough from adapter config
    if (this.config.toolsets && this.config.toolsets.length > 0) {
      args.push("--toolsets", this.config.toolsets.join(","));
    }

    const rawOutput = await this.runProcess(args);

    // Parse and store the session_id for future messages in this conversation
    const { response, sessionId } = parseSessionId(rawOutput);
    if (sessionId && conversationId) {
      this.setSessionId(conversationId, sessionId);
    }

    yield response;
  }

  async getStatus(): Promise<AgentStatus> {
    // Check if the binary is available
    if (this.config.binaryPath && !existsSync(this.config.binaryPath)) {
      return { available: false, message: `Binary not found at ${this.config.binaryPath}` };
    }

    try {
      // Try running hermes with --version or similar to check availability
      await this.runProcess(["--version"]);
      return { available: true };
    } catch (err) {
      return {
        available: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Build a prompt that includes conversation history as context.
   * Only prepends history when there are prior messages to provide context.
   */
  private buildPromptWithHistory(
    message: string,
    history: Array<{ role: "user" | "agent"; content: string }>,
  ): string {
    // No history or only the current message — send as-is
    if (history.length <= 1) return message;

    // Exclude the last entry (the current user message, which is already `message`)
    const prior = history.slice(0, -1);
    if (prior.length === 0) return message;

    const formatted = prior
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    return `<conversation_history>\n${formatted}\n</conversation_history>\n\n${message}`;
  }

  private getSessionId(conversationId: string): string | undefined {
    if (!existsSync(SESSION_MAP_PATH)) return undefined;
    const map = JSON.parse(readFileSync(SESSION_MAP_PATH, "utf-8"));
    return map[conversationId];
  }

  private setSessionId(conversationId: string, sessionId: string): void {
    let map: Record<string, string> = {};
    if (existsSync(SESSION_MAP_PATH)) {
      map = JSON.parse(readFileSync(SESSION_MAP_PATH, "utf-8"));
    }
    map[conversationId] = sessionId;
    mkdirSync(join(homedir(), ".myagents"), { recursive: true });
    writeFileSync(SESSION_MAP_PATH, JSON.stringify(map, null, 2));
  }

  private runProcess(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binaryPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: DEFAULT_TIMEOUT,
        env: {
          ...process.env,
          MYAGENTS_AGENT_SLUG: this.agentSlug,
        },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err: Error) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error(`Hermes binary not found: ${this.binaryPath}`));
        } else if (err.message.includes("ETIMEDOUT") || err.message.includes("timed out")) {
          reject(new Error(`Hermes process timed out after ${DEFAULT_TIMEOUT / 1000}s`));
        } else {
          reject(new Error(`Failed to start Hermes: ${err.message}`));
        }
      });

      proc.on("close", (code: number | null) => {
        if (code === null) {
          reject(new Error("Hermes process was killed (possible timeout)"));
          return;
        }
        if (code !== 0) {
          const errorDetail = stderr.trim() || `Process exited with code ${code}`;
          reject(new Error(`Hermes error (exit code ${code}): ${errorDetail}`));
          return;
        }
        resolve(cleanTerminalOutput(stdout).trim());
      });
    });
  }
}
