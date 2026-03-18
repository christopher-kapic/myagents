import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
    return (_jsx(PullToRefresh, { onRefresh: handleRefresh, children: _jsx("div", { className: "container mx-auto max-w-4xl px-4 py-8", children: appSettings.isLoading ? (_jsx(DashboardSkeleton, {})) : (_jsxs(_Fragment, { children: [_jsx("h1", { className: "text-2xl font-bold", children: "Dashboard" }), _jsxs("p", { className: "mt-2 text-muted-foreground", children: ["Welcome back, ", session.user.name] })] })) }) }));
}
function DashboardSkeleton() {
    return (_jsxs("div", { className: "space-y-4", children: [_jsx(Skeleton, { className: "h-8 w-48" }), _jsx(Skeleton, { className: "h-5 w-64" })] }));
}
