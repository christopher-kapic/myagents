import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Bot, MessageSquare } from "lucide-react";
import { orpc } from "@/utils/orpc";
export const Route = createFileRoute("/_auth/conversations")({
    component: ConversationsPage,
});
function ConversationsPage() {
    const conversationsQuery = useQuery(orpc.conversations.listAll.queryOptions());
    const conversations = (conversationsQuery.data?.items ?? []);
    return (_jsxs("div", { className: "container mx-auto max-w-4xl px-4 py-8", children: [_jsxs("div", { className: "mb-6", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Conversations" }), _jsx("p", { className: "mt-1 text-muted-foreground", children: "Recent conversations across all agents" })] }), conversationsQuery.isLoading ? (_jsx(ConversationsSkeleton, {})) : conversations.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-center", children: [_jsx(MessageSquare, { className: "h-12 w-12 text-muted-foreground mb-4" }), _jsx("h3", { className: "text-lg font-medium mb-1", children: "No conversations yet" }), _jsx("p", { className: "text-sm text-muted-foreground max-w-sm", children: "Start a conversation from an agent's detail page" })] })) : (_jsx("div", { className: "space-y-1", children: conversations.map((conv) => {
                    const agent = conv.agent;
                    const lastMessage = conv.lastMessage;
                    const updatedAt = conv.updatedAt
                        ? new Date(String(conv.updatedAt))
                        : null;
                    const agentSlug = agent ? String(agent.slug) : "";
                    return (_jsxs(Link, { to: "/agents/$slug/conversations/$id", params: { slug: agentSlug, id: String(conv.id) }, className: "flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50", children: [_jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0", children: _jsx(Bot, { className: "h-5 w-5 text-muted-foreground" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("p", { className: "text-sm font-medium truncate", children: conv.title
                                                    ? String(conv.title)
                                                    : "Untitled conversation" }), updatedAt ? (_jsx("span", { className: "text-xs text-muted-foreground shrink-0", children: formatRelativeTime(updatedAt) })) : null] }), _jsxs("div", { className: "flex items-center gap-1.5 mt-0.5", children: [agent ? (_jsx("span", { className: "text-xs text-muted-foreground font-mono", children: String(agent.name) })) : null, lastMessage ? (_jsxs("span", { className: "text-xs text-muted-foreground truncate", children: ["\u00B7", " ", lastMessage.senderType === "user" ? "You: " : "Agent: ", String(lastMessage.content)] })) : null] })] })] }, String(conv.id)));
                }) }))] }));
}
function ConversationsSkeleton() {
    return (_jsx("div", { className: "space-y-1", children: Array.from({ length: 6 }).map((_, i) => (_jsxs("div", { className: "flex items-center gap-3 rounded-lg border p-4", children: [_jsx(Skeleton, { className: "h-10 w-10 rounded-lg" }), _jsxs("div", { className: "flex-1 space-y-2", children: [_jsx(Skeleton, { className: "h-4 w-48" }), _jsx(Skeleton, { className: "h-3 w-64" })] })] }, i))) }));
}
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1)
        return "now";
    if (diffMins < 60)
        return `${diffMins}m ago`;
    if (diffHours < 24)
        return `${diffHours}h ago`;
    if (diffDays < 7)
        return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
