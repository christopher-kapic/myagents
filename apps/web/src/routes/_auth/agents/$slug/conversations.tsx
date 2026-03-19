import { Button } from "@myagents/ui/components/button";
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
import { MessageSquare, Plus } from "lucide-react";
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

              return (
                <Link
                  key={String(conv.id)}
                  to="/agents/$slug/conversations/$id"
                  params={{ slug, id: String(conv.id) }}
                  onClick={onSelect}
                  className={`block rounded-md px-3 py-2.5 transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">
                      {conv.title
                        ? String(conv.title)
                        : "Untitled conversation"}
                    </p>
                    {updatedAt ? (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatRelativeTime(updatedAt)}
                      </span>
                    ) : null}
                  </div>
                  {lastMessage ? (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {lastMessage.senderType === "user" ? "You: " : "Agent: "}
                      {String(lastMessage.content)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      No messages yet
                    </p>
                  )}
                </Link>
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
    </div>
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
