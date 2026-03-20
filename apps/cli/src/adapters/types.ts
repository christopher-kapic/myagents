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
export interface MessageContext {
  /** The conversation ID from the server, used for session tracking */
  conversationId?: string;
}

export interface AgentAdapter {
  /**
   * Send a message to the agent and receive a streaming response.
   * @param message - The user's message text
   * @param history - Previous messages in the conversation for context
   * @param context - Additional context (conversation ID, etc.)
   * @returns An async generator yielding response text chunks
   */
  sendMessage(
    message: string,
    history: Array<{ role: "user" | "agent"; content: string }>,
    context?: MessageContext,
  ): AsyncGenerator<string>;

  /**
   * Check the agent's current availability and status.
   */
  getStatus(): Promise<AgentStatus>;

  /**
   * Update the adapter's timeout at runtime (e.g. when pushed from the web UI).
   */
  setTimeout?(timeout: number): void;
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
  agentId?: string;
}

export interface CustomAdapterConfig {
  command: string;
  shell?: boolean;
  streaming?: boolean;
  timeout?: number;
}
