import { Skeleton } from "@myagents/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bot, MessageSquare } from "lucide-react";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/conversations")({
  component: ConversationsPage,
});

function ConversationsPage() {
  const conversationsQuery = useQuery(
    orpc.conversations.listAll.queryOptions(),
  );

  const conversations = (conversationsQuery.data?.items ?? []) as Array<
    Record<string, unknown>
  >;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="mt-1 text-muted-foreground">
          Recent conversations across all agents
        </p>
      </div>

      {conversationsQuery.isLoading ? (
        <ConversationsSkeleton />
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">No conversations yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Start a conversation from an agent's detail page
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {conversations.map((conv) => {
            const agent = conv.agent as Record<string, unknown> | undefined;
            const lastMessage = conv.lastMessage as Record<
              string,
              unknown
            > | null;
            const updatedAt = conv.updatedAt
              ? new Date(String(conv.updatedAt))
              : null;
            const agentSlug = agent ? String(agent.slug) : "";

            return (
              <Link
                key={String(conv.id)}
                to="/agents/$slug/conversations/$id"
                params={{ slug: agentSlug, id: String(conv.id) }}
                className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                  <Bot className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">
                      {conv.title
                        ? String(conv.title)
                        : "Untitled conversation"}
                    </p>
                    {updatedAt ? (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelativeTime(updatedAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {agent ? (
                      <span className="text-xs text-muted-foreground font-mono">
                        {String(agent.name)}
                      </span>
                    ) : null}
                    {lastMessage ? (
                      <span className="text-xs text-muted-foreground truncate">
                        &middot;{" "}
                        {lastMessage.senderType === "user" ? "You: " : "Agent: "}
                        {String(lastMessage.content)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConversationsSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border p-4"
        >
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
