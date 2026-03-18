/**
 * Status information for an agent.
 */
export interface AgentStatus {
  available: boolean;
  message?: string;
}

/**
 * Interface that all agent adapters must implement.
 * Adapters bridge the CLI to specific agent runtimes (Hermes, OpenClaw, custom).
 */
export interface AgentAdapter {
  /**
   * Send a message to the agent and receive a streaming response.
   * @param message - The user's message text
   * @param history - Previous messages in the conversation for context
   * @returns An async generator yielding response text chunks
   */
  sendMessage(
    message: string,
    history: Array<{ role: "user" | "agent"; content: string }>,
  ): AsyncGenerator<string>;

  /**
   * Check the agent's current availability and status.
   */
  getStatus(): Promise<AgentStatus>;
}

/**
 * Adapter configuration stored in the agent's adapterConfig field.
 */
export interface HermesAdapterConfig {
  binaryPath?: string;
  configPath?: string;
  toolsets?: string[];
}

export interface OpenClawAdapterConfig {
  binaryPath?: string;
  configPath?: string;
  gatewayUrl?: string;
}

export interface CustomAdapterConfig {
  command: string;
  shell?: boolean;
  streaming?: boolean;
  timeout?: number;
}
