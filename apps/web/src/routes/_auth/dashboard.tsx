import { Skeleton } from "@myagents/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import PullToRefresh from "@/components/pull-to-refresh";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = Route.useRouteContext();
  const appSettings = useQuery(orpc.settings.getAll.queryOptions());

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, []);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {appSettings.isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="mt-2 text-muted-foreground">
              Welcome back, {session.user.name}
            </p>
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-64" />
    </div>
  );
}
