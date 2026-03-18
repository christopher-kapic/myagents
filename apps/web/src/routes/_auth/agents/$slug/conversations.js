import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, } from "@myagents/ui/components/sheet";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, useNavigate, useParams, } from "@tanstack/react-router";
import { MessageSquare, Plus } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { orpc } from "@/utils/orpc";
export const Route = createFileRoute("/_auth/agents/$slug/conversations")({
    component: ConversationsLayout,
});
const ConversationSidebarContext = createContext({ openDrawer: () => { } });
export function useConversationSidebar() {
    return useContext(ConversationSidebarContext);
}
function ConversationsLayout() {
    const { slug } = Route.useParams();
    const [drawerOpen, setDrawerOpen] = useState(false);
    // Get agentId from agent query
    const agentQuery = useQuery(orpc.agents.get.queryOptions({ input: { slug } }));
    const agent = agentQuery.data;
    const agentId = agent ? String(agent.id) : "";
    return (_jsxs("div", { className: "flex h-[calc(100vh-4rem)]", children: [_jsx("div", { className: "hidden md:flex md:w-72 lg:w-80 md:shrink-0 md:flex-col md:border-r", children: agentId ? (_jsx(SidebarContent, { agentId: agentId, slug: slug })) : (_jsx(SidebarSkeleton, {})) }), _jsx(Sheet, { open: drawerOpen, onOpenChange: setDrawerOpen, children: _jsxs(SheetContent, { side: "left", showCloseButton: false, className: "w-80 p-0", children: [_jsx(SheetHeader, { className: "border-b", children: _jsx(SheetTitle, { children: "Conversations" }) }), agentId ? (_jsx(SidebarContent, { agentId: agentId, slug: slug, onSelect: () => setDrawerOpen(false) })) : (_jsx(SidebarSkeleton, {}))] }) }), _jsx(ConversationSidebarContext.Provider, { value: { openDrawer: () => setDrawerOpen(true) }, children: _jsx("div", { className: "flex-1 min-w-0 flex flex-col", children: _jsx(Outlet, {}) }) })] }));
}
function SidebarContent({ agentId, slug, onSelect, }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const activeConversationId = useActiveConversationId();
    const conversationsQuery = useQuery(orpc.conversations.list.queryOptions({ input: { agentId } }));
    const createMutation = useMutation({
        mutationFn: () => orpc.conversations.create.call({ agentId }),
        onSuccess: (data) => {
            queryClient.invalidateQueries({
                queryKey: orpc.conversations.list.queryOptions({ input: { agentId } })
                    .queryKey,
            });
            const conv = data;
            navigate({
                to: "/agents/$slug/conversations/$id",
                params: { slug, id: String(conv.id) },
            });
            onSelect?.();
        },
    });
    const conversations = (conversationsQuery.data ?? []);
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsx("div", { className: "p-3 border-b", children: _jsxs(Button, { size: "sm", className: "w-full", onClick: () => createMutation.mutateAsync(), disabled: createMutation.isPending, children: [_jsx(Plus, { className: "h-4 w-4 mr-1" }), "New Conversation"] }) }), _jsx("div", { className: "flex-1 overflow-y-auto", children: conversationsQuery.isLoading ? (_jsx("div", { className: "p-3 space-y-2", children: Array.from({ length: 5 }).map((_, i) => (_jsxs("div", { className: "rounded-md p-3", children: [_jsx(Skeleton, { className: "h-4 w-32 mb-1.5" }), _jsx(Skeleton, { className: "h-3 w-48" })] }, i))) })) : conversations.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-12 px-4 text-center", children: [_jsx(MessageSquare, { className: "h-8 w-8 text-muted-foreground mb-2" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "No conversations yet" })] })) : (_jsx("div", { className: "p-2 space-y-0.5", children: conversations.map((conv) => {
                        const isActive = String(conv.id) === activeConversationId;
                        const lastMessage = conv.lastMessage;
                        const updatedAt = conv.updatedAt
                            ? new Date(String(conv.updatedAt))
                            : null;
                        return (_jsxs(Link, { to: "/agents/$slug/conversations/$id", params: { slug, id: String(conv.id) }, onClick: onSelect, className: `block rounded-md px-3 py-2.5 transition-colors ${isActive
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-accent/50"}`, children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("p", { className: "text-sm font-medium truncate", children: conv.title
                                                ? String(conv.title)
                                                : "Untitled conversation" }), updatedAt ? (_jsx("span", { className: "text-[10px] text-muted-foreground shrink-0", children: formatRelativeTime(updatedAt) })) : null] }), lastMessage ? (_jsxs("p", { className: "text-xs text-muted-foreground truncate mt-0.5", children: [lastMessage.senderType === "user" ? "You: " : "Agent: ", String(lastMessage.content)] })) : (_jsx("p", { className: "text-xs text-muted-foreground mt-0.5", children: "No messages yet" }))] }, String(conv.id)));
                    }) })) }), _jsx("div", { className: "p-3 border-t", children: _jsxs(Link, { to: "/agents/$slug", params: { slug }, onClick: onSelect, className: "text-xs text-muted-foreground hover:text-foreground transition-colors", children: ["\u2190 Back to ", slug] }) })] }));
}
function SidebarSkeleton() {
    return (_jsxs("div", { className: "p-3 space-y-3", children: [_jsx(Skeleton, { className: "h-9 w-full rounded-md" }), _jsx("div", { className: "space-y-2", children: Array.from({ length: 4 }).map((_, i) => (_jsxs("div", { className: "rounded-md p-3", children: [_jsx(Skeleton, { className: "h-4 w-32 mb-1.5" }), _jsx(Skeleton, { className: "h-3 w-48" })] }, i))) })] }));
}
function useActiveConversationId() {
    const params = useParams({ strict: false });
    return params.id;
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
        return `${diffMins}m`;
    if (diffHours < 24)
        return `${diffHours}h`;
    if (diffDays < 7)
        return `${diffDays}d`;
    return date.toLocaleDateString();
}
