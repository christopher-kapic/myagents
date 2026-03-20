import { resolveApiKey, resolveServerUrl } from "./config.js";

/**
 * Simple HTTP client for calling the oRPC server API from the CLI.
 * Uses API key auth via Authorization: Bearer header.
 */
export class ApiClient {
  private serverUrl: string;
  private apiKey: string;

  constructor(opts?: { serverUrl?: string; apiKey?: string }) {
    const apiKey = opts?.apiKey ?? resolveApiKey();
    if (!apiKey) {
      throw new Error(
        "No API key found. Set MYAGENTS_API_KEY environment variable, " +
          "or add it to ~/.myagents/config.json",
      );
    }
    this.apiKey = apiKey;
    this.serverUrl = opts?.serverUrl ?? resolveServerUrl();
  }

  /**
   * Call an oRPC procedure via HTTP.
   * @param path - Dot-separated procedure path (e.g., "agents.list")
   * @param input - Optional input payload
   */
  async call<T = unknown>(path: string, input?: unknown): Promise<T> {
    // oRPC RPC handler uses "/" as separator in URL path
    const urlPath = path.replace(/\./g, "/");
    const url = `${this.serverUrl}/rpc/${urlPath}`;

    // oRPC's RPC protocol expects the body wrapped as { json: <input> }
    const body =
      input !== undefined ? JSON.stringify({ json: input }) : undefined;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API error (${res.status}): ${text || res.statusText}`);
    }

    // oRPC wraps responses as { json: <output>, meta?: [...] }
    const data = await res.json();
    return (data as { json: T }).json;
  }
}
