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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@myagents/ui/components/sheet";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { createContext, useContext, useState } from "react";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/agents/$slug/conversations")({
  component: ConversationsLayout,
});

const ConversationSidebarContext = createContext<{
  openDrawer: () => void;
}>({ openDrawer: () => {} });

export function useConversationSidebar() {
  return useContext(ConversationSidebarContext);
}

function ConversationsLayout() {
  const { slug } = Route.useParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Get agentId from agent query
  const agentQuery = useQuery(
    orpc.agents.get.queryOptions({ input: { slug } }),
  );
  const agent = agentQuery.data as Record<string, unknown> | undefined;
  const agentId = agent ? String(agent.id) : "";

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-72 lg:w-80 md:shrink-0 md:flex-col md:border-r">
        {agentId ? (
          <SidebarContent agentId={agentId} slug={slug} />
        ) : (
          <SidebarSkeleton />
        )}
      </div>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-80 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          {agentId ? (
            <SidebarContent
              agentId={agentId}
              slug={slug}
              onSelect={() => setDrawerOpen(false)}
            />
          ) : (
            <SidebarSkeleton />
          )}
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <ConversationSidebarContext.Provider
        value={{ openDrawer: () => setDrawerOpen(true) }}
      >
        <div className="flex-1 min-w-0 flex flex-col">
          <Outlet />
        </div>
      </ConversationSidebarContext.Provider>
    </div>
  );
}

function SidebarContent({
  agentId,
  slug,
  onSelect,
}: {
  agentId: string;
  slug: string;
  onSelect?: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeConversationId = useActiveConversationId();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const conversationsQuery = useQuery(
    orpc.conversations.list.queryOptions({ input: { agentId } }),
  );

  const createMutation = useMutation({
    mutationFn: () => orpc.conversations.create.call({ agentId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: orpc.conversations.list.queryOptions({ input: { agentId } })
          .queryKey,
      });
      const conv = data as Record<string, unknown>;
      navigate({
        to: "/agents/$slug/conversations/$id",
        params: { slug, id: String(conv.id) },
      });
      onSelect?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpc.conversations.delete.call({ id }),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({
        queryKey: orpc.conversations.key(),
      });
      setDeleteTarget(null);
      // If the deleted conversation was active, navigate to the agent page
      if (deletedId === activeConversationId) {
        navigate({ to: "/agents/$slug", params: { slug } });
      }
    },
  });

  const conversations = (conversationsQuery.data ?? []) as Array<
    Record<string, unknown>
  >;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button
          size="sm"
          className="w-full"
          onClick={() => createMutation.mutateAsync()}
          disabled={createMutation.isPending}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversationsQuery.isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-md p-3">
                <Skeleton className="h-4 w-32 mb-1.5" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No conversations yet
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {conversations.map((conv) => {
              const isActive = String(conv.id) === activeConversationId;
              const lastMessage = conv.lastMessage as Record<
                string,
                unknown
              > | null;
              const updatedAt = conv.updatedAt
                ? new Date(String(conv.updatedAt))
                : null;
              const hasUnread = !isActive && conv.hasUnread === true;

              const convTitle = conv.title
                ? String(conv.title)
                : "Untitled conversation";

              return (
                <div
                  key={String(conv.id)}
                  className={`group flex items-center rounded-md transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <Link
                    to="/agents/$slug/conversations/$id"
                    params={{ slug, id: String(conv.id) }}
                    onClick={onSelect}
                    className="flex-1 min-w-0 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {hasUnread ? (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        ) : null}
                        <p className={`text-sm truncate ${hasUnread ? "font-semibold" : "font-medium"}`}>
                          {convTitle}
                        </p>
                      </div>
                      {updatedAt ? (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatRelativeTime(updatedAt)}
                        </span>
                      ) : null}
                    </div>
                    {lastMessage ? (
                      <p className={`text-xs truncate mt-0.5 ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {lastMessage.senderType === "user" ? "You: " : "Agent: "}
                        {String(lastMessage.content)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        No messages yet
                      </p>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({
                        id: String(conv.id),
                        title: convTitle,
                      });
                    }}
                    className="shrink-0 p-2 mr-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Back to agent link */}
      <div className="p-3 border-t">
        <Link
          to="/agents/$slug"
          params={{ slug }}
          onClick={onSelect}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to {slug}
        </Link>
      </div>

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

function SidebarSkeleton() {
  return (
    <div className="p-3 space-y-3">
      <Skeleton className="h-9 w-full rounded-md" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md p-3">
            <Skeleton className="h-4 w-32 mb-1.5" />
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </div>
    </div>
  );
}

function useActiveConversationId(): string | undefined {
  const params = useParams({ strict: false }) as { id?: string };
  return params.id;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}
