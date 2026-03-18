import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "@myagents/ui/components/button";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Bot, Loader2, PanelLeft, Send, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState, } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useConversationSidebar } from "@/routes/_auth/agents/$slug/conversations";
import { orpc } from "@/utils/orpc";
export const Route = createFileRoute("/_auth/agents/$slug/conversations/$id")({
    component: ConversationPage,
});
function ConversationPage() {
    const { slug, id } = Route.useParams();
    const queryClient = useQueryClient();
    const { connected, sendFrame, subscribe } = useWebSocket();
    const { openDrawer } = useConversationSidebar();
    const [inputValue, setInputValue] = useState("");
    const [localMessages, setLocalMessages] = useState([]);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState(null);
    const [olderMessages, setOlderMessages] = useState([]);
    // Load conversation details
    const conversationQuery = useQuery(orpc.conversations.get.queryOptions({ input: { id } }));
    // Load initial messages via paginated endpoint
    const messagesQuery = useQuery(orpc.messages.list.queryOptions({
        input: { conversationId: id, limit: 50 },
    }));
    // Initialize messages from query
    useEffect(() => {
        if (messagesQuery.data) {
            const data = messagesQuery.data;
            // messages.list returns desc order, reverse for display (oldest first)
            setLocalMessages(data.items.slice().reverse());
            setNextCursor(data.nextCursor);
        }
    }, [messagesQuery.data]);
    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [localMessages]);
    // Listen for WebSocket events (streaming chunks, done, errors)
    useEffect(() => {
        const unsubscribe = subscribe((frame) => {
            // Handle streaming chunks — append to pending agent message
            if (frame.method === "message.chunk") {
                const payload = frame.payload;
                if (payload?.conversationId === id && payload.chunk !== undefined) {
                    setLocalMessages((prev) => {
                        const last = prev[prev.length - 1];
                        if (last && last.senderType === "agent" && last.pending) {
                            return [
                                ...prev.slice(0, -1),
                                { ...last, content: last.content + payload.chunk },
                            ];
                        }
                        // Create new pending agent message for first chunk
                        return [
                            ...prev,
                            {
                                id: `streaming-${Date.now()}`,
                                content: payload.chunk,
                                senderType: "agent",
                                createdAt: new Date().toISOString(),
                                pending: true,
                            },
                        ];
                    });
                    // Scroll to bottom during streaming
                    requestAnimationFrame(() => {
                        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                    });
                }
            }
            // Handle message.done — finalize the pending streaming message or add new
            if (frame.method === "message.done") {
                const payload = frame.payload;
                if (payload?.conversationId === id && payload.content) {
                    setLocalMessages((prev) => {
                        const lastIdx = prev.length - 1;
                        const last = prev[lastIdx];
                        // If there's a pending streaming message, finalize it
                        if (last && last.senderType === "agent" && last.pending) {
                            return [
                                ...prev.slice(0, lastIdx),
                                {
                                    ...last,
                                    id: payload.messageId ?? last.id,
                                    content: payload.content,
                                    pending: false,
                                },
                            ];
                        }
                        // No streaming message — add the complete response directly
                        return [
                            ...prev,
                            {
                                id: payload.messageId ?? crypto.randomUUID(),
                                content: payload.content,
                                senderType: "agent",
                                createdAt: new Date().toISOString(),
                            },
                        ];
                    });
                    setSending(false);
                    // Invalidate conversation list to update last message preview
                    queryClient.invalidateQueries({
                        queryKey: orpc.conversations.list.queryOptions({
                            input: { agentId: "" },
                        }).queryKey[0]
                            ? undefined
                            : undefined,
                    });
                }
            }
            // Handle error responses from message.send (agent offline, not found, etc.)
            if (frame.method === "message.send" &&
                frame.type === "res" &&
                frame.error) {
                setLocalMessages((prev) => [
                    ...prev,
                    {
                        id: `error-${Date.now()}`,
                        content: frame.error ?? "Failed to send message",
                        senderType: "agent",
                        createdAt: new Date().toISOString(),
                        error: true,
                    },
                ]);
                setSending(false);
            }
            // Handle streaming error — if a response frame with error arrives mid-stream
            if (frame.method === "message.response" &&
                frame.type === "res" &&
                frame.error) {
                const payload = frame.payload;
                if (!payload?.conversationId || payload.conversationId === id) {
                    setLocalMessages((prev) => {
                        const lastIdx = prev.length - 1;
                        const last = prev[lastIdx];
                        // If there's a pending streaming message, mark it as errored
                        if (last && last.senderType === "agent" && last.pending) {
                            return [
                                ...prev.slice(0, lastIdx),
                                {
                                    ...last,
                                    content: last.content +
                                        "\n\n[Error: " +
                                        (frame.error ?? "Stream interrupted") +
                                        "]",
                                    pending: false,
                                    error: true,
                                },
                            ];
                        }
                        return [
                            ...prev,
                            {
                                id: `error-${Date.now()}`,
                                content: frame.error ?? "Stream error",
                                senderType: "agent",
                                createdAt: new Date().toISOString(),
                                error: true,
                            },
                        ];
                    });
                    setSending(false);
                }
            }
        });
        return unsubscribe;
    }, [id, subscribe, queryClient]);
    // Send message via WebSocket
    const handleSend = useCallback(() => {
        const content = inputValue.trim();
        if (!content || sending)
            return;
        // Add user message to local state immediately
        const userMsg = {
            id: `local-${Date.now()}`,
            content,
            senderType: "user",
            createdAt: new Date().toISOString(),
        };
        setLocalMessages((prev) => [...prev, userMsg]);
        setInputValue("");
        setSending(true);
        // Send via WebSocket
        sendFrame("message.send", {
            conversationId: id,
            agentSlug: slug,
            content,
        });
    }, [inputValue, sending, id, slug, sendFrame]);
    // Handle Enter key
    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    // Load more messages on scroll up
    const handleScroll = useCallback(() => {
        if (!messagesContainerRef.current || !nextCursor || loadingMore)
            return;
        const { scrollTop } = messagesContainerRef.current;
        if (scrollTop < 100) {
            setLoadingMore(true);
            orpc.messages.list
                .call({ conversationId: id, cursor: nextCursor, limit: 50 })
                .then((data) => {
                const result = data;
                const older = result.items.slice().reverse();
                setOlderMessages((prev) => [...older, ...prev]);
                setLocalMessages((prev) => [...older, ...prev]);
                setNextCursor(result.nextCursor);
            })
                .finally(() => setLoadingMore(false));
        }
    }, [id, nextCursor, loadingMore]);
    if (conversationQuery.isLoading || messagesQuery.isLoading) {
        return _jsx(ConversationSkeleton, { slug: slug });
    }
    if (conversationQuery.isError || !conversationQuery.data) {
        return (_jsxs("div", { className: "flex flex-col items-center justify-center flex-1 px-4 py-8 text-center", children: [_jsx(Bot, { className: "h-12 w-12 text-muted-foreground mb-4" }), _jsx("h3", { className: "text-lg font-medium mb-1", children: "Conversation not found" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "This conversation doesn't exist or you don't have access." }), _jsx(Link, { to: "/agents/$slug", params: { slug }, className: "mt-4 text-sm text-muted-foreground hover:text-foreground", children: "\u2190 Back to agent" })] }));
    }
    const conversation = conversationQuery.data;
    const title = conversation.title
        ? String(conversation.title)
        : "Untitled conversation";
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center gap-3 border-b px-4 py-3 shrink-0", children: [_jsx("button", { type: "button", onClick: openDrawer, className: "inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent md:hidden", children: _jsx(PanelLeft, { className: "h-4 w-4" }) }), _jsx(Link, { to: "/agents/$slug", params: { slug }, className: "hidden md:inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent", children: _jsx(ArrowLeft, { className: "h-4 w-4" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h1", { className: "text-sm font-medium truncate", children: title }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [slug, !connected && (_jsx("span", { className: "ml-2 text-yellow-600 dark:text-yellow-400", children: "(reconnecting...)" }))] })] })] }), _jsxs("div", { ref: messagesContainerRef, onScroll: handleScroll, className: "flex-1 overflow-y-auto px-4 py-4 space-y-4", children: [loadingMore && (_jsx("div", { className: "flex justify-center py-2", children: _jsx(Loader2, { className: "h-4 w-4 animate-spin text-muted-foreground" }) })), nextCursor && !loadingMore && (_jsx("button", { type: "button", onClick: () => handleScroll(), className: "w-full text-center text-xs text-muted-foreground hover:text-foreground py-2", children: "Load older messages" })), localMessages.length === 0 && (_jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-center", children: [_jsx(Bot, { className: "h-10 w-10 text-muted-foreground mb-3" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Send a message to start the conversation." })] })), localMessages.map((msg) => (_jsx(MessageBubble, { message: msg }, msg.id))), sending &&
                        !localMessages.some((m) => m.senderType === "agent" && m.pending) && (_jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0", children: _jsx(Bot, { className: "h-4 w-4 text-muted-foreground" }) }), _jsx("div", { className: "rounded-2xl rounded-tl-sm bg-muted px-4 py-2", children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" }), _jsx("span", { className: "h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" }), _jsx("span", { className: "h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" })] }) })] })), _jsx("div", { ref: messagesEndRef })] }), _jsx("div", { className: "border-t px-4 py-3 shrink-0", children: _jsxs("div", { className: "flex items-end gap-2 max-w-4xl mx-auto", children: [_jsx("textarea", { value: inputValue, onChange: (e) => setInputValue(e.target.value), onKeyDown: handleKeyDown, placeholder: "Type a message...", rows: 1, className: "flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-[120px]", style: {
                                height: "auto",
                                overflow: "hidden",
                            }, onInput: (e) => {
                                const target = e.target;
                                target.style.height = "auto";
                                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                            } }), _jsx(Button, { size: "sm", onClick: handleSend, disabled: !inputValue.trim() || sending, className: "h-10 w-10 p-0 shrink-0", children: _jsx(Send, { className: "h-4 w-4" }) })] }) })] }));
}
function MessageBubble({ message }) {
    const isUser = message.senderType === "user";
    const time = new Date(message.createdAt);
    const timeStr = time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    if (isUser) {
        return (_jsxs("div", { className: "flex items-start gap-3 justify-end", children: [_jsxs("div", { className: "flex flex-col items-end max-w-[80%]", children: [_jsx("div", { className: "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2", children: _jsx("p", { className: "text-sm whitespace-pre-wrap break-words", children: message.content }) }), _jsx("span", { className: "text-[10px] text-muted-foreground mt-1", children: timeStr })] }), _jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0", children: _jsx(User, { className: "h-4 w-4 text-primary" }) })] }));
    }
    return (_jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0", children: _jsx(Bot, { className: "h-4 w-4 text-muted-foreground" }) }), _jsxs("div", { className: "flex flex-col max-w-[80%]", children: [_jsx("div", { className: `rounded-2xl rounded-tl-sm px-4 py-2 ${message.error
                            ? "bg-destructive/10 border border-destructive/20"
                            : "bg-muted"}`, children: _jsx("p", { className: `text-sm whitespace-pre-wrap break-words ${message.error ? "text-destructive" : ""}`, children: message.content }) }), _jsxs("span", { className: "text-[10px] text-muted-foreground mt-1", children: [timeStr, message.pending && (_jsx("span", { className: "ml-1 text-yellow-600 dark:text-yellow-400", children: "streaming..." })), message.error && (_jsx("span", { className: "ml-1 text-destructive", children: "Error" }))] })] })] }));
}
function ConversationSkeleton({ slug }) {
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center gap-3 border-b px-4 py-3", children: [_jsx("div", { className: "h-8 w-8 md:hidden" }), _jsx(Link, { to: "/agents/$slug", params: { slug }, className: "hidden md:inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent", children: _jsx(ArrowLeft, { className: "h-4 w-4" }) }), _jsxs("div", { className: "flex-1 space-y-1", children: [_jsx(Skeleton, { className: "h-4 w-48" }), _jsx(Skeleton, { className: "h-3 w-24" })] })] }), _jsx("div", { className: "flex-1 px-4 py-4 space-y-4", children: Array.from({ length: 4 }).map((_, i) => (_jsxs("div", { className: `flex items-start gap-3 ${i % 2 === 0 ? "" : "justify-end"}`, children: [_jsx(Skeleton, { className: "h-8 w-8 rounded-full shrink-0" }), _jsx(Skeleton, { className: `h-16 rounded-2xl ${i % 2 === 0 ? "w-64" : "w-48"}` })] }, i))) }), _jsx("div", { className: "border-t px-4 py-3", children: _jsx(Skeleton, { className: "h-10 w-full rounded-lg" }) })] }));
}
