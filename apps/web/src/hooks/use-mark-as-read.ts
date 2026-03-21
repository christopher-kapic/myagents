import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Frame } from "@myagents/shared";

import { orpc } from "@/utils/orpc";

/**
 * Marks a conversation as read when it becomes the active conversation.
 * Uses the REST API as the primary mechanism (reliable even if WS isn't
 * connected yet), and re-marks via WebSocket on each incoming message.done
 * to keep the read cursor up to date in real time.
 */
export function useMarkAsRead(
  conversationId: string,
  sendFrame: (method: Frame["method"], payload?: unknown) => string,
  subscribe: (handler: (frame: Frame) => void) => () => void,
) {
  const queryClient = useQueryClient();

  // effect:audited — marks conversation as read on open and subscribes to incoming messages
  useEffect(() => {
    // Mark read on open via REST API (reliable, doesn't depend on WS state)
    orpc.conversations.markAsRead
      .call({ id: conversationId })
      .then(() => {
        // Invalidate conversation lists so unread dots update
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey.some(
              (k) => typeof k === "string" && k.includes("conversations"),
            ),
        });
      })
      .catch(() => {
        // Fallback: try via WebSocket
        sendFrame("conversation.read", { conversationId });
      });

    // Also mark read whenever a new agent message arrives while viewing
    const unsubscribe = subscribe((frame) => {
      if (frame.method === "message.done") {
        const payload = frame.payload as { conversationId?: string };
        if (payload?.conversationId === conversationId) {
          sendFrame("conversation.read", { conversationId });
        }
      }
    });

    return unsubscribe;
  }, [conversationId, sendFrame, subscribe, queryClient]);
}
