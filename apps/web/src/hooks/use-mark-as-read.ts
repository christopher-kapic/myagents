import { useEffect } from "react";
import type { Frame } from "@myagents/shared";

/**
 * Marks a conversation as read when it becomes the active conversation.
 * Sends a conversation.read frame via WebSocket and re-sends on each
 * incoming message.done to keep the read cursor up to date.
 */
export function useMarkAsRead(
  conversationId: string,
  sendFrame: (method: Frame["method"], payload?: unknown) => string,
  subscribe: (handler: (frame: Frame) => void) => () => void,
) {
  useEffect(() => {
    // Mark read on open
    sendFrame("conversation.read", { conversationId });

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
  }, [conversationId, sendFrame, subscribe]);
}
