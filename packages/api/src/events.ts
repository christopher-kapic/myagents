import { EventEmitter } from "node:events";

export interface AgentConfigUpdateEvent {
  agentId: string;
  nodeId: string;
  oldSlug: string;
  newSlug?: string;
  timeout?: number;
  name?: string;
  description?: string;
  openclawAgentId?: string;
}

class ApiEvents extends EventEmitter {
  emitAgentConfigUpdate(event: AgentConfigUpdateEvent) {
    this.emit("agent.configUpdate", event);
  }

  onAgentConfigUpdate(handler: (event: AgentConfigUpdateEvent) => void) {
    this.on("agent.configUpdate", handler);
  }
}

export const apiEvents = new ApiEvents();
