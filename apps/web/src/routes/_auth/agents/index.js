import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@myagents/ui/components/card";
import { Input } from "@myagents/ui/components/input";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bot, Search, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { orpc } from "@/utils/orpc";
export const Route = createFileRoute("/_auth/agents/")({
    component: AgentsPage,
});
function AgentsPage() {
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const agentsQuery = useQuery(orpc.agents.list.queryOptions({
        search: search || undefined,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
    }));
    return (_jsxs("div", { className: "container mx-auto max-w-4xl px-4 py-8", children: [_jsx("div", { className: "flex items-center justify-between mb-6", children: _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold", children: "Agents" }), _jsx("p", { className: "mt-1 text-muted-foreground", children: "Manage your connected AI agents" })] }) }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-6", children: [_jsxs("div", { className: "relative flex-1 min-w-[200px]", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }), _jsx(Input, { placeholder: "Search agents...", value: search, onChange: (e) => setSearch(e.target.value), className: "pl-9" })] }), _jsxs("select", { value: typeFilter, onChange: (e) => setTypeFilter(e.target.value), className: "h-9 rounded-md border border-input bg-background px-3 text-sm", children: [_jsx("option", { value: "", children: "All types" }), _jsx("option", { value: "hermes", children: "Hermes" }), _jsx("option", { value: "openclaw", children: "OpenClaw" }), _jsx("option", { value: "custom", children: "Custom" })] }), _jsxs("select", { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), className: "h-9 rounded-md border border-input bg-background px-3 text-sm", children: [_jsx("option", { value: "", children: "All statuses" }), _jsx("option", { value: "online", children: "Online" }), _jsx("option", { value: "offline", children: "Offline" })] })] }), agentsQuery.isLoading ? (_jsx(AgentsSkeleton, {})) : (_jsx(AgentsList, { own: agentsQuery.data?.own ?? [], shared: agentsQuery.data?.shared ?? [] }))] }));
}
function AgentsList({ own, shared, }) {
    if (own.length === 0 && shared.length === 0) {
        return (_jsx(Card, { children: _jsxs(CardContent, { className: "flex flex-col items-center justify-center py-12", children: [_jsx(Bot, { className: "h-12 w-12 text-muted-foreground mb-4" }), _jsx("h3", { className: "text-lg font-medium mb-1", children: "No agents connected" }), _jsxs("p", { className: "text-sm text-muted-foreground text-center max-w-sm", children: ["Connect your first agent by installing the CLI and running", " ", _jsx("code", { className: "rounded bg-muted px-1.5 py-0.5 text-xs font-mono", children: "myagents connect" })] })] }) }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [own.length > 0 && (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Your Agents" }), _jsxs(CardDescription, { children: [own.length, " agent", own.length === 1 ? "" : "s"] })] }), _jsx(CardContent, { className: "space-y-2", children: own.map((agent) => (_jsx(AgentCard, { agent: agent }, agent.id))) })] })), shared.length > 0 && (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Shared with you" }), _jsxs(CardDescription, { children: [shared.length, " shared agent", shared.length === 1 ? "" : "s"] })] }), _jsx(CardContent, { className: "space-y-2", children: shared.map((agent) => (_jsx(AgentCard, { agent: agent, showOwner: true }, agent.id))) })] }))] }));
}
function AgentCard({ agent, showOwner, }) {
    const node = agent.node;
    const user = agent.user;
    const isOnline = agent.status === "online";
    const slug = showOwner && user?.username
        ? `${String(user.username)}/${String(agent.slug)}`
        : String(agent.slug);
    return (_jsxs(Link, { to: "/agents/$slug", params: { slug }, className: "flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer", children: [_jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-lg bg-muted", children: _jsx(Bot, { className: "h-5 w-5 text-muted-foreground" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("p", { className: "font-medium text-sm truncate", children: String(agent.name) }), _jsx("span", { className: `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${agent.type === "hermes"
                                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                    : agent.type === "openclaw"
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"}`, children: String(agent.type) })] }), _jsxs("p", { className: "text-xs text-muted-foreground truncate mt-0.5", children: [_jsx("span", { className: "font-mono", children: slug }), node ? (_jsxs(_Fragment, { children: [" ", "\u00B7 ", String(node.name)] })) : null, agent.description ? (_jsxs(_Fragment, { children: [" ", "\u00B7 ", String(agent.description)] })) : null] })] }), _jsxs("div", { className: "flex items-center gap-1.5 shrink-0", children: [isOnline ? (_jsx(Wifi, { className: "h-4 w-4 text-green-500" })) : (_jsx(WifiOff, { className: "h-4 w-4 text-muted-foreground" })), _jsx("span", { className: `text-xs font-medium ${isOnline ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`, children: isOnline ? "Online" : "Offline" })] })] }));
}
function AgentsSkeleton() {
    return (_jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(Skeleton, { className: "h-6 w-32" }), _jsx(Skeleton, { className: "h-4 w-20 mt-1" })] }), _jsx(CardContent, { className: "space-y-2", children: Array.from({ length: 3 }).map((_, i) => (_jsxs("div", { className: "flex items-center gap-4 rounded-lg border p-4", children: [_jsx(Skeleton, { className: "h-10 w-10 rounded-lg" }), _jsxs("div", { className: "flex-1 space-y-2", children: [_jsx(Skeleton, { className: "h-4 w-40" }), _jsx(Skeleton, { className: "h-3 w-56" })] }), _jsx(Skeleton, { className: "h-4 w-16" })] }, i))) })] }));
}
