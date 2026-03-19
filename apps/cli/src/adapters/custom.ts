import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentAdapter, AgentStatus, CustomAdapterConfig } from "./types.js";
import {
  interpolateTemplate,
  buildTemplateVariables,
} from "../template.js";
import { randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * Shell-escape a string for safe use in shell commands.
 * Wraps the value in single quotes and escapes any embedded single quotes.
 */
function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export class CustomAdapter implements AgentAdapter {
  private config: CustomAdapterConfig;
  private agentSlug: string;

  constructor(config: CustomAdapterConfig, agentSlug: string) {
    this.config = config;
    this.agentSlug = agentSlug;
  }

  setTimeout(timeout: number): void {
    this.config = { ...this.config, timeout };
  }

  async *sendMessage(
    message: string,
    history: Array<{ role: "user" | "agent"; content: string }>,
  ): AsyncGenerator<string> {
    const conversationId = randomUUID();
    const variables = buildTemplateVariables(
      shellEscape(message),
      conversationId,
      this.agentSlug,
      history,
    );

    const commandStr = interpolateTemplate(this.config.command, variables);
    const timeout = this.config.timeout ?? DEFAULT_TIMEOUT;

    // Environment variables — pass raw message (not shell-escaped) via env
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      MYAGENTS_MESSAGE: message,
      MYAGENTS_CONVERSATION_ID: conversationId,
      MYAGENTS_AGENT_SLUG: this.agentSlug,
      MYAGENTS_HISTORY_FILE: variables.historyFile,
    };

    if (this.config.streaming) {
      yield* this.runStreaming(commandStr, timeout, env);
    } else {
      const output = await this.runBatch(commandStr, timeout, env);
      yield output;
    }
  }

  async getStatus(): Promise<AgentStatus> {
    return { available: true, message: "Custom agent (status check not supported)" };
  }

  /**
   * Run command and yield stdout line-by-line for streaming agents.
   */
  private async *runStreaming(
    command: string,
    timeout: number,
    env: Record<string, string>,
  ): AsyncGenerator<string> {
    const proc = this.spawnCommand(command, timeout, env);

    const rl = createInterface({ input: proc.stdout! });

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Yield lines as they arrive
    const lineIterator = rl[Symbol.asyncIterator]();
    let procError: Error | null = null;

    // Listen for process errors
    proc.on("error", (err: Error) => {
      procError = this.mapProcessError(err, command);
    });

    try {
      for await (const line of lineIterator) {
        if (procError) throw procError;
        yield line + "\n";
      }
    } finally {
      rl.close();
    }

    // Wait for process exit
    const exitCode = await new Promise<number | null>((resolve) => {
      if (proc.exitCode !== null) {
        resolve(proc.exitCode);
        return;
      }
      proc.on("close", (code: number | null) => resolve(code));
    });

    if (procError) throw procError;

    if (exitCode !== null && exitCode !== 0) {
      const errorDetail = stderr.trim() || `Process exited with code ${exitCode}`;
      throw new Error(`Custom agent error (exit code ${exitCode}): ${errorDetail}`);
    }
  }

  /**
   * Run command and return full stdout output for batch agents.
   */
  private runBatch(
    command: string,
    timeout: number,
    env: Record<string, string>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = this.spawnCommand(command, timeout, env);

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err: Error) => {
        reject(this.mapProcessError(err, command));
      });

      proc.on("close", (code: number | null) => {
        if (code === null) {
          reject(new Error("Custom agent process was killed (possible timeout)"));
          return;
        }
        if (code !== 0) {
          const errorDetail = stderr.trim() || `Process exited with code ${code}`;
          reject(new Error(`Custom agent error (exit code ${code}): ${errorDetail}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  /**
   * Spawn the command, using shell mode or direct exec.
   */
  private spawnCommand(
    command: string,
    timeout: number,
    env: Record<string, string>,
  ) {
    // Always use shell to support piping, redirection, etc. in custom commands
    // The shell option uses /bin/sh -c on Unix
    return spawn(command, {
      shell: this.config.shell !== false, // default true
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      env,
    });
  }

  /**
   * Map process errors to descriptive error messages.
   */
  private mapProcessError(err: Error, command: string): Error {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return new Error(`Custom agent command not found: ${command}`);
    }
    if (err.message.includes("ETIMEDOUT") || err.message.includes("timed out")) {
      return new Error(
        `Custom agent process timed out after ${(this.config.timeout ?? DEFAULT_TIMEOUT) / 1000}s`,
      );
    }
    return new Error(`Failed to start custom agent: ${err.message}`);
  }
}
