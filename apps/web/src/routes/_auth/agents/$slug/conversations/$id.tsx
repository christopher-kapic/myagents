import { Button } from "@myagents/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@myagents/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@myagents/ui/components/dropdown-menu";
import { Input } from "@myagents/ui/components/input";
import { Skeleton } from "@myagents/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileJson,
  FileText,
  Loader2,
  Mic,
  MicOff,
  MoreVertical,
  PanelLeft,
  Pencil,
  Send,
  Square,
  Trash2,
  User,
  Wrench,
  X,
} from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  Fragment,
} from "react";

import { useConversationSocket } from "@/hooks/use-conversation-socket";
import { useFocusOnChange } from "@/hooks/use-focus-on-change";
import { useMarkAsRead } from "@/hooks/use-mark-as-read";
import { useMessagesFromQuery } from "@/hooks/use-messages-from-query";
import { useScrollOnChange } from "@/hooks/use-scroll-on-change";
import { useTranscriptSync } from "@/hooks/use-transcript-sync";
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute(
  "/_auth/agents/$slug/conversations/$id",
)({
  component: ConversationPage,
});

interface OpenClawMeta {
  provider?: string;
  model?: string;
  durationMs?: number;
  tools?: Array<{ name: string }>;
  skills?: Array<{ name: string }>;
}

interface ChatMessage {
  id: string;
  content: string;
  senderType: string;
  createdAt: string | Date;
  pending?: boolean;
  pendingDelivery?: boolean;
  error?: boolean;
  openclawMeta?: OpenClawMeta;
}

const CLI_METADATA_PREFIXES = ["↻ Resumed session"];

function isCliMetadata(content: string): boolean {
  const trimmed = content.trim();
  // Only filter messages that are entirely CLI metadata (a single short line),
  // not messages that happen to start with metadata followed by actual content
  return CLI_METADATA_PREFIXES.some(
    (prefix) => trimmed.startsWith(prefix) && !trimmed.includes("\n"),
  );
}

function ConversationPage() {
  const { slug, id } = Route.useParams();
  const isOwn = !slug.includes("/");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { connected, sendFrame, subscribe } = useWebSocket();
  useMarkAsRead(id, sendFrame, subscribe);
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

  const updateQueueMutation = useMutation({
    mutationFn: ({ queuedId, content }: { queuedId: string; content: string }) =>
      orpc.queuedMessages.update.call({ id: queuedId, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.queuedMessages.list.queryOptions({
          input: { conversationId: id },
        }).queryKey,
      });
      setEditingQueueId(null);
    },
  });

  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueValue, setEditingQueueValue] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Insert transcribed text into input
  useTranscriptSync(voice.transcript, voice.reset, setInputValue, textareaRef);

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
  useMessagesFromQuery(messagesQuery.data, setLocalMessages, setNextCursor, setSending);

  // Scroll to bottom on new messages
  useScrollOnChange(messagesContainerRef, localMessages);

  // Listen for WebSocket events (streaming chunks, done, errors, cross-device sync)
  useConversationSocket({
    conversationId: id,
    subscribe,
    queryClient,
    setLocalMessages,
    setSending,
    scrollToBottom,
  });

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

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => orpc.conversations.delete.call({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.conversations.key(),
      });
      setShowDeleteDialog(false);
      navigate({ to: "/agents/$slug", params: { slug } });
    },
  });

  // Focus input when entering rename mode
  useFocusOnChange(renameInputRef, isRenaming);

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
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span>{slug}</span>
            {!isOwn && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Shared
              </span>
            )}
            {!connected && (
              <span className="text-yellow-600 dark:text-yellow-400">
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
            <MoreVertical className="h-4 w-4" />
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete conversation
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

        {localMessages
          .filter((msg) => !isCliMetadata(msg.content))
          .map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              renderMarkdown={agentData?.renderMarkdown !== false}
              isHermes={agentData?.type === "hermes"}
            />
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
              {editingQueueId === qm.id ? (
                <div className="w-full min-w-[200px]">
                  <textarea
                    ref={editTextareaRef}
                    value={editingQueueValue}
                    onChange={(e) => setEditingQueueValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        const trimmed = editingQueueValue.trim();
                        if (trimmed && trimmed !== qm.content) {
                          updateQueueMutation.mutate({ queuedId: qm.id, content: trimmed });
                        } else {
                          setEditingQueueId(null);
                        }
                      } else if (e.key === "Escape") {
                        setEditingQueueId(null);
                      }
                    }}
                    className="w-full resize-none rounded-2xl rounded-tr-sm bg-primary/50 text-primary-foreground px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-[120px]"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                    }}
                  />
                  <div className="flex items-center gap-1 mt-1 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = editingQueueValue.trim();
                        if (trimmed && trimmed !== qm.content) {
                          updateQueueMutation.mutate({ queuedId: qm.id, content: trimmed });
                        } else {
                          setEditingQueueId(null);
                        }
                      }}
                      disabled={updateQueueMutation.isPending}
                      className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent"
                    >
                      <Check className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingQueueId(null)}
                      className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl rounded-tr-sm bg-primary/50 text-primary-foreground px-4 py-2 relative group">
                    <p className="text-sm whitespace-pre-wrap break-words opacity-70">
                      {qm.content}
                    </p>
                    <div className="absolute -top-2 -left-2 flex items-center gap-0.5 md:hidden md:group-hover:flex">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQueueId(qm.id);
                          setEditingQueueValue(qm.content);
                          setTimeout(() => editTextareaRef.current?.focus(), 0);
                        }}
                        className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:bg-accent"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteQueueMutation.mutate(qm.id)}
                        className="h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Queued
                  </span>
                </>
              )}
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConversationDialog
        open={showDeleteDialog}
        title={title}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />

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
        {isOpenClaw && availableOpenClawAgents.length >= 1 && (
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

/**
 * Separate hermes quiet-mode tool call lines from actual message content.
 * Tool lines match patterns like "┊ 💻 $ git status 0.3s" or "┊ 🔍 search ..."
 */
function separateToolLines(content: string): {
  toolLines: string[];
  displayContent: string;
} {
  const lines = content.split("\n");
  const toolLines: string[] = [];
  const contentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match hermes tool output: starts with ┊ (or skin prefix) followed by emoji + tool info + duration
    if (/^┊\s/.test(trimmed) && /\d+\.\d+s\s*(\[.*\])?\s*$/.test(trimmed)) {
      toolLines.push(trimmed);
    } else {
      contentLines.push(line);
    }
  }

  // Trim leading/trailing blank lines from remaining content
  const displayContent = contentLines.join("\n").trim();

  return { toolLines, displayContent };
}

function MessageBubble({
  message,
  renderMarkdown = true,
  isHermes = false,
}: {
  message: ChatMessage;
  renderMarkdown?: boolean;
  isHermes?: boolean;
}) {
  const isUser = message.senderType === "user";
  const time = new Date(message.createdAt);
  const timeStr = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end group/msg">
        <div className="flex flex-col items-end max-w-[80%]">
          <div className="flex items-start gap-1">
            <CopyButton text={message.content} className="opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0 mt-1" />
            <div className={`rounded-2xl rounded-tr-sm px-4 py-2 ${
              message.pendingDelivery
                ? "bg-primary/50 text-primary-foreground"
                : "bg-primary text-primary-foreground"
            }`}>
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            {message.pendingDelivery ? (
              <>
                <Clock className="h-3 w-3" />
                Pending delivery — agent offline
              </>
            ) : (
              timeStr
            )}
          </span>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
      </div>
    );
  }

  const meta = message.openclawMeta;
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const toolCount = (meta?.tools?.length ?? 0) + (meta?.skills?.length ?? 0);

  // Separate inline tool call lines (e.g. "┊ 💻 $ git status 0.3s") from actual content
  // Only applies to hermes agents which produce this format in quiet mode
  const { toolLines, displayContent } = isHermes
    ? separateToolLines(message.content)
    : { toolLines: [], displayContent: message.content };
  const [inlineToolsExpanded, setInlineToolsExpanded] = useState(false);

  return (
    <div className="flex items-start gap-3 group/msg">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col max-w-[80%]">
        {toolLines.length > 0 && (
          <button
            type="button"
            onClick={() => setInlineToolsExpanded((v) => !v)}
            className="mb-1 inline-flex items-center gap-1 self-start rounded-full bg-muted/60 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
          >
            <Wrench className="h-2.5 w-2.5" />
            <span>{toolLines.length} tool call{toolLines.length !== 1 ? "s" : ""}</span>
            <ChevronDown className={`h-2.5 w-2.5 transition-transform ${inlineToolsExpanded ? "rotate-180" : ""}`} />
          </button>
        )}
        {inlineToolsExpanded && toolLines.length > 0 && (
          <div className="mb-1 rounded-lg bg-muted/40 border border-border/50 px-3 py-2 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap">
            {toolLines.join("\n")}
          </div>
        )}
        <div
          className={`rounded-2xl rounded-tl-sm px-4 py-2 ${
            message.error
              ? "bg-destructive/10 border border-destructive/20"
              : "bg-muted"
          }`}
        >
          {!isUser && renderMarkdown && !message.error ? (
            <div className="text-sm break-words overflow-x-auto prose prose-sm dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2 prose-code:before:content-[''] prose-code:after:content-[''] max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre({ children, ...props }) {
                    return (
                      <pre {...props} className="relative group/code">
                        {children}
                        <CopyCodeButton node={props.node} />
                      </pre>
                    );
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          ) : (
            <p
              className={`text-sm whitespace-pre-wrap break-words ${
                message.error ? "text-destructive" : ""
              }`}
            >
              {displayContent}
            </p>
          )}
        </div>
        {meta && (
          <div className="mt-1.5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {meta.model && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5">
                  {meta.provider && <span className="opacity-60">{meta.provider}/</span>}
                  {meta.model.replace(/^.*\//, "")}
                </span>
              )}
              {meta.durationMs != null && (
                <span className="opacity-60">
                  {(meta.durationMs / 1000).toFixed(1)}s
                </span>
              )}
              {toolCount > 0 && (
                <button
                  type="button"
                  onClick={() => setToolsExpanded((v) => !v)}
                  className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 px-2 py-0.5 hover:bg-muted transition-colors"
                >
                  <Wrench className="h-2.5 w-2.5" />
                  <span>{toolCount} tool{toolCount !== 1 ? "s" : ""}</span>
                  <ChevronDown className={`h-2.5 w-2.5 transition-transform ${toolsExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {toolsExpanded && toolCount > 0 && (
              <div className="rounded-lg bg-muted/40 border border-border/50 px-3 py-2 text-[10px] text-muted-foreground">
                {meta.tools && meta.tools.length > 0 && (
                  <div>
                    <span className="font-medium">Tools:</span>{" "}
                    {meta.tools.map((t, i) => (
                      <Fragment key={t.name}>
                        {i > 0 && <span className="opacity-40"> · </span>}
                        <span>{t.name}</span>
                      </Fragment>
                    ))}
                  </div>
                )}
                {meta.skills && meta.skills.length > 0 && (
                  <div className={meta.tools?.length ? "mt-1" : ""}>
                    <span className="font-medium">Skills:</span>{" "}
                    {meta.skills.map((s, i) => (
                      <Fragment key={s.name}>
                        {i > 0 && <span className="opacity-40"> · </span>}
                        <span>{s.name}</span>
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <span className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
          {timeStr}
          {message.pending && (
            <span className="ml-1 text-yellow-600 dark:text-yellow-400">
              streaming...
            </span>
          )}
          {message.error && (
            <span className="ml-1 text-destructive">Error</span>
          )}
          {!message.pending && (
            <CopyButton text={displayContent} className="opacity-0 group-hover/msg:opacity-100 transition-opacity" />
          )}
        </span>
      </div>
    </div>
  );
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`inline-flex items-center justify-center h-6 w-6 rounded hover:bg-accent/50 transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

function CopyCodeButton({ node }: { node?: unknown }) {
  // Extract text content from the <pre> AST node
  const getCodeText = (): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { children?: Array<{ children?: Array<{ value?: string }> }> };
    const codeChild = n.children?.[0];
    if (!codeChild?.children) return "";
    return codeChild.children.map((c) => c.value ?? "").join("");
  };

  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(getCodeText());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 hidden group-hover/code:inline-flex items-center justify-center h-6 w-6 rounded bg-background/80 hover:bg-background transition-colors"
      title="Copy code"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

function DeleteConversationDialog({
  open,
  title,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const isConfirmed = confirmText === title;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
          setConfirmText("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Conversation</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the
            conversation and all its messages.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-sm">
            Type{" "}
            <span className="inline-flex items-center gap-1">
              <span className="font-mono font-medium text-foreground">
                {title}
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(title)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Copy to clipboard"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>
            </span>{" "}
            to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={title}
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
            onClick={onConfirm}
          >
            {isPending ? "Deleting..." : "Delete Conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
