import { Button } from "@myagents/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@myagents/ui/components/dialog";
import { Input } from "@myagents/ui/components/input";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bot, MessageSquare, Search, Trash2, X } from "lucide-react";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/conversations")({
  component: ConversationsPage,
});

function ConversationsPage() {
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const isSearching = search.trim().length > 0;
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery(
    orpc.conversations.listAll.queryOptions(),
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpc.conversations.delete.call({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.conversations.key(),
      });
      setDeleteTarget(null);
    },
  });

  const searchQuery = useQuery({
    ...orpc.conversations.search.queryOptions({
      input: {
        query: search.trim(),
        agentId: agentFilter || undefined,
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo: dateTo
          ? new Date(dateTo + "T23:59:59").toISOString()
          : undefined,
      },
    }),
    enabled: isSearching,
  });

  const agentsQuery = useQuery(orpc.agents.list.queryOptions());

  const conversations = (conversationsQuery.data?.items ?? []) as Array<
    Record<string, unknown>
  >;

  const searchResults = (searchQuery.data?.items ?? []) as Array<
    Record<string, unknown>
  >;

  const agents = [
    ...((agentsQuery.data?.own ?? []) as Array<Record<string, unknown>>),
    ...((agentsQuery.data?.sharedWithMe ?? []) as Array<Record<string, unknown>>),
  ];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="mt-1 text-muted-foreground">
          Recent conversations across all agents
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {isSearching ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All agents</option>
          {agents.map((agent) => (
            <option key={String(agent.id)} value={String(agent.id)}>
              {String(agent.name)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="To"
        />
      </div>

      {isSearching ? (
        <SearchResults
          results={searchResults}
          isLoading={searchQuery.isLoading}
          query={search.trim()}
        />
      ) : conversationsQuery.isLoading ? (
        <ConversationsSkeleton />
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">No conversations yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Start a conversation from an agent&apos;s detail page
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
            const hasUnread = conv.hasUnread === true;

            const title = conv.title
              ? String(conv.title)
              : "Untitled conversation";

            return (
              <div
                key={String(conv.id)}
                className="flex items-center gap-2 rounded-lg border p-4 transition-colors hover:bg-accent/50"
              >
                <Link
                  to="/agents/$slug/conversations/$id"
                  params={{ slug: agentSlug, id: String(conv.id) }}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                    <Bot className="h-5 w-5 text-muted-foreground" />
                    {hasUnread ? (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${hasUnread ? "font-semibold" : "font-medium"}`}>{title}</p>
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
                        <span className={`text-xs truncate ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          &middot;{" "}
                          {lastMessage.senderType === "user"
                            ? "You: "
                            : "Agent: "}
                          {String(lastMessage.content)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setDeleteTarget({ id: String(conv.id), title })
                  }
                  className="shrink-0 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <DeleteConversationDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

function DeleteConversationDialog({
  target,
  onClose,
  onConfirm,
  isPending,
}: {
  target: { id: string; title: string } | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const displayTitle = target?.title ?? "";
  const isConfirmed = confirmText === displayTitle;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setConfirmText("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Conversation</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the
            conversation and all its messages.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-sm">
            Type{" "}
            <span className="inline-flex items-center gap-1">
              <span className="font-mono font-medium text-foreground">
                {displayTitle}
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(displayTitle)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Copy to clipboard"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>
            </span>{" "}
            to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={displayTitle}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!isConfirmed || isPending}
            onClick={onConfirm}
          >
            {isPending ? "Deleting..." : "Delete Conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SearchResults({
  results,
  isLoading,
  query,
}: {
  results: Array<Record<string, unknown>>;
  isLoading: boolean;
  query: string;
}) {
  if (isLoading) {
    return <ConversationsSkeleton />;
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Search className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-1">No results found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          No messages matching &ldquo;{query}&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground mb-3">
        {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;
        {query}&rdquo;
      </p>
      {results.map((result) => {
        const createdAt = result.createdAt
          ? new Date(String(result.createdAt))
          : null;
        const agentSlug = String(result.agentSlug);

        return (
          <Link
            key={String(result.id)}
            to="/agents/$slug/conversations/$id"
            params={{
              slug: agentSlug,
              id: String(result.conversationId),
            }}
            className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
              <Bot className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">
                  {result.conversationTitle
                    ? String(result.conversationTitle)
                    : "Untitled conversation"}
                </p>
                {createdAt ? (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(createdAt)}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground font-mono">
                  {String(result.agentName)}
                </span>
                <span className="text-xs text-muted-foreground">
                  &middot;{" "}
                  {result.senderType === "user" ? "You" : "Agent"}
                </span>
              </div>
              <p className="text-sm mt-1 text-muted-foreground line-clamp-2">
                <HighlightedText
                  text={String(result.content)}
                  query={query}
                />
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-yellow-200 dark:bg-yellow-900/50 text-foreground rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
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
