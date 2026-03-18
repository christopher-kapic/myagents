import { Button } from "@myagents/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@myagents/ui/components/card";
import { Input } from "@myagents/ui/components/input";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  MessageSquare,
  Plus,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/agents/$slug")({
  component: AgentDetailPage,
});

type Tab = "conversations" | "settings";

function AgentDetailPage() {
  const { slug } = Route.useParams();
  const [activeTab, setActiveTab] = useState<Tab>("conversations");

  const agentQuery = useQuery(
    orpc.agents.get.queryOptions({ input: { slug } }),
  );

  if (agentQuery.isLoading) {
    return <AgentDetailSkeleton />;
  }

  if (agentQuery.isError || !agentQuery.data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Link
          to="/agents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to agents
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Agent not found</h3>
            <p className="text-sm text-muted-foreground">
              The agent you're looking for doesn't exist or you don't have
              access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const agent = agentQuery.data as Record<string, unknown>;
  const node = agent.node as Record<string, unknown> | undefined;
  const isOnline = agent.status === "online";
  const isOwn = !slug.includes("/");

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link
        to="/agents"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to agents
      </Link>

      {/* Agent Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted shrink-0">
          <Bot className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{String(agent.name)}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                agent.type === "hermes"
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                  : agent.type === "openclaw"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {String(agent.type)}
            </span>
            <div className="flex items-center gap-1">
              {isOnline ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span
                className={`text-xs font-medium ${
                  isOnline
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
                }`}
              >
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono">{slug}</span>
            {node ? (
              <>
                {" "}
                &middot; Node: {String(node.name)}
              </>
            ) : null}
          </p>
          {agent.description ? (
            <p className="text-sm text-muted-foreground mt-1">
              {String(agent.description)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("conversations")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "conversations"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Conversations
        </button>
        {isOwn && (
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "settings"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === "conversations" ? (
        <ConversationsTab agentId={String(agent.id)} />
      ) : (
        <SettingsTab agent={agent} slug={slug} />
      )}
    </div>
  );
}

function ConversationsTab({ agentId }: { agentId: string }) {
  const queryClient = useQueryClient();

  const conversationsQuery = useQuery(
    orpc.conversations.list.queryOptions({ input: { agentId } }),
  );

  const createMutation = useMutation({
    mutationFn: () => orpc.conversations.create.call({ agentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.conversations.list.queryOptions({ input: { agentId } })
          .queryKey,
      });
    },
  });

  const handleNewConversation = async () => {
    await createMutation.mutateAsync();
  };

  const conversations = (conversationsQuery.data ?? []) as Array<
    Record<string, unknown>
  >;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Conversations</h2>
        <Button
          size="sm"
          onClick={handleNewConversation}
          disabled={createMutation.isPending}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Conversation
        </Button>
      </div>

      {conversationsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-3 w-72" />
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-sm font-medium mb-1">No conversations yet</h3>
            <p className="text-xs text-muted-foreground text-center">
              Start a new conversation with this agent.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const lastMessage = conv.lastMessage as Record<
              string,
              unknown
            > | null;
            const updatedAt = conv.updatedAt
              ? new Date(String(conv.updatedAt))
              : null;

            return (
              <div
                key={String(conv.id)}
                className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {conv.title ? String(conv.title) : "Untitled conversation"}
                  </p>
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
                </div>
                {updatedAt ? (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(updatedAt)}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsTab({
  agent,
  slug,
}: {
  agent: Record<string, unknown>;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(String(agent.name));
  const [description, setDescription] = useState(
    agent.description ? String(agent.description) : "",
  );

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string | null }) =>
      orpc.agents.update.call({ id: String(agent.id), ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.agents.get.queryOptions({ input: { slug } }).queryKey,
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      name: name !== String(agent.name) ? name : undefined,
      description:
        description !== (agent.description ? String(agent.description) : "")
          ? description || null
          : undefined,
    });
  };

  const hasChanges =
    name !== String(agent.name) ||
    description !== (agent.description ? String(agent.description) : "");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Agent Settings</CardTitle>
          <CardDescription>
            Update the display name and description for this agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="agent-name" className="text-sm font-medium">
              Display Name
            </label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="agent-description" className="text-sm font-medium">
              Description
            </label>
            <Input
              id="agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
            {updateMutation.isSuccess && (
              <span className="text-sm text-green-600 dark:text-green-400">
                Saved
              </span>
            )}
            {updateMutation.isError && (
              <span className="text-sm text-red-600 dark:text-red-400">
                Failed to save
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentDetailSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Skeleton className="h-4 w-24 mb-6" />
      <div className="flex items-start gap-4 mb-6">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-64 mb-6" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <Skeleton className="h-4 w-48 mb-2" />
            <Skeleton className="h-3 w-72" />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
