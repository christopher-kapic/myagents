import { Button } from "@myagents/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@myagents/ui/components/dropdown-menu";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Check,
  Clock,
  Download,
  FileJson,
  FileText,
  Loader2,
  Mic,
  MicOff,
  PanelLeft,
  Pencil,
  Send,
  Square,
  User,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { useWebSocket } from "@/hooks/use-websocket";
import { useConversationSidebar } from "@/routes/_auth/agents/$slug/conversations";
import {
  downloadFile,
  formatConversationAsJSON,
  formatConversationAsMarkdown,
  makeExportFilename,
} from "@/utils/export";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute(
  "/_auth/agents/$slug/conversations/$id",
)({
  component: ConversationPage,
});

interface ChatMessage {
  id: string;
  content: string;
  senderType: string;
  createdAt: string | Date;
  pending?: boolean;
  error?: boolean;
}

function ConversationPage() {
  const { slug, id } = Route.useParams();
  const queryClient = useQueryClient();
  const { connected, sendFrame, subscribe } = useWebSocket();
  const { openDrawer } = useConversationSidebar();
  const [inputValue, setInputValue] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const voice = useVoiceRecording();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectedOpenClawAgent, setSelectedOpenClawAgent] = useState<string>("");

  // Fetch agent data to check for openclaw type and available agents
  const agentQuery = useQuery(orpc.agents.get.queryOptions({ input: { slug } }));
  const agentData = agentQuery.data as Record<string, unknown> | undefined;
  const isOpenClaw = agentData?.type === "openclaw";
  const openclawAdapterConfig = agentData?.adapterConfig as Record<string, unknown> | null;
  const availableOpenClawAgents = (openclawAdapterConfig?.availableAgents as Array<{ id: string; name?: string; isDefault: boolean }>) ?? [];
  const defaultOpenClawAgent = (openclawAdapterConfig?.agentId as string) ?? "";

  // Scroll only the messages container to the bottom (avoids scrolling <main> or the whole page)
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    }
  }, []);

  // Server-backed message queue
  const queueQuery = useQuery(
    orpc.queuedMessages.list.queryOptions({ input: { conversationId: id } }),
  );
  const queuedMessages = (queueQuery.data ?? []) as unknown as Array<{
    id: string;
    content: string;
    position: number;
    createdAt: string;
  }>;

  const queueMutation = useMutation({
    mutationFn: (content: string) =>
      orpc.queuedMessages.create.call({ conversationId: id, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.queuedMessages.list.queryOptions({
          input: { conversationId: id },
        }).queryKey,
      });
    },
  });

  const deleteQueueMutation = useMutation({
    mutationFn: (queuedId: string) =>
      orpc.queuedMessages.delete.call({ id: queuedId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.queuedMessages.list.queryOptions({
          input: { conversationId: id },
        }).queryKey,
      });
    },
  });

  // Insert transcribed text into input
  useEffect(() => {
    if (voice.transcript) {
      setInputValue((prev) => {
        const separator = prev.trim() ? " " : "";
        return prev + separator + voice.transcript;
      });
      voice.reset();
      // Focus textarea so user can edit before sending
      textareaRef.current?.focus();
    }
  }, [voice.transcript]);

  // Load conversation details
  const conversationQuery = useQuery(
    orpc.conversations.get.queryOptions({ input: { id } }),
  );

  // Load initial messages via paginated endpoint
  const messagesQuery = useQuery(
    orpc.messages.list.queryOptions({
      input: { conversationId: id, limit: 50 },
    }),
  );

  // Initialize messages from query
  useEffect(() => {
    if (messagesQuery.data) {
      const data = messagesQuery.data as {
        items: ChatMessage[];
        nextCursor: string | null;
      };
      // messages.list returns desc order, reverse for display (oldest first)
      const msgs = data.items.slice().reverse();
      setLocalMessages(msgs);
      setNextCursor(data.nextCursor);
      // If the last message is from the user, the agent is likely still working
      const last = msgs[msgs.length - 1];
      if (last && last.senderType === "user") {
        setSending(true);
      }
    }
  }, [messagesQuery.data]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (localMessages.length > 0) {
      scrollToBottom();
    }
  }, [localMessages, scrollToBottom]);

  // Listen for WebSocket events (streaming chunks, done, errors, cross-device sync)
  useEffect(() => {
    const unsubscribe = subscribe((frame) => {
      // Handle message.new — a message sent from another device/browser
      if (frame.method === "message.new") {
        const payload = frame.payload as {
          conversationId?: string;
          messageId?: string;
          content?: string;
          senderType?: string;
          createdAt?: string;
        };
        if (payload?.conversationId === id && payload.content) {
          setLocalMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === payload.messageId)) return prev;
            return [
              ...prev,
              {
                id: payload.messageId ?? `remote-${Date.now()}`,
                content: payload.content!,
                senderType: payload.senderType ?? "user",
                createdAt: payload.createdAt ?? new Date().toISOString(),
              },
            ];
          });
          if (payload.senderType === "user") {
            setSending(true);
          }
        }
      }

      // Handle streaming chunks — append to pending agent message
      if (frame.method === "message.chunk") {
        const payload = frame.payload as {
          conversationId?: string;
          chunk?: string;
        };
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
                content: payload.chunk!,
                senderType: "agent",
                createdAt: new Date().toISOString(),
                pending: true,
              },
            ];
          });
          // Scroll to bottom during streaming
          requestAnimationFrame(() => {
            scrollToBottom();
          });
        }
      }

      // Handle message.done — finalize the pending streaming message or add new
      if (frame.method === "message.done") {
        const payload = frame.payload as {
          conversationId?: string;
          messageId?: string;
          content?: string;
          error?: boolean;
        };
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
                  content: payload.content!,
                  pending: false,
                  error: payload.error || undefined,
                },
              ];
            }
            // No streaming message — add the complete response directly
            return [
              ...prev,
              {
                id: payload.messageId ?? crypto.randomUUID(),
                content: payload.content!,
                senderType: "agent",
                createdAt: new Date().toISOString(),
                error: payload.error || undefined,
              },
            ];
          });
          setSending(false);
          // Invalidate conversation list to update last message preview
          if (!payload.error) {
            queryClient.invalidateQueries({
              queryKey: orpc.conversations.list.queryOptions({
                input: { agentId: "" },
              }).queryKey[0]
                ? undefined
                : undefined,
            });
          }
        }
      }

      // Handle error responses from message.send (agent offline, not found, etc.)
      if (
        frame.method === "message.send" &&
        frame.type === "res" &&
        frame.error
      ) {
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
      if (
        frame.method === "message.response" &&
        frame.type === "res" &&
        frame.error
      ) {
        const payload = frame.payload as { conversationId?: string };
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
                  content:
                    last.content +
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

      // Handle message.cancel — another device cancelled, or server confirmed
      if (frame.method === "message.cancel") {
        const payload = frame.payload as { conversationId?: string };
        if (payload?.conversationId === id) {
          // Finalize any pending streaming message as cancelled
          setLocalMessages((prev) => {
            const lastIdx = prev.length - 1;
            const last = prev[lastIdx];
            if (last && last.senderType === "agent" && last.pending) {
              return [
                ...prev.slice(0, lastIdx),
                { ...last, pending: false },
              ];
            }
            return prev;
          });
          setSending(false);
          // Refresh queue since queued messages are cleared on cancel
          queryClient.invalidateQueries({
            queryKey: orpc.queuedMessages.list.queryOptions({
              input: { conversationId: id },
            }).queryKey,
          });
        }
      }

      // Handle queue.dequeued — server processed a queued message
      if (frame.method === "queue.dequeued") {
        const payload = frame.payload as {
          conversationId?: string;
        };
        if (payload?.conversationId === id) {
          queryClient.invalidateQueries({
            queryKey: orpc.queuedMessages.list.queryOptions({
              input: { conversationId: id },
            }).queryKey,
          });
        }
      }
    });

    return unsubscribe;
  }, [id, subscribe, queryClient]);

  // Export conversation as Markdown or JSON
  const handleExport = useCallback(
    (format: "markdown" | "json") => {
      const convTitle =
        conversationQuery.data && (conversationQuery.data as Record<string, unknown>).title
          ? String((conversationQuery.data as Record<string, unknown>).title)
          : null;
      const conv = {
        title: convTitle,
        messages: localMessages.filter((m) => !m.pending && !m.error),
      };
      const filename = makeExportFilename(slug, convTitle, format);
      if (format === "markdown") {
        const content = formatConversationAsMarkdown(conv, slug);
        downloadFile(content, filename, "text/markdown");
      } else {
        const content = formatConversationAsJSON(conv, slug);
        downloadFile(content, filename, "application/json");
      }
    },
    [conversationQuery.data, localMessages, slug],
  );

  // Send a message immediately (used internally)
  const sendMessage = useCallback(
    (content: string) => {
      const userMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        content,
        senderType: "user",
        createdAt: new Date().toISOString(),
      };
      setLocalMessages((prev) => [...prev, userMsg]);
      setSending(true);
      const openclawAgentId = selectedOpenClawAgent || defaultOpenClawAgent;
      sendFrame("message.send", {
        conversationId: id,
        agentSlug: slug,
        content,
        ...(isOpenClaw && openclawAgentId ? { openclawAgentId } : {}),
      });
    },
    [id, slug, sendFrame, isOpenClaw, selectedOpenClawAgent, defaultOpenClawAgent],
  );

  // Cancel the current agent response
  const handleCancel = useCallback(() => {
    sendFrame("message.cancel", { conversationId: id });
    // Optimistically finalize any pending streaming message
    setLocalMessages((prev) => {
      const lastIdx = prev.length - 1;
      const last = prev[lastIdx];
      if (last && last.senderType === "agent" && last.pending) {
        return [
          ...prev.slice(0, lastIdx),
          { ...last, pending: false },
        ];
      }
      return prev;
    });
    setSending(false);
  }, [id, sendFrame]);

  // Send message or queue it if already sending
  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content) return;

    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    if (sending) {
      // Queue the message server-side
      queueMutation.mutate(content);
    } else {
      sendMessage(content);
    }
  }, [inputValue, sending, sendMessage, queueMutation]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Load more messages on scroll up
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current || !nextCursor || loadingMore) return;
    const { scrollTop } = messagesContainerRef.current;
    if (scrollTop < 100) {
      setLoadingMore(true);
      orpc.messages.list
        .call({ conversationId: id, cursor: nextCursor, limit: 50 })
        .then((data) => {
          const result = data as {
            items: ChatMessage[];
            nextCursor: string | null;
          };
          const older = result.items.slice().reverse();
          setOlderMessages((prev) => [...older, ...prev]);
          setLocalMessages((prev) => [...older, ...prev]);
          setNextCursor(result.nextCursor);
        })
        .finally(() => setLoadingMore(false));
    }
  }, [id, nextCursor, loadingMore]);

  // Rename state — must be declared before early returns to satisfy Rules of Hooks
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const renameMutation = useMutation({
    mutationFn: (newTitle: string) =>
      orpc.conversations.update.call({ id, title: newTitle }),
    onSuccess: () => {
      setIsRenaming(false);
      queryClient.invalidateQueries({
        queryKey: orpc.conversations.get.queryOptions({ input: { id } }).queryKey,
      });
      // Also refresh sidebar list
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey.some((k) => typeof k === "string" && k.includes("conversations")),
      });
    },
  });

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  if (conversationQuery.isLoading || messagesQuery.isLoading) {
    return <ConversationSkeleton slug={slug} />;
  }

  if (conversationQuery.isError || !conversationQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 text-center">
        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-1">Conversation not found</h3>
        <p className="text-sm text-muted-foreground">
          This conversation doesn't exist or you don't have access.
        </p>
        <Link
          to="/agents/$slug"
          params={{ slug }}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to agent
        </Link>
      </div>
    );
  }

  const conversation = conversationQuery.data as Record<string, unknown>;
  const title = conversation.title
    ? String(conversation.title)
    : "Untitled conversation";

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== title) {
      renameMutation.mutate(trimmed);
    } else {
      setIsRenaming(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
      setRenameValue(title);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        {/* Mobile: drawer toggle */}
        <button
          type="button"
          onClick={openDrawer}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent md:hidden"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        {/* Desktop: back to agent */}
        <Link
          to="/agents/$slug"
          params={{ slug }}
          className="hidden md:inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1">
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameSubmit}
                className="text-sm font-medium bg-transparent border-b border-foreground/30 focus:border-foreground outline-none w-full min-w-0"
                maxLength={255}
                disabled={renameMutation.isPending}
              />
              <button
                type="button"
                onClick={handleRenameSubmit}
                className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent shrink-0"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRenaming(false);
                  setRenameValue(title);
                }}
                className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 group">
              <h1 className="text-sm font-medium truncate">{title}</h1>
              <button
                type="button"
                onClick={() => {
                  setRenameValue(title);
                  setIsRenaming(true);
                }}
                className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {slug}
            {!connected && (
              <span className="ml-2 text-yellow-600 dark:text-yellow-400">
                (reconnecting...)
              </span>
            )}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent shrink-0"
              />
            }
          >
            <Download className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                handleExport("markdown")
              }
            >
              <FileText className="h-4 w-4" />
              Export as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                handleExport("json")
              }
            >
              <FileJson className="h-4 w-4" />
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {nextCursor && !loadingMore && (
          <button
            type="button"
            onClick={() => handleScroll()}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2"
          >
            Load older messages
          </button>
        )}

        {localMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Send a message to start the conversation.
            </p>
          </div>
        )}

        {localMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {sending &&
          !localMessages.some(
            (m) => m.senderType === "agent" && m.pending,
          ) && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

        {/* Queued messages */}
        {queuedMessages.map((qm) => (
          <div key={qm.id} className="flex items-start gap-3 justify-end">
            <div className="flex flex-col items-end max-w-[80%]">
              <div className="rounded-2xl rounded-tr-sm bg-primary/50 text-primary-foreground px-4 py-2 relative group">
                <p className="text-sm whitespace-pre-wrap break-words opacity-70">
                  {qm.content}
                </p>
                <button
                  type="button"
                  onClick={() => deleteQueueMutation.mutate(qm.id)}
                  className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center md:hidden md:group-hover:flex"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Queued
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3 shrink-0">
        {/* Voice recording status bar */}
        {voice.isModelLoading && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 text-xs text-muted-foreground bg-muted rounded-lg max-w-4xl mx-auto">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading speech model...</span>
            {voice.progressItems.length > 0 && (
              <span className="ml-auto tabular-nums">
                {Math.round(
                  voice.progressItems.reduce((s, p) => s + p.progress, 0) /
                    voice.progressItems.length,
                )}
                %
              </span>
            )}
          </div>
        )}
        {voice.isProcessing && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 text-xs text-muted-foreground bg-muted rounded-lg max-w-4xl mx-auto">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Transcribing...</span>
          </div>
        )}
        {voice.error && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 text-xs text-destructive bg-destructive/10 rounded-lg max-w-4xl mx-auto">
            <MicOff className="h-3 w-3" />
            <span>{voice.error}</span>
          </div>
        )}
        {voice.suggestWebSpeech && (
          <div className="flex items-center gap-2 px-3 py-1.5 mb-2 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-500/10 rounded-lg max-w-4xl mx-auto">
            <span>Whisper is slow on this device.</span>
            <button
              type="button"
              className="underline font-medium hover:no-underline"
              onClick={() => {
                voice.setEngine("web-speech");
                voice.dismissSuggestion();
              }}
            >
              Switch to Web Speech API
            </button>
            <button
              type="button"
              className="ml-auto text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200"
              onClick={() => voice.dismissSuggestion()}
            >
              Dismiss
            </button>
          </div>
        )}
        {isOpenClaw && availableOpenClawAgents.length > 1 && (
          <div className="flex items-center gap-2 max-w-4xl mx-auto mb-2">
            <label className="text-xs text-muted-foreground shrink-0">Agent:</label>
            <select
              value={selectedOpenClawAgent || defaultOpenClawAgent}
              onChange={(e) => setSelectedOpenClawAgent(e.target.value)}
              className="text-xs rounded-md border border-input bg-transparent px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {availableOpenClawAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ? `${a.name} (${a.id})` : a.id}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // On mobile, scroll messages to bottom when keyboard opens (only if there are messages)
              if (localMessages.length > 0) {
                setTimeout(() => {
                  scrollToBottom();
                }, 300);
              }
            }}
            placeholder={
              voice.isRecording ? "Listening..." : "Type a message..."
            }
            rows={1}
            className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-[120px]"
            style={{
              height: "auto",
              overflow: "hidden",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
          {/* Microphone button */}
          {voice.isSupported && (
            <Button
              size="sm"
              variant={voice.isRecording ? "destructive" : "outline"}
              onClick={voice.toggleRecording}
              disabled={voice.isProcessing || voice.isModelLoading}
              className="h-10 w-10 p-0 shrink-0 relative"
              onPointerDown={(e) => {
                // Press-and-hold: start recording on pointer down
                if (!voice.isRecording && !voice.isProcessing && !voice.isModelLoading) {
                  (e.currentTarget as HTMLButtonElement).dataset.holdStart =
                    String(Date.now());
                }
              }}
              onPointerUp={(e) => {
                // Press-and-hold: if held for >300ms, stop on release
                const holdStart = Number(
                  (e.currentTarget as HTMLButtonElement).dataset.holdStart || 0,
                );
                if (holdStart && Date.now() - holdStart > 300 && voice.isRecording) {
                  voice.stopRecording();
                  (e.currentTarget as HTMLButtonElement).dataset.holdStart = "";
                }
              }}
              onPointerLeave={(e) => {
                // If pointer leaves while holding, stop recording
                const holdStart = Number(
                  (e.currentTarget as HTMLButtonElement).dataset.holdStart || 0,
                );
                if (holdStart && voice.isRecording) {
                  voice.stopRecording();
                  (e.currentTarget as HTMLButtonElement).dataset.holdStart = "";
                }
              }}
            >
              {voice.isRecording ? (
                <>
                  {/* Pulsing ring animation while recording */}
                  <span
                    className="absolute inset-0 rounded-md animate-ping bg-destructive/20"
                    style={{
                      animationDuration: "1.5s",
                    }}
                  />
                  {/* Audio level indicator ring */}
                  <span
                    className="absolute inset-0 rounded-md border-2 border-destructive/50 transition-transform"
                    style={{
                      transform: `scale(${1 + voice.audioLevel * 0.3})`,
                    }}
                  />
                  <Square className="h-4 w-4 relative z-10" />
                </>
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          )}
          {sending ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
              className="h-10 w-10 p-0 shrink-0"
              title="Cancel response"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="h-10 w-10 p-0 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.senderType === "user";
  const time = new Date(message.createdAt);
  const timeStr = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="flex flex-col items-end max-w-[80%]">
          <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2">
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
          <span className="text-[10px] text-muted-foreground mt-1">
            {timeStr}
          </span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col max-w-[80%]">
        <div
          className={`rounded-2xl rounded-tl-sm px-4 py-2 ${
            message.error
              ? "bg-destructive/10 border border-destructive/20"
              : "bg-muted"
          }`}
        >
          <p
            className={`text-sm whitespace-pre-wrap break-words ${
              message.error ? "text-destructive" : ""
            }`}
          >
            {message.content}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground mt-1">
          {timeStr}
          {message.pending && (
            <span className="ml-1 text-yellow-600 dark:text-yellow-400">
              streaming...
            </span>
          )}
          {message.error && (
            <span className="ml-1 text-destructive">Error</span>
          )}
        </span>
      </div>
    </div>
  );
}

function ConversationSkeleton({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="h-8 w-8 md:hidden" />
        <Link
          to="/agents/$slug"
          params={{ slug }}
          className="hidden md:inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex-1 px-4 py-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 ${i % 2 === 0 ? "" : "justify-end"}`}
          >
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton
              className={`h-16 rounded-2xl ${i % 2 === 0 ? "w-64" : "w-48"}`}
            />
          </div>
        ))}
      </div>
      <div className="border-t px-4 py-3">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
