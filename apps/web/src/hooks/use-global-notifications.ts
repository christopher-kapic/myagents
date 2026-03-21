import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Frame } from "@myagents/shared";

import { playSound } from "@/lib/sound-engine";
import { impactWoodLight003Sound } from "@/lib/impact-wood-light-003";
import { orpc } from "@/utils/orpc";

/**
 * Global listener for agent messages. When a message.done arrives for a
 * conversation that is NOT currently open, play a sound and show a toast.
 * Also invalidates conversation list queries so unread dots update.
 */
export function useGlobalNotifications(
  subscribe: (handler: (frame: Frame) => void) => () => void,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams({ strict: false }) as { id?: string };
  const activeConversationIdRef = useRef<string | undefined>(params.id);

  // Keep ref in sync without re-subscribing
  // effect:audited — syncs route param to ref without re-subscribing the WS listener
  useEffect(() => {
    activeConversationIdRef.current = params.id;
  }, [params.id]);

  // effect:audited — subscribes to external WebSocket event stream
  useEffect(() => {
    const invalidateConversations = () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey.some(
            (k) => typeof k === "string" && k.includes("conversations"),
          ),
      });
    };

    const unsubscribe = subscribe((frame) => {
      // When a conversation is marked as read, refresh conversation lists
      // so unread dots disappear
      if (frame.method === "conversation.read") {
        invalidateConversations();
        return;
      }

      if (frame.method !== "message.done") return;

      const payload = frame.payload as {
        conversationId?: string;
        content?: string;
        error?: boolean;
        agentSlug?: string;
      };

      if (!payload?.conversationId || !payload.content || payload.error) return;

      // Skip if this conversation is currently open
      if (payload.conversationId === activeConversationIdRef.current) return;

      // Play notification sound
      void playSound(impactWoodLight003Sound.dataUri, { volume: 0.6 });

      // Show toast with truncated preview — clicking navigates to the conversation
      const preview =
        payload.content.length > 100
          ? payload.content.slice(0, 100) + "..."
          : payload.content;

      const conversationId = payload.conversationId;
      const agentSlug = payload.agentSlug;

      toast("New agent message", {
        description: preview,
        ...(agentSlug
          ? {
              action: {
                label: "View",
                onClick: () => {
                  router.navigate({
                    to: "/agents/$slug/conversations/$id",
                    params: { slug: agentSlug, id: conversationId },
                  });
                },
              },
            }
          : {}),
      });

      // Invalidate conversation lists so unread dots appear
      invalidateConversations();
    });

    return unsubscribe;
  }, [subscribe, queryClient, router]);
}
