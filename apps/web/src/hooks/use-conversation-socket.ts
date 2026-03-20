import { useEffect } from "react";
import type { Frame } from "@myagents/shared";
import type { QueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

interface ChatMessage {
  id: string;
  content: string;
  senderType: string;
  createdAt: string | Date;
  pending?: boolean;
  error?: boolean;
  openclawMeta?: {
    provider?: string;
    model?: string;
    durationMs?: number;
    tools?: Array<{ name: string }>;
    skills?: Array<{ name: string }>;
  };
}

interface UseConversationSocketOptions {
  conversationId: string;
  subscribe: (handler: (frame: Frame) => void) => () => void;
  queryClient: QueryClient;
  setLocalMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setSending: React.Dispatch<React.SetStateAction<boolean>>;
  scrollToBottom: () => void;
}

/**
 * Subscribes to WebSocket events for a conversation and updates local state
 * accordingly (streaming chunks, done, errors, cross-device sync, cancel, queue).
 */
export function useConversationSocket({
  conversationId,
  subscribe,
  queryClient,
  setLocalMessages,
  setSending,
  scrollToBottom,
}: UseConversationSocketOptions) {
  useEffect(() => {
    const unsubscribe = subscribe((frame) => {
      // Handle message.new — a message sent from another device/browser
      if (frame.method === "message.new") {
        const payload = frame.payload as {
          conversationId?: string;
          messageId?: string;
          content?: string;
          senderType?: string;
          createdAt?: string;
        };
        if (payload?.conversationId === conversationId && payload.content) {
          setLocalMessages((prev) => {
            if (prev.some((m) => m.id === payload.messageId)) return prev;
            return [
              ...prev,
              {
                id: payload.messageId ?? `remote-${Date.now()}`,
                content: payload.content!,
                senderType: payload.senderType ?? "user",
                createdAt: payload.createdAt ?? new Date().toISOString(),
              },
            ];
          });
          if (payload.senderType === "user") {
            setSending(true);
          }
        }
      }

      // Handle streaming chunks — append to pending agent message
      if (frame.method === "message.chunk") {
        const payload = frame.payload as {
          conversationId?: string;
          chunk?: string;
        };
        if (payload?.conversationId === conversationId && payload.chunk !== undefined) {
          setLocalMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.senderType === "agent" && last.pending) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + payload.chunk },
              ];
            }
            return [
              ...prev,
              {
                id: `streaming-${Date.now()}`,
                content: payload.chunk!,
                senderType: "agent",
                createdAt: new Date().toISOString(),
                pending: true,
              },
            ];
          });
          requestAnimationFrame(() => {
            scrollToBottom();
          });
        }
      }

      // Handle message.done — finalize the pending streaming message or add new
      if (frame.method === "message.done") {
        const payload = frame.payload as {
          conversationId?: string;
          messageId?: string;
          content?: string;
          error?: boolean;
          openclawMeta?: ChatMessage["openclawMeta"];
        };
        if (payload?.conversationId === conversationId && payload.content) {
          setLocalMessages((prev) => {
            const lastIdx = prev.length - 1;
            const last = prev[lastIdx];
            if (last && last.senderType === "agent" && last.pending) {
              return [
                ...prev.slice(0, lastIdx),
                {
                  ...last,
                  id: payload.messageId ?? last.id,
                  content: payload.content!,
                  pending: false,
                  error: payload.error || undefined,
                  openclawMeta: payload.openclawMeta,
                },
              ];
            }
            return [
              ...prev,
              {
                id: payload.messageId ?? crypto.randomUUID(),
                content: payload.content!,
                senderType: "agent",
                createdAt: new Date().toISOString(),
                error: payload.error || undefined,
                openclawMeta: payload.openclawMeta,
              },
            ];
          });
          setSending(false);
          if (!payload.error) {
            queryClient.invalidateQueries({
              queryKey: orpc.conversations.list.queryOptions({
                input: { agentId: "" },
              }).queryKey[0]
                ? undefined
                : undefined,
            });
          }
        }
      }

      // Handle error responses from message.send
      if (
        frame.method === "message.send" &&
        frame.type === "res" &&
        frame.error
      ) {
        setLocalMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            content: frame.error ?? "Failed to send message",
            senderType: "agent",
            createdAt: new Date().toISOString(),
            error: true,
          },
        ]);
        setSending(false);
      }

      // Handle streaming error
      if (
        frame.method === "message.response" &&
        frame.type === "res" &&
        frame.error
      ) {
        const payload = frame.payload as { conversationId?: string };
        if (!payload?.conversationId || payload.conversationId === conversationId) {
          setLocalMessages((prev) => {
            const lastIdx = prev.length - 1;
            const last = prev[lastIdx];
            if (last && last.senderType === "agent" && last.pending) {
              return [
                ...prev.slice(0, lastIdx),
                {
                  ...last,
                  content:
                    last.content +
                    "\n\n[Error: " +
                    (frame.error ?? "Stream interrupted") +
                    "]",
                  pending: false,
                  error: true,
                },
              ];
            }
            return [
              ...prev,
              {
                id: `error-${Date.now()}`,
                content: frame.error ?? "Stream error",
                senderType: "agent",
                createdAt: new Date().toISOString(),
                error: true,
              },
            ];
          });
          setSending(false);
        }
      }

      // Handle message.cancel
      if (frame.method === "message.cancel") {
        const payload = frame.payload as { conversationId?: string };
        if (payload?.conversationId === conversationId) {
          setLocalMessages((prev) => {
            const lastIdx = prev.length - 1;
            const last = prev[lastIdx];
            if (last && last.senderType === "agent" && last.pending) {
              return [
                ...prev.slice(0, lastIdx),
                { ...last, pending: false },
              ];
            }
            return prev;
          });
          setSending(false);
          queryClient.invalidateQueries({
            queryKey: orpc.queuedMessages.list.queryOptions({
              input: { conversationId },
            }).queryKey,
          });
        }
      }

      // Handle queue.dequeued
      if (frame.method === "queue.dequeued") {
        const payload = frame.payload as { conversationId?: string };
        if (payload?.conversationId === conversationId) {
          queryClient.invalidateQueries({
            queryKey: orpc.queuedMessages.list.queryOptions({
              input: { conversationId },
            }).queryKey,
          });
        }
      }
    });

    return unsubscribe;
  }, [conversationId, subscribe, queryClient, setLocalMessages, setSending, scrollToBottom]);
}
