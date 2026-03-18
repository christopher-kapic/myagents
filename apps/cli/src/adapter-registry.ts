import type { DetectedAgent } from "./scanner.js";
import type { AgentAdapter } from "./adapters/types.js";
import { HermesAdapter } from "./adapters/hermes.js";
import { OpenClawAdapter } from "./adapters/openclaw.js";
import { CustomAdapter } from "./adapters/custom.js";

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
      }, agent.slug);
    case "openclaw":
      return new OpenClawAdapter({
        binaryPath: config.binaryPath as string | undefined,
        configPath: config.configPath as string | undefined,
        gatewayUrl: config.gatewayUrl as string | undefined,
      }, agent.slug);
    case "custom": {
      const command = config.command as string | undefined;
      if (!command) {
        console.warn(`Custom agent "${agent.slug}" has no command configured — skipping adapter.`);
        return null;
      }
      return new CustomAdapter(
        {
          command,
          shell: (config.shell as boolean | undefined) ?? true,
          streaming: (config.streaming as boolean | undefined) ?? false,
          timeout: config.timeout as number | undefined,
        },
        agent.slug,
      );
    }
    default:
      return null;
  }
}
