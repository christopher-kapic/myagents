import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@myagents/ui/components/card";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback } from "react";

import PullToRefresh from "@/components/pull-to-refresh";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = Route.useRouteContext();

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, []);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Welcome back, {session.user.name}
        </p>
        <div className="mt-6">
          <AgentHealthWidget />
        </div>
      </div>
    </PullToRefresh>
  );
}

function AgentHealthWidget() {
  const healthQuery = useQuery(orpc.health.overview.queryOptions());

  if (healthQuery.isLoading) {
    return <HealthSkeleton />;
  }

  const data = healthQuery.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const summary = data.summary as Record<string, unknown>;
  const agents = data.agents as Array<Record<string, unknown>>;
  const totalAgents = Number(summary.totalAgents);

  if (totalAgents === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Agent Health
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Bot className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No agents connected yet.{" "}
            <Link to="/agents" className="text-primary underline">
              Get started
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const onlineCount = Number(summary.onlineCount);
  const offlineCount = Number(summary.offlineCount);
  const avgUptime = Number(summary.avgUptime24h);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Activity className="h-5 w-5" />
        Agent Health
      </h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total" value={String(totalAgents)} />
        <SummaryCard
          label="Online"
          value={String(onlineCount)}
          className="text-green-600 dark:text-green-400"
        />
        <SummaryCard
          label="Offline"
          value={String(offlineCount)}
          className={
            offlineCount > 0
              ? "text-red-600 dark:text-red-400"
              : "text-muted-foreground"
          }
        />
        <SummaryCard
          label="Avg Uptime (24h)"
          value={`${avgUptime.toFixed(1)}%`}
        />
      </div>

      {/* Agent status list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agent Status</CardTitle>
          <CardDescription>All agents and their current health</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {agents.map((agent) => (
            <AgentHealthRow key={String(agent.id)} agent={agent} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${className ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function AgentHealthRow({ agent }: { agent: Record<string, unknown> }) {
  const isOnline = agent.status === "online";
  const uptimePercent = Number(agent.uptimePercent24h);
  const lastSeen = agent.lastSeen ? String(agent.lastSeen) : null;

  return (
    <Link
      to="/agents/$slug"
      params={{ slug: String(agent.slug) }}
      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">
            {String(agent.name)}
          </p>
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              agent.type === "hermes"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                : agent.type === "openclaw"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {String(agent.type)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {lastSeen && !isOnline ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last seen {formatRelativeTime(lastSeen)}
            </span>
          ) : null}
          {agent.nodeName ? (
            <span className="text-xs text-muted-foreground">
              {String(agent.nodeName)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">24h uptime</p>
          <p
            className={`text-sm font-medium ${
              uptimePercent >= 99
                ? "text-green-600 dark:text-green-400"
                : uptimePercent >= 90
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
            }`}
          >
            {uptimePercent.toFixed(1)}%
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
    </Link>
  );
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function HealthSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
