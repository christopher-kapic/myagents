import { Button } from "@myagents/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@myagents/ui/components/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@myagents/ui/components/dialog";
import { Input } from "@myagents/ui/components/input";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { Switch } from "@myagents/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Clock,
  Download,
  FileJson,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Server,
  Settings,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@myagents/ui/components/dropdown-menu";
import { downloadFile, makeExportFilename } from "@/utils/export";
import { useWebSocket } from "@/hooks/use-websocket";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/agents/$slug/")({
  component: AgentDetailPage,
});

type Tab = "conversations" | "permissions" | "settings";

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
                &middot;{" "}
                <span className="inline-flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  {String(node.name)}
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      node.status === "online"
                        ? "bg-green-500"
                        : "bg-muted-foreground"
                    }`}
                  />
                </span>
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
      <div className="flex items-center gap-1 border-b mb-6 overflow-x-auto">
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
            onClick={() => setActiveTab("permissions")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "permissions"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shield className="h-4 w-4" />
            Permissions
          </button>
        )}
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
        <ConversationsTab agentId={String(agent.id)} slug={slug} />
      ) : activeTab === "permissions" ? (
        <PermissionsTab agent={agent} slug={slug} />
      ) : (
        <SettingsTab agent={agent} slug={slug} />
      )}
    </div>
  );
}

function ConversationsTab({
  agentId,
  slug,
}: {
  agentId: string;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);

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
    },
  });

  const handleNewConversation = async () => {
    await createMutation.mutateAsync();
  };

  const handleBulkExport = async (format: "markdown" | "json") => {
    setExporting(true);
    try {
      const result = await orpc.conversations.exportBulk.call({
        agentId,
        format,
      });
      const data = result as Record<string, unknown>;
      const date = new Date().toISOString().split("T")[0];

      if (format === "json") {
        const content = JSON.stringify(data, null, 2);
        downloadFile(content, `${slug}_all-conversations_${date}.json`, "application/json");
      } else {
        const content = String(data.content);
        downloadFile(content, `${slug}_all-conversations_${date}.md`, "text/markdown");
      }
    } finally {
      setExporting(false);
    }
  };

  const conversations = (conversationsQuery.data ?? []) as Array<
    Record<string, unknown>
  >;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        <h2 className="text-lg font-medium shrink-0">Conversations</h2>
        <div className="flex items-center gap-2 overflow-x-auto shrink-0">
          {conversations.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" disabled={exporting} />
                }
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Export All
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleBulkExport("markdown")}>
                  <FileText className="h-4 w-4" />
                  Export as Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkExport("json")}>
                  <FileJson className="h-4 w-4" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            size="sm"
            onClick={handleNewConversation}
            disabled={createMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
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
              <Link
                key={String(conv.id)}
                to="/agents/$slug/conversations/$id"
                params={{ slug, id: String(conv.id) }}
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
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PermissionsTab({
  agent,
  slug,
}: {
  agent: Record<string, unknown>;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const agentId = String(agent.id);
  const isShared = Boolean(agent.shared);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch current permissions
  const permissionsQuery = useQuery(
    orpc.permissions.list.queryOptions({ input: { agentId } }),
  );

  // Fetch user's own agents to show as toggleable targets
  const agentsQuery = useQuery(orpc.agents.list.queryOptions());

  const shareMutation = useMutation({
    mutationFn: () => orpc.agents.share.call({ id: agentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.agents.get.queryOptions({ input: { slug } }).queryKey,
      });
    },
  });

  const unshareMutation = useMutation({
    mutationFn: () => orpc.agents.unshare.call({ id: agentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.agents.get.queryOptions({ input: { slug } }).queryKey,
      });
    },
  });

  const grantMutation = useMutation({
    mutationFn: (targetAgentId: string) =>
      orpc.permissions.grant.call({ agentId, targetAgentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.permissions.list.queryOptions({ input: { agentId } })
          .queryKey,
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (targetAgentId: string) =>
      orpc.permissions.revoke.call({ agentId, targetAgentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.permissions.list.queryOptions({ input: { agentId } })
          .queryKey,
      });
    },
  });

  const permissions = permissionsQuery.data as
    | {
        canSendTo: Array<{
          id: string;
          agent: {
            id: string;
            slug: string;
            name: string;
            type: string;
            status: string;
            userId: string;
            username?: string | null;
          };
        }>;
        canReceiveFrom: Array<{
          id: string;
          agent: {
            id: string;
            slug: string;
            name: string;
            type: string;
            status: string;
            userId: string;
            username?: string | null;
          };
        }>;
      }
    | undefined;

  const agentsData = agentsQuery.data as
    | {
        own: Array<Record<string, unknown>>;
        shared?: Array<Record<string, unknown>>;
      }
    | undefined;

  // Build list of all available target agents (own agents except this one + shared agents from others)
  const ownAgents = (agentsData?.own ?? []).filter(
    (a) => String(a.id) !== agentId,
  );
  const sharedAgents = (agentsData?.shared ?? []).map((a) => {
    const displaySlug = a.user
      ? `${String((a.user as Record<string, unknown>).username)}/${String(a.slug)}`
      : String(a.slug);
    return { agent: a, displaySlug };
  });

  const canSendToIds = new Set(
    (permissions?.canSendTo ?? []).map((p) => p.agent.id),
  );

  // Filter agents by search query
  const filterAgent = (a: Record<string, unknown>, displaySlug?: string) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(a.name).toLowerCase().includes(q) ||
      String(a.slug).toLowerCase().includes(q) ||
      (displaySlug ?? "").toLowerCase().includes(q)
    );
  };

  const filteredOwnAgents = ownAgents.filter((a) => filterAgent(a));
  const filteredSharedAgents = sharedAgents.filter((s) =>
    filterAgent(s.agent, s.displaySlug),
  );

  const handleToggleSendTo = (targetId: string, currentlyGranted: boolean) => {
    if (currentlyGranted) {
      revokeMutation.mutate(targetId);
    } else {
      grantMutation.mutate(targetId);
    }
  };

  const handleShareToggle = () => {
    if (isShared) {
      unshareMutation.mutate();
    } else {
      shareMutation.mutate();
    }
  };

  const handleAllowAll = () => {
    const allTargets = [
      ...ownAgents.map((a) => String(a.id)),
    ];
    for (const targetId of allTargets) {
      if (!canSendToIds.has(targetId)) {
        grantMutation.mutate(targetId);
      }
    }
  };

  const handleDenyAll = () => {
    for (const p of permissions?.canSendTo ?? []) {
      revokeMutation.mutate(p.agent.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Share Toggle */}
      <Card>
        <CardHeader>
          <CardTitle>Share this agent</CardTitle>
          <CardDescription>
            When enabled, other users can discover this agent and grant their
            agents permission to message it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              checked={isShared}
              onCheckedChange={handleShareToggle}
              disabled={shareMutation.isPending || unshareMutation.isPending}
            />
            <span className="text-sm font-medium">
              {isShared ? "Shared" : "Not shared"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Can Send To */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Can send messages to</CardTitle>
              <CardDescription>
                Agents that this agent is allowed to message.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAllowAll}
                disabled={grantMutation.isPending}
              >
                Allow all my agents
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDenyAll}
                disabled={revokeMutation.isPending}
              >
                Deny all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {permissionsQuery.isLoading || agentsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredOwnAgents.length === 0 &&
              filteredSharedAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {searchQuery
                    ? "No agents match your search"
                    : "No other agents available"}
                </p>
              ) : (
                <>
                  {filteredOwnAgents.map((a) => {
                    const id = String(a.id);
                    const granted = canSendToIds.has(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded-lg border px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {String(a.name)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {String(a.slug)} &middot; {String(a.type)}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={granted}
                          onCheckedChange={() =>
                            handleToggleSendTo(id, granted)
                          }
                          disabled={
                            grantMutation.isPending || revokeMutation.isPending
                          }
                        />
                      </div>
                    );
                  })}
                  {filteredSharedAgents.map((s) => {
                    const id = String(s.agent.id);
                    const granted = canSendToIds.has(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded-lg border px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {String(s.agent.name)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {s.displaySlug} &middot; {String(s.agent.type)}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={granted}
                          onCheckedChange={() =>
                            handleToggleSendTo(id, granted)
                          }
                          disabled={
                            grantMutation.isPending || revokeMutation.isPending
                          }
                        />
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Can Receive From */}
      <Card>
        <CardHeader>
          <CardTitle>Can receive messages from</CardTitle>
          <CardDescription>
            Agents that have been granted permission to message this agent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissionsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (permissions?.canReceiveFrom ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No agents have permission to message this agent yet.
            </p>
          ) : (
            <div className="space-y-1">
              {(permissions?.canReceiveFrom ?? []).map((p) => {
                const displaySlug =
                  p.agent.username &&
                  p.agent.userId !== String(agent.userId)
                    ? `${p.agent.username}/${p.agent.slug}`
                    : p.agent.slug;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p.agent.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {displaySlug} &middot; {p.agent.type}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        p.agent.status === "online"
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          p.agent.status === "online"
                            ? "bg-green-500"
                            : "bg-muted-foreground"
                        }`}
                      />
                      {p.agent.status === "online" ? "Online" : "Offline"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
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
  const navigate = useNavigate();
  const { sendFrame } = useWebSocket();
  const [agentSlug, setAgentSlug] = useState(String(agent.slug));
  const [name, setName] = useState(String(agent.name));
  const [description, setDescription] = useState(
    agent.description ? String(agent.description) : "",
  );
  const [rateLimitPerMin, setRateLimitPerMin] = useState(
    Number(agent.rateLimitPerMin) || 60,
  );
  const [circuitBreakerThreshold, setCircuitBreakerThreshold] = useState(
    Number(agent.circuitBreakerThreshold) || 10,
  );
  const currentTimeoutMs = (() => {
    const config = agent.adapterConfig as Record<string, unknown> | null;
    return (config?.timeout as number) ?? 120000;
  })();
  const currentTimeoutSeconds = Math.round(currentTimeoutMs / 1000);
  const [timeoutHours, setTimeoutHours] = useState(Math.floor(currentTimeoutSeconds / 3600));
  const [timeoutMinutes, setTimeoutMinutes] = useState(Math.floor((currentTimeoutSeconds % 3600) / 60));
  const [timeoutSeconds, setTimeoutSeconds] = useState(currentTimeoutSeconds % 60);
  const isBuiltInType = agent.type === "hermes" || agent.type === "openclaw";
  const isOpenClaw = agent.type === "openclaw";
  const adapterConfig = agent.adapterConfig as Record<string, unknown> | null;
  const availableOpenClawAgents = (adapterConfig?.availableAgents as Array<{ id: string; name?: string; isDefault: boolean }>) ?? [];
  const currentOpenClawAgentId = (adapterConfig?.agentId as string) ?? "";
  const [openclawAgentId, setOpenclawAgentId] = useState(currentOpenClawAgentId);

  const updateMutation = useMutation({
    mutationFn: (data: { slug?: string; name?: string; description?: string | null }) =>
      orpc.agents.update.call({ id: String(agent.id), ...data }),
    onSuccess: (result) => {
      const updated = result as Record<string, unknown>;
      const newSlug = String(updated.slug);
      queryClient.invalidateQueries({
        queryKey: orpc.agents.list.queryOptions().queryKey,
      });
      if (newSlug !== slug) {
        // Navigate to new slug URL
        navigate({ to: "/agents/$slug", params: { slug: newSlug } });
      } else {
        queryClient.invalidateQueries({
          queryKey: orpc.agents.get.queryOptions({ input: { slug } }).queryKey,
        });
      }
    },
  });

  const rateLimitMutation = useMutation({
    mutationFn: (data: { rateLimitPerMin: number; circuitBreakerThreshold: number }) =>
      orpc.agents.setRateLimit.call({ id: String(agent.id), ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.agents.get.queryOptions({ input: { slug } }).queryKey,
      });
    },
  });

  const timeoutMutation = useMutation({
    mutationFn: (data: { timeout: number }) =>
      orpc.agents.setTimeout.call({ id: String(agent.id), ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.agents.get.queryOptions({ input: { slug } }).queryKey,
      });
    },
  });

  const openclawAgentMutation = useMutation({
    mutationFn: (data: { openclawAgentId: string }) =>
      orpc.agents.setOpenClawAgent.call({ id: String(agent.id), ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.agents.get.queryOptions({ input: { slug } }).queryKey,
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => orpc.agents.remove.call({ id: String(agent.id) }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.agents.list.queryOptions().queryKey,
      });
      navigate({ to: "/agents" });
    },
  });

  const handleResetCircuitBreaker = () => {
    sendFrame("agent.circuitBreaker.reset", { agentId: String(agent.id) });
  };

  const handleSave = () => {
    updateMutation.mutate({
      slug: agentSlug !== String(agent.slug) ? agentSlug : undefined,
      name: name !== String(agent.name) ? name : undefined,
      description:
        description !== (agent.description ? String(agent.description) : "")
          ? description || null
          : undefined,
    });
  };

  const handleSaveRateLimit = () => {
    rateLimitMutation.mutate({ rateLimitPerMin, circuitBreakerThreshold });
  };

  const slugValid = /^[a-zA-Z0-9-]+$/.test(agentSlug) && agentSlug.length > 0;
  const hasChanges =
    agentSlug !== String(agent.slug) ||
    name !== String(agent.name) ||
    description !== (agent.description ? String(agent.description) : "");

  const totalTimeoutSeconds = timeoutHours * 3600 + timeoutMinutes * 60 + timeoutSeconds;
  const isTimeoutValid = totalTimeoutSeconds >= 30 && totalTimeoutSeconds <= 604800;
  const hasTimeoutChanges = totalTimeoutSeconds !== currentTimeoutSeconds;

  const handleSaveTimeout = () => {
    if (!isTimeoutValid) return;
    timeoutMutation.mutate({ timeout: totalTimeoutSeconds * 1000 });
  };

  const hasRateLimitChanges =
    rateLimitPerMin !== (Number(agent.rateLimitPerMin) || 60) ||
    circuitBreakerThreshold !== (Number(agent.circuitBreakerThreshold) || 10);

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
            <label htmlFor="agent-slug" className="text-sm font-medium">
              Slug
            </label>
            <Input
              id="agent-slug"
              value={agentSlug}
              onChange={(e) => setAgentSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="agent-slug"
              className="font-mono"
            />
            {!slugValid && agentSlug.length > 0 && (
              <p className="text-xs text-destructive">
                Slug must only contain lowercase letters, numbers, and hyphens.
              </p>
            )}
            {isBuiltInType && agentSlug !== String(agent.slug) && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This is a {String(agent.type)} agent. You'll also need to update the slug in your local CLI config or agents.yaml so it re-registers with the new slug.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Used in URLs and agent-to-agent messaging. Changing this will update the agent's address.
            </p>
          </div>
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
              disabled={!hasChanges || !slugValid || updateMutation.isPending}
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

      {/* Node Info */}
      {agent.node ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Node Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Node</span>
                <span className="font-medium">
                  {String(
                    (agent.node as Record<string, unknown>).name,
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    (agent.node as Record<string, unknown>).status ===
                    "online"
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      (agent.node as Record<string, unknown>).status ===
                      "online"
                        ? "bg-green-500"
                        : "bg-muted-foreground"
                    }`}
                  />
                  {(agent.node as Record<string, unknown>).status ===
                  "online"
                    ? "Online"
                    : "Offline"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* OpenClaw Agent Selection */}
      {isOpenClaw && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              OpenClaw Agent
            </CardTitle>
            <CardDescription>
              Select which OpenClaw agent handles messages sent to this connector.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="openclaw-agent" className="text-sm font-medium">
                Default Agent
              </label>
              {availableOpenClawAgents.length > 0 ? (
                <select
                  id="openclaw-agent"
                  value={openclawAgentId}
                  onChange={(e) => setOpenclawAgentId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select an agent...</option>
                  {availableOpenClawAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name ? `${a.name} (${a.id})` : a.id}
                      {a.isDefault ? " - default" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="openclaw-agent"
                  value={openclawAgentId}
                  onChange={(e) => setOpenclawAgentId(e.target.value)}
                  placeholder="e.g. ops, assistant"
                />
              )}
              <p className="text-xs text-muted-foreground">
                The agent ID configured in your OpenClaw installation. Run{" "}
                <code className="text-xs">openclaw agents list</code> to see available agents.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => openclawAgentMutation.mutate({ openclawAgentId })}
                disabled={openclawAgentId === currentOpenClawAgentId || !openclawAgentId || openclawAgentMutation.isPending}
              >
                {openclawAgentMutation.isPending ? "Saving..." : "Save Agent"}
              </Button>
              {openclawAgentMutation.isSuccess && (
                <span className="text-sm text-green-600 dark:text-green-400">
                  Saved
                </span>
              )}
              {openclawAgentMutation.isError && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  Failed to save
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rate Limiting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Rate Limiting
          </CardTitle>
          <CardDescription>
            Configure message rate limits and circuit breaker thresholds to
            prevent runaway loops and abuse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="rate-limit" className="text-sm font-medium">
              Messages per minute
            </label>
            <Input
              id="rate-limit"
              type="number"
              min={1}
              max={10000}
              value={rateLimitPerMin}
              onChange={(e) => setRateLimitPerMin(Number(e.target.value) || 1)}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of messages this agent can send or receive per
              minute. Default: 60.
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="circuit-breaker"
              className="text-sm font-medium"
            >
              Circuit breaker threshold
            </label>
            <Input
              id="circuit-breaker"
              type="number"
              min={1}
              max={10000}
              value={circuitBreakerThreshold}
              onChange={(e) =>
                setCircuitBreakerThreshold(Number(e.target.value) || 1)
              }
            />
            <p className="text-xs text-muted-foreground">
              If two agents exchange more than this many messages per minute,
              communication is automatically paused. Default: 10.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSaveRateLimit}
              disabled={!hasRateLimitChanges || rateLimitMutation.isPending}
            >
              {rateLimitMutation.isPending
                ? "Saving..."
                : "Save Rate Limits"}
            </Button>
            {rateLimitMutation.isSuccess && (
              <span className="text-sm text-green-600 dark:text-green-400">
                Saved
              </span>
            )}
            {rateLimitMutation.isError && (
              <span className="text-sm text-red-600 dark:text-red-400">
                Failed to save
              </span>
            )}
          </div>

          {/* Circuit Breaker Reset */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Circuit Breaker
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  If agent-to-agent communication has been paused due to loop
                  detection, click below to reset and resume.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleResetCircuitBreaker}
                >
                  Reset Circuit Breaker
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Response Timeout */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Response Timeout
          </CardTitle>
          <CardDescription>
            Maximum time the agent has to respond to a message before the
            request is terminated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Timeout</label>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <Input
                  id="timeout-hours"
                  type="number"
                  min={0}
                  max={168}
                  className="w-20 text-center"
                  value={timeoutHours}
                  onChange={(e) => setTimeoutHours(Math.max(0, Math.min(168, parseInt(e.target.value) || 0)))}
                />
                <span className="text-xs text-muted-foreground">hours</span>
              </div>
              <span className="text-lg font-medium pb-5">:</span>
              <div className="flex flex-col items-center gap-1">
                <Input
                  id="timeout-minutes"
                  type="number"
                  min={0}
                  max={59}
                  className="w-20 text-center"
                  value={timeoutMinutes}
                  onChange={(e) => setTimeoutMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                />
                <span className="text-xs text-muted-foreground">minutes</span>
              </div>
              <span className="text-lg font-medium pb-5">:</span>
              <div className="flex flex-col items-center gap-1">
                <Input
                  id="timeout-seconds"
                  type="number"
                  min={0}
                  max={59}
                  className="w-20 text-center"
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                />
                <span className="text-xs text-muted-foreground">seconds</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum 168 hours (7 days). Minimum 30 seconds. Default: 2 minutes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSaveTimeout}
              disabled={!hasTimeoutChanges || !isTimeoutValid || timeoutMutation.isPending}
            >
              {timeoutMutation.isPending ? "Saving..." : "Save Timeout"}
            </Button>
            {timeoutMutation.isSuccess && (
              <span className="text-sm text-green-600 dark:text-green-400">
                Saved
              </span>
            )}
            {timeoutMutation.isError && (
              <span className="text-sm text-red-600 dark:text-red-400">
                Failed to save
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Removing an agent will unregister it from the server. Conversation
            history will be permanently deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RemoveAgentDialog
            agentSlug={slug}
            onConfirm={() => removeMutation.mutate()}
            isPending={removeMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function RemoveAgentDialog({
  agentSlug,
  onConfirm,
  isPending,
}: {
  agentSlug: string;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const isConfirmed = confirmText === agentSlug;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setConfirmText("");
      }}
    >
      <DialogTrigger
        render={<Button variant="destructive" />}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Remove Agent
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Agent</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently remove the agent
            and all its conversations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-sm">
            Type{" "}
            <span className="font-mono font-medium text-foreground">
              {agentSlug}
            </span>{" "}
            to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={agentSlug}
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
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {isPending ? "Removing..." : "Remove Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
