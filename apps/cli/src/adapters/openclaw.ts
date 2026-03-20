import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { AgentAdapter, AgentStatus, OpenClawAdapterConfig } from "./types.js";

const DEFAULT_TIMEOUT = 120_000; // 2 minutes
const DEFAULT_GATEWAY_URL = "http://localhost:8000";

export class OpenClawAdapter implements AgentAdapter {
  private config: OpenClawAdapterConfig;
  private binaryPath: string;
  private gatewayUrl: string;
  private agentSlug: string;
  private agentId: string | undefined;

  constructor(config: OpenClawAdapterConfig = {}, agentSlug: string) {
    this.config = config;
    this.binaryPath = config.binaryPath ?? "openclaw";
    this.gatewayUrl = config.gatewayUrl ?? DEFAULT_GATEWAY_URL;
    this.agentSlug = agentSlug;
    this.agentId = config.agentId;
  }

  setAgentId(agentId: string): void {
    this.agentId = agentId;
  }

  /**
   * List available agents configured in the openclaw system.
   * Returns parsed JSON from `openclaw agents list --json`.
   */
  async listOpenClawAgents(): Promise<Array<{ id: string; name?: string; isDefault: boolean }>> {
    try {
      const output = await this.runProcess(["agents", "list", "--json"]);
      const agents = JSON.parse(output) as Array<{ id: string; name?: string; isDefault: boolean }>;
      return agents;
    } catch {
      return [];
    }
  }

  async *sendMessage(
    message: string,
    history: Array<{ role: "user" | "agent"; content: string }>,
  ): AsyncGenerator<string> {
    // Try HTTP gateway first, fall back to subprocess
    const gatewayAvailable = await this.isGatewayAvailable();

    if (gatewayAvailable) {
      yield* this.sendViaGateway(message, history);
    } else {
      yield* this.sendViaSubprocess(message);
    }
  }

  async getStatus(): Promise<AgentStatus> {
    // Check gateway first
    const gatewayAvailable = await this.isGatewayAvailable();
    if (gatewayAvailable) {
      return { available: true, message: "Connected via HTTP gateway" };
    }

    // Fall back to checking binary
    if (this.config.binaryPath && !existsSync(this.config.binaryPath)) {
      return { available: false, message: `Binary not found at ${this.config.binaryPath}` };
    }

    try {
      await this.runProcess(["--version"]);
      return { available: true, message: "Available via CLI subprocess" };
    } catch (err) {
      return {
        available: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async isGatewayAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.gatewayUrl}/v1/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async *sendViaGateway(
    message: string,
    history: Array<{ role: "user" | "agent"; content: string }>,
  ): AsyncGenerator<string> {
    const messages = [
      ...history.map((h) => ({
        role: h.role === "agent" ? "assistant" : "user",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    let response: Response;
    try {
      response = await fetch(`${this.gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          stream: true,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`OpenClaw gateway request timed out after ${DEFAULT_TIMEOUT / 1000}s`);
      }
      throw new Error(`OpenClaw gateway connection failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const body = await response.text().catch(() => "");
      throw new Error(`OpenClaw gateway error (${response.status}): ${body}`);
    }

    const body = response.body;
    if (!body) {
      clearTimeout(timeout);
      throw new Error("OpenClaw gateway returned no response body");
    }

    try {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip malformed SSE data lines
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async *sendViaSubprocess(message: string): AsyncGenerator<string> {
    const openclawAgentId = this.agentId ?? this.agentSlug;
    const output = await this.runProcess(["agent", "--agent", openclawAgentId, "--message", message, "--json"]);

    // Parse JSON output to extract the response text
    try {
      const parsed = JSON.parse(output) as { response?: string; content?: string; text?: string };
      const text = parsed.response ?? parsed.content ?? parsed.text ?? output;
      yield text;
    } catch {
      // If not valid JSON, yield raw output
      yield output;
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
          reject(new Error(`OpenClaw binary not found: ${this.binaryPath}`));
        } else if (err.message.includes("ETIMEDOUT") || err.message.includes("timed out")) {
          reject(new Error(`OpenClaw process timed out after ${DEFAULT_TIMEOUT / 1000}s`));
        } else {
          reject(new Error(`Failed to start OpenClaw: ${err.message}`));
        }
      });

      proc.on("close", (code: number | null) => {
        if (code === null) {
          reject(new Error("OpenClaw process was killed (possible timeout)"));
          return;
        }
        if (code !== 0) {
          const errorDetail = stderr.trim() || `Process exited with code ${code}`;
          reject(new Error(`OpenClaw error (exit code ${code}): ${errorDetail}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }
}
