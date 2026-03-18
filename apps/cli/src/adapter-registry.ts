import type { DetectedAgent } from "./scanner.js";
import type { AgentAdapter } from "./adapters/types.js";
import { HermesAdapter } from "./adapters/hermes.js";

/**
 * Create the appropriate adapter for a detected agent based on its type.
 * Returns null if no adapter is available for the agent type.
 */
export function createAdapter(agent: DetectedAgent): AgentAdapter | null {
  const config = agent.adapterConfig ?? {};

  switch (agent.type) {
    case "hermes":
      return new HermesAdapter({
        binaryPath: config.binaryPath as string | undefined,
        configPath: config.configPath as string | undefined,
        toolsets: config.toolsets as string[] | undefined,
      });
    case "openclaw":
      // OpenClaw adapter will be implemented in US-014
      return null;
    case "custom":
      // Custom adapter will be implemented in US-023
      return null;
    default:
      return null;
  }
}
