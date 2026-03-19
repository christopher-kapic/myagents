import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { AgentAdapter, AgentStatus, HermesAdapterConfig } from "./types.js";

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
    _history: Array<{ role: "user" | "agent"; content: string }>,
  ): AsyncGenerator<string> {
    const args = ["chat", "-q", message, "--quiet"];

    // Support --toolsets passthrough from adapter config
    if (this.config.toolsets && this.config.toolsets.length > 0) {
      args.push("--toolsets", this.config.toolsets.join(","));
    }

    const output = await this.runProcess(args);
    yield output;
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
