import { z } from "zod/v4";

// ─── Frame Types ────────────────────────────────────────────────────────────

export const FrameType = z.enum(["req", "res", "event"]);
export type FrameType = z.infer<typeof FrameType>;

export const FrameMethod = z.enum([
  "auth",
  "message.send",
  "message.response",
  "message.chunk",
  "message.done",
  "agent.register",
  "agent.heartbeat",
  "agent.status",
  "agent.list",
]);
export type FrameMethod = z.infer<typeof FrameMethod>;

// ─── Base Frame Schema ──────────────────────────────────────────────────────

export const FrameSchema = z.object({
  type: FrameType,
  id: z.string(),
  method: FrameMethod,
  payload: z.unknown().optional(),
  error: z.string().optional(),
});

export type Frame = z.infer<typeof FrameSchema>;

// ─── Method-specific Payload Schemas ────────────────────────────────────────

export const AuthPayload = z.object({
  apiKey: z.string().optional(),
  nodeId: z.string().optional(),
});
export type AuthPayload = z.infer<typeof AuthPayload>;

export const MessageSendPayload = z.object({
  conversationId: z.string().optional(),
  agentSlug: z.string(),
  content: z.string(),
  senderAgent: z.string().optional(),
  targetAgent: z.string().optional(),
});
export type MessageSendPayload = z.infer<typeof MessageSendPayload>;

export const MessageResponsePayload = z.object({
  conversationId: z.string(),
  messageId: z.string().optional(),
  content: z.string(),
});
export type MessageResponsePayload = z.infer<typeof MessageResponsePayload>;

export const MessageChunkPayload = z.object({
  conversationId: z.string(),
  chunk: z.string(),
});
export type MessageChunkPayload = z.infer<typeof MessageChunkPayload>;

export const MessageDonePayload = z.object({
  conversationId: z.string(),
  messageId: z.string().optional(),
  content: z.string(),
});
export type MessageDonePayload = z.infer<typeof MessageDonePayload>;

export const AgentRegisterPayload = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(["hermes", "openclaw", "custom"]),
  adapterConfig: z.record(z.string(), z.unknown()).optional(),
});
export type AgentRegisterPayload = z.infer<typeof AgentRegisterPayload>;

export const AgentHeartbeatPayload = z.object({
  nodeId: z.string(),
  agents: z.array(z.string()).optional(),
});
export type AgentHeartbeatPayload = z.infer<typeof AgentHeartbeatPayload>;

export const AgentStatusPayload = z.object({
  agentSlug: z.string(),
  status: z.enum(["online", "offline"]),
});
export type AgentStatusPayload = z.infer<typeof AgentStatusPayload>;

export const AgentListPayload = z.object({
  senderAgentSlug: z.string().optional(),
});
export type AgentListPayload = z.infer<typeof AgentListPayload>;

// ─── Frame Parsing ──────────────────────────────────────────────────────────

export function parseFrame(data: string | ArrayBuffer): Frame | null {
  try {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    const parsed: unknown = JSON.parse(text);
    const result = FrameSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

export function createFrame(
  type: FrameType,
  method: FrameMethod,
  payload?: unknown,
  id?: string,
  error?: string,
): Frame {
  return {
    type,
    id: id ?? crypto.randomUUID(),
    method,
    payload,
    error,
  };
}

export function serializeFrame(frame: Frame): string {
  return JSON.stringify(frame);
}

// ─── Helper: Create specific frame types ────────────────────────────────────

export function createRequestFrame(method: FrameMethod, payload?: unknown, id?: string): Frame {
  return createFrame("req", method, payload, id);
}

export function createResponseFrame(method: FrameMethod, payload?: unknown, id?: string, error?: string): Frame {
  return createFrame("res", method, payload, id, error);
}

export function createEventFrame(method: FrameMethod, payload?: unknown): Frame {
  return createFrame("event", method, payload);
}
