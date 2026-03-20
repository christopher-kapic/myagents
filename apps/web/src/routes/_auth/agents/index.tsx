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
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bot, Search, Share2, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/agents/")({
  component: AgentsPage,
});

function AgentsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const agentsQuery = useQuery(
    orpc.agents.list.queryOptions({
      search: search || undefined,
      type: (typeFilter as "hermes" | "openclaw" | "custom") || undefined,
      status: (statusFilter as "online" | "offline") || undefined,
    }),
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your connected AI agents
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All types</option>
          <option value="hermes">Hermes</option>
          <option value="openclaw">OpenClaw</option>
          <option value="custom">Custom</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {agentsQuery.isLoading ? (
        <AgentsSkeleton />
      ) : (
        <AgentsList
          own={agentsQuery.data?.own ?? []}
          shared={agentsQuery.data?.sharedWithMe ?? []}
        />
      )}
    </div>
  );
}

function AgentsList({
  own,
  shared,
}: {
  own: Array<Record<string, unknown>>;
  shared: Array<Record<string, unknown>>;
}) {
  if (own.length === 0 && shared.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">No agents connected</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Connect your first agent by installing the CLI and running{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              myagents connect
            </code>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {own.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Agents</CardTitle>
            <CardDescription>
              {own.length} agent{own.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {own.map((agent) => (
              <AgentCard key={agent.id as string} agent={agent} />
            ))}
          </CardContent>
        </Card>
      )}

      {shared.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Shared with you</CardTitle>
            <CardDescription>
              {shared.length} shared agent{shared.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {shared.map((agent) => (
              <AgentCard
                key={agent.id as string}
                agent={agent}
                showOwner
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  showOwner,
}: {
  agent: Record<string, unknown>;
  showOwner?: boolean;
}) {
  const node = agent.node as Record<string, unknown> | undefined;
  const user = agent.user as Record<string, unknown> | undefined;
  const isOnline = agent.status === "online";

  const slug = showOwner && user?.username
    ? `${String(user.username)}/${String(agent.slug)}`
    : String(agent.slug);

  return (
    <Link
      to="/agents/$slug"
      params={{ slug }}
      className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Bot className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">
            {String(agent.name)}
          </p>
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
          {showOwner && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <Share2 className="h-3 w-3" />
              Shared
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          <span className="font-mono">{slug}</span>
          {node ? (
            <>
              {" "}
              &middot; {String(node.name)}
            </>
          ) : null}
          {agent.description ? (
            <>
              {" "}
              &middot; {String(agent.description)}
            </>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isOnline ? (
          <Wifi className="h-4 w-4 text-green-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-muted-foreground" />
        )}
        <span
          className={`text-xs font-medium ${
            isOnline ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
          }`}
        >
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>
    </Link>
  );
}

function AgentsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-20 mt-1" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-lg border p-4"
          >
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
