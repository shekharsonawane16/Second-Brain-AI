"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Bot, BrainCircuit, Check, Copy, FileText, Inbox, Link2, ListChecks, Loader2,
  MessageSquare, Paperclip, Plus, Quote, Send, Sparkles, Trash2, User, X
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AiStatusBanner } from "@/components/ai-status-banner";
import { useStore } from "@/lib/store";
import { aiRequest, fetchAiStatus, uploadAssistantFile } from "@/lib/ai/client";
import { renderMarkdown } from "@/lib/markdown";
import type {
  AiCitation, AiStatus, AssistantAction, Conversation, ConversationMessage, InboxItem
} from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const STARTERS = [
  "What should I focus on today?",
  "Which deadlines are most at risk?",
  "Summarise what I captured this week.",
  "What did I forget to follow up on?"
];

const ACTION_LABEL: Record<AssistantAction["type"], string> = {
  create_task: "Create task",
  create_note: "Create note",
  update_task: "Update task"
};

function citationHref(citation: AiCitation): string {
  if (citation.type === "task") return "/all";
  if (citation.type === "note") return `/notes?open=${citation.id}`;
  if (citation.type === "inbox") return `/inbox?item=${citation.id}`;
  if (citation.type === "memory") return `/memory?item=${citation.id}`;
  return "/knowledge";
}

function citationIcon(type: AiCitation["type"]) {
  if (type === "task") return ListChecks;
  if (type === "note") return FileText;
  if (type === "inbox") return Sparkles;
  if (type === "memory") return BrainCircuit;
  return Link2;
}

function actionSummary(action: AssistantAction): string {
  if (action.type === "create_task") {
    const p = action.payload;
    return [p.title, p.deadline_date ? `deadline ${p.deadline_date}` : null, p.category_hint].filter(Boolean).join(" · ");
  }
  if (action.type === "create_note") return action.payload.title;
  return action.payload.title || `Task ${action.payload.task_id}`;
}

export default function AssistantPage() {
  const {
    ready, user, settings, tasks, categories, projects, createTask, createSmartNote,
    updateTask, pushToast
  } = useStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [extractingFile, setExtractingFile] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<{ name: string; text: string } | null>(null);
  const [savingExtract, setSavingExtract] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<{ messageId: string; index: number } | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [confirmingAction, setConfirmingAction] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);
  const openHandled = useRef(false);

  const loadStatus = useCallback(async () => {
    setAiLoading(true);
    try {
      setAiStatus(await fetchAiStatus());
      setAiError(null);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Could not check AI status.");
    } finally {
      setAiLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const result = await aiRequest<{ conversations: Conversation[] }>("/api/ai/conversations");
      setConversations(result.conversations);
      setConversationError(null);
      return result.conversations;
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Could not load conversations.");
      return [];
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setLoadingMessages(true);
    setConversationError(null);
    setPendingAction(null);
    setApplied(new Set());
    window.history.replaceState(null, "", `/assistant?c=${encodeURIComponent(id)}`);
    try {
      const result = await aiRequest<{ conversation: Conversation; messages: ConversationMessage[] }>(
        `/api/ai/conversations/${id}`
      );
      setMessages(result.messages);
      setConversations((prev) => {
        const conversation = result.conversation;
        const exists = prev.some((row) => row.id === conversation.id);
        return exists ? prev.map((row) => (row.id === conversation.id ? conversation : row)) : [conversation, ...prev];
      });
    } catch (error) {
      setMessages([]);
      setConversationError(error instanceof Error ? error.message : "Could not load this conversation.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    loadStatus();
    loadConversations().then((list) => {
      if (openHandled.current) return;
      openHandled.current = true;
      const id = new URLSearchParams(window.location.search).get("c");
      if (id && list.some((conversation) => conversation.id === id)) openConversation(id);
    });
  }, [ready, user, loadStatus, loadConversations, openConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: sending ? "smooth" : "auto", block: "end" });
  }, [messages, sending, activeId]);

  const startNew = () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setConversationError(null);
    setPendingAction(null);
    setApplied(new Set());
    window.history.replaceState(null, "", "/assistant");
  };

  const sendMessage = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    if (question.length > 8000) {
      pushToast({ kind: "info", title: "That question is too long", body: "Use 8,000 characters or fewer." });
      return;
    }
    if (aiStatus && !aiStatus.configured) {
      pushToast({ kind: "info", title: "AI is not configured", body: "Add AI_API_KEY or your provider settings on the server." });
      return;
    }

    const temp: ConversationMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeId || "pending",
      role: "user",
      content: question,
      actions: [],
      citations: [],
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, temp]);
    setInput("");
    setSending(true);
    setConversationError(null);

    try {
      const result = await aiRequest<{
        conversation: Conversation;
        user_message: ConversationMessage;
        assistant_message: ConversationMessage;
      }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: activeId || undefined,
          message: question,
          timezone: settings.timezone,
          language: settings.ai_language
        })
      });
      setActiveId(result.conversation.id);
      window.history.replaceState(null, "", `/assistant?c=${encodeURIComponent(result.conversation.id)}`);
      setMessages((prev) => [...prev.filter((message) => message.id !== temp.id), result.user_message, result.assistant_message]);
      setConversations((prev) => {
        const rest = prev.filter((conversation) => conversation.id !== result.conversation.id);
        return [result.conversation, ...rest];
      });
    } catch (error) {
      setMessages((prev) => prev.filter((message) => message.id !== temp.id));
      setConversationError(error instanceof Error ? error.message : "The assistant could not answer.");
    } finally {
      setSending(false);
    }
  };

  const extractTextFromFile = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      pushToast({ kind: "error", title: "File too large", body: "The maximum upload size is 25 MB." });
      return;
    }
    setExtractingFile(file.name);
    setCopied(false);
    try {
      const upload = await uploadAssistantFile(file);
      const result = await aiRequest<{ text: string; filename: string }>("/api/ai/extract", {
        method: "POST",
        body: JSON.stringify({
          storage_path: upload.path,
          filename: upload.filename,
          mime_type: upload.mime
        })
      });
      setExtracted({ name: result.filename || file.name, text: result.text });
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Could not read that file",
        body: error instanceof Error ? error.message : "Try a clearer PDF or an image of the page."
      });
    } finally {
      setExtractingFile(null);
    }
  };

  const copyExtractedText = async () => {
    if (!extracted) return;
    try {
      await navigator.clipboard.writeText(extracted.text);
      setCopied(true);
      pushToast({ kind: "success", title: "Text copied" });
    } catch {
      pushToast({ kind: "error", title: "Could not copy", body: "Select the text and copy it manually." });
    }
  };

  const askAboutExtracted = () => {
    if (!extracted) return;
    setInput(
      `Read the text below extracted from "${extracted.name}". Give me a clear, organised summary with any tasks, deadlines, names and important details.\n\n${extracted.text.slice(0, 6000)}`
    );
    setExtracted(null);
  };

  const saveExtractedToInbox = async () => {
    if (!extracted || savingExtract) return;
    setSavingExtract(true);
    try {
      const title = extracted.name.replace(/\.[^.]+$/, "") || "Extracted document";
      const saved = await aiRequest<{ item: InboxItem }>("/api/ai/inbox", {
        method: "POST",
        body: JSON.stringify({
          type: "text",
          title,
          text: extracted.text,
          language: settings.ai_language
        })
      });
      setExtracted(null);
      pushToast({ kind: "success", title: "Saved to AI Life Inbox", body: "Processing the text now." });
      void aiRequest<{ item: InboxItem }>(`/api/ai/inbox/${saved.item.id}/process`, {
        method: "POST",
        body: JSON.stringify({ timezone: settings.timezone, language: settings.ai_language })
      }).then((result) => {
        pushToast({
          kind: "success",
          title: "Inbox capture ready",
          body: result.item.extracted?.summary || "Open AI Life Inbox to review it."
        });
      }).catch(() => {
        pushToast({ kind: "info", title: "Saved to inbox", body: "Open AI Life Inbox and press Process." });
      });
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Could not save to inbox",
        body: error instanceof Error ? error.message : "Try again."
      });
    } finally {
      setSavingExtract(false);
    }
  };

  const deleteConversation = async (conversation: Conversation) => {
    if (!confirm(`Delete "${conversation.title}" and its messages?`)) return;
    try {
      await aiRequest(`/api/ai/conversations/${conversation.id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((row) => row.id !== conversation.id));
      if (activeId === conversation.id) startNew();
      pushToast({ kind: "info", title: "Conversation deleted" });
    } catch (error) {
      pushToast({ kind: "error", title: "Could not delete chat", body: error instanceof Error ? error.message : "Try again." });
    }
  };

  const requestedAction = useMemo(() => {
    if (!pendingAction) return null;
    const message = messages.find((row) => row.id === pendingAction.messageId);
    const action = message?.actions[pendingAction.index];
    if (!message || !action) return null;
    return { message, action };
  }, [pendingAction, messages]);

  const indexCreatedMemory = (kind: "task" | "note", sourceId: string, title: string, content: string) => {
    void aiRequest("/api/ai/memory", {
      method: "POST",
      body: JSON.stringify({
        kind,
        source_id: sourceId,
        title,
        content,
        metadata: { source: "assistant" }
      })
    }).catch(() => undefined);
  };

  const applyAction = () => {
    if (!requestedAction) return;
    const { message, action } = requestedAction;
    try {
      if (action.type === "create_task") {
        const payload = action.payload;
        const category = categories.find((row) => row.name.toLowerCase() === (payload.category_hint || "").toLowerCase());
        const project = projects.find((row) => row.name.toLowerCase() === (payload.project_hint || "").toLowerCase());
        const task = createTask({
          title: payload.title,
          description: payload.description || "",
          category_id: category?.id || null,
          project_id: project?.id || null,
          subcategory: null,
          deadline_date: payload.deadline_date || null,
          deadline_time: payload.deadline_time || null,
          start_date: null,
          status: "todo",
          tags: payload.tags || [],
          estimated_minutes: payload.estimated_minutes ?? null,
          actual_minutes: null,
          notes_text: "Created from AI Assistant",
          is_today_focus: false
        });
        if (settings.ai_auto_index) indexCreatedMemory("task", task.id, task.title, [task.title, task.description].filter(Boolean).join("\n\n"));
        pushToast({ kind: "success", title: "Task created", body: task.title });
      } else if (action.type === "create_note") {
        const payload = action.payload;
        const note = createSmartNote({
          title: payload.title,
          content: payload.content,
          note_type: payload.note_type || "general",
          category_id: null,
          project_id: null,
          tags: payload.tags || []
        });
        if (settings.ai_auto_index) indexCreatedMemory("note", note.id, note.title, note.content);
        pushToast({ kind: "success", title: "Note created", body: note.title });
      } else {
        const payload = action.payload;
        const task = tasks.find((row) => row.id === payload.task_id);
        if (!task) throw new Error("That task no longer exists.");
        updateTask(task.id, {
          ...(payload.title ? { title: payload.title } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.deadline_date !== undefined ? { deadline_date: payload.deadline_date || null } : {}),
          ...(payload.deadline_time !== undefined ? { deadline_time: payload.deadline_time || null } : {})
        });
        pushToast({ kind: "success", title: "Task updated", body: task.title });
      }
      setApplied((prev) => new Set(prev).add(`${message.id}:${pendingAction?.index}`));
      setPendingAction(null);
      setConfirmingAction(false);
    } catch (error) {
      pushToast({ kind: "error", title: "Could not apply action", body: error instanceof Error ? error.message : "Try again." });
    }
  };

  if (!ready) return <div className="skeleton h-64 w-full" />;

  if (!user) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Sign in to use the AI Assistant"
        body="The assistant needs a cloud account so it can read your private workspace and remember conversations."
      />
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        icon={Sparkles}
        title="AI Assistant"
        subtitle="Ask about your tasks, notes and captures. Answers cite your data, and every change needs your approval."
        actions={
          <button onClick={startNew} className="btn-ghost flex items-center gap-1.5 text-xs">
            <Plus size={13} /> New chat
          </button>
        }
      />

      <AiStatusBanner status={aiStatus} error={aiError} loading={aiLoading} onRefresh={loadStatus} />

      <div className="card grid h-[calc(100dvh-12.5rem)] min-h-[540px] overflow-hidden md:grid-cols-[250px_1fr]">
        <aside className="hidden min-h-0 flex-col border-r md:flex">
          <div className="border-b p-2.5">
            <button onClick={startNew} className="btn-primary flex w-full items-center justify-center gap-1.5 text-xs">
              <Plus size={13} /> New conversation
            </button>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5">
            {loadingConversations ? (
              <div className="space-y-1.5 p-1">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-3 text-center text-[11px] text-muted-foreground">No conversations yet.</p>
            ) : (
              conversations.map((conversation) => (
                <div key={conversation.id} className={cn("group flex items-center gap-1 rounded-lg", activeId === conversation.id ? "bg-indigo-500/15" : "hover:bg-muted")}>
                  <button onClick={() => openConversation(conversation.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-xs">
                    <MessageSquare size={13} className={activeId === conversation.id ? "shrink-0 text-indigo-400" : "shrink-0 text-muted-foreground"} />
                    <span className="truncate">{conversation.title}</span>
                  </button>
                  <button onClick={() => deleteConversation(conversation)} className="mr-1 rounded p-1 text-muted-foreground opacity-0 transition hover:text-red-400 group-hover:opacity-100" aria-label="Delete conversation">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="border-t p-2.5 text-[10px] leading-relaxed text-muted-foreground">
            AI can make mistakes. Verify deadlines and task changes before applying them.
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <select
              value={activeId || ""}
              onChange={(e) => { if (e.target.value) openConversation(e.target.value); else startNew(); }}
              className="input max-w-52 !py-1.5 text-xs md:hidden"
              aria-label="Conversation"
            >
              <option value="">New conversation</option>
              {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
            </select>
            <div className="hidden min-w-0 flex-1 md:block">
              <p className="truncate text-xs font-semibold">{conversations.find((row) => row.id === activeId)?.title || "New conversation"}</p>
              <p className="text-[10px] text-muted-foreground">Only your own tasks, notes, links and memories are used.</p>
            </div>
            <button onClick={startNew} className="btn-icon ml-auto md:hidden" aria-label="New chat"><Plus size={15} /></button>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
            {loadingMessages ? (
              <div className="space-y-4">
                <div className="skeleton ml-auto h-16 w-2/3" />
                <div className="skeleton h-28 w-4/5" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
                  <Bot size={24} />
                </span>
                <h2 className="mt-3 text-lg font-bold">What can I help you with?</h2>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Ask about deadlines, projects or anything you captured. The assistant can propose tasks and notes, but nothing changes until you approve it.
                </p>
                <div className="mt-4 grid w-full max-w-lg gap-1.5 sm:grid-cols-2">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      onClick={() => sendMessage(starter)}
                      disabled={sending || Boolean(aiStatus && !aiStatus.configured)}
                      className="rounded-xl border bg-card px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-indigo-500/40 hover:text-foreground disabled:opacity-50"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.filter((message) => message.role !== "system").map((message) => (
                  <div key={message.id} className={cn("flex gap-2.5", message.role === "user" && "justify-end")}>
                    {message.role === "assistant" && (
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                        <Bot size={14} />
                      </span>
                    )}
                    <div className={cn("min-w-0 max-w-[88%]", message.role === "user" && "order-first")}>
                      <div className={cn(
                        "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        message.role === "user" ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md border bg-muted/40"
                      )}>
                        {message.role === "user" ? (
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        ) : (
                          <div
                            className="md-preview break-words"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                          />
                        )}
                      </div>

                      {message.citations.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {message.citations.map((citation) => {
                            const Icon = citationIcon(citation.type);
                            return (
                              <a
                                key={`${citation.type}:${citation.id}`}
                                href={citationHref(citation)}
                                className="inline-flex max-w-full items-center gap-1 rounded-md border bg-card px-1.5 py-1 text-[10px] text-muted-foreground transition hover:border-indigo-500/40 hover:text-foreground"
                                title={citation.excerpt}
                              >
                                <Icon size={10} className="shrink-0 text-indigo-400" />
                                <span className="truncate">{citation.title}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}

                      {message.actions.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {message.actions.map((action, index) => {
                            const key = `${message.id}:${index}`;
                            const done = applied.has(key);
                            return (
                              <div key={key} className={cn("rounded-xl border p-2.5", done ? "border-emerald-500/25 bg-emerald-500/5" : "border-indigo-500/25 bg-indigo-500/5")}>
                                <div className="flex items-start gap-2">
                                  <span className="mt-0.5 text-indigo-400">
                                    {action.type === "create_task" ? <ListChecks size={14} /> : action.type === "create_note" ? <FileText size={14} /> : <Check size={14} />}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-300">{ACTION_LABEL[action.type]}</p>
                                    <p className="mt-0.5 text-xs font-medium">{action.label}</p>
                                    <p className="mt-0.5 break-words text-[10px] text-muted-foreground">{actionSummary(action)}</p>
                                  </div>
                                  {done ? (
                                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-400"><Check size={11} /> Applied</span>
                                  ) : (
                                    <button
                                      onClick={() => { setPendingAction({ messageId: message.id, index }); setConfirmingAction(false); }}
                                      className="btn-ghost shrink-0 !px-2 !py-1 text-[11px]"
                                    >
                                      Apply
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <User size={14} />
                      </span>
                    )}
                  </div>
                ))}
                {sending && (
                  <div className="flex gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Bot size={14} /></span>
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border bg-muted/40 px-3.5 py-3">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
                    </div>
                  </div>
                )}
                {conversationError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{conversationError}</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t p-2.5 sm:p-3">
            {extractingFile && (
              <p className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Loader2 size={11} className="animate-spin" /> Reading {extractingFile}...
              </p>
            )}
            <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 focus-within:border-indigo-500/60">
              <input
                ref={extractInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.mp3,.m4a,.wav,.webm,.ogg,image/*,audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void extractTextFromFile(file);
                }}
              />
              <button
                onClick={() => extractInputRef.current?.click()}
                disabled={sending || Boolean(extractingFile)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label="Attach a PDF or image to extract text"
                title="Attach a PDF or image to extract text"
              >
                {extractingFile ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                rows={1}
                className="scroll-thin max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
                placeholder={aiStatus && !aiStatus.configured ? "AI is not configured yet..." : "Ask about your tasks, notes or captures..."}
                disabled={sending || Boolean(aiStatus && !aiStatus.configured)}
                aria-label="Message the assistant"
              />
              <button
                onClick={() => sendMessage()}
                disabled={sending || !input.trim() || Boolean(aiStatus && !aiStatus.configured)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40"
                aria-label="Send message"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
            <p className="mt-1 text-center text-[10px] text-muted-foreground">Attach a PDF or image to extract its text into the assistant or AI Life Inbox.</p>
            <p className="mt-0.5 text-center text-[10px] text-muted-foreground">Enter to send · Shift + Enter for a new line · AI can make mistakes</p>
          </div>
        </section>
      </div>

      {extracted && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Extracted file text"
          onMouseDown={() => setExtracted(null)}
        >
          <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col p-4" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
                <FileText size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Extracted text</h2>
                <p className="truncate text-xs text-muted-foreground">{extracted.name}</p>
              </div>
              <button onClick={() => setExtracted(null)} className="btn-icon" aria-label="Close extracted text">
                <X size={15} />
              </button>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              Review or edit the text, then send it to the AI Assistant or save it as an AI Life Inbox capture.
            </p>
            <textarea
              value={extracted.text}
              onChange={(e) => setExtracted({ ...extracted, text: e.target.value })}
              rows={14}
              className="input scroll-thin mt-2 min-h-48 flex-1 resize-y font-mono text-xs leading-relaxed"
              aria-label="Extracted text"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">{extracted.text.length.toLocaleString()} characters</p>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button onClick={copyExtractedText} className="btn-ghost flex items-center gap-1.5 text-xs">
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={askAboutExtracted} disabled={!extracted.text.trim()} className="btn-ghost flex items-center gap-1.5 text-xs">
                <Sparkles size={13} /> Ask assistant
              </button>
              <button
                onClick={saveExtractedToInbox}
                disabled={savingExtract || !extracted.text.trim()}
                className="btn-primary flex items-center gap-1.5 text-xs"
              >
                {savingExtract ? <Loader2 size={13} className="animate-spin" /> : <Inbox size={13} />}
                {savingExtract ? "Saving..." : "Save to AI Life Inbox"}
              </button>
            </div>
          </div>
        </div>
      )}

      {requestedAction && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirm AI action" onMouseDown={() => { setPendingAction(null); setConfirmingAction(false); }}>
          <div className="card w-full max-w-md p-4" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300"><Sparkles size={16} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Apply this AI suggestion?</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Review the change before it touches your workspace.</p>
              </div>
              <button onClick={() => { setPendingAction(null); setConfirmingAction(false); }} className="btn-icon" aria-label="Cancel"><X size={15} /></button>
            </div>

            <div className="mt-3 rounded-xl border p-3 text-xs">
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-300">{ACTION_LABEL[requestedAction.action.type]}</p>
              <p className="mt-1 font-semibold">{requestedAction.action.label}</p>
              <p className="mt-1 break-words text-muted-foreground">{actionSummary(requestedAction.action)}</p>
              {requestedAction.action.type === "create_task" && requestedAction.action.payload.description && (
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{requestedAction.action.payload.description}</p>
              )}
              {requestedAction.action.type === "create_note" && (
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-muted-foreground">{requestedAction.action.payload.content}</p>
              )}
              {requestedAction.action.type === "update_task" && (
                <p className="mt-2 text-muted-foreground">Task ID: {requestedAction.action.payload.task_id}</p>
              )}
            </div>

            {!confirmingAction ? (
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => { setPendingAction(null); setConfirmingAction(false); }} className="btn-ghost text-xs">Cancel</button>
                <button onClick={() => setConfirmingAction(true)} className="btn-primary flex items-center gap-1.5 text-xs"><Check size={13} /> Continue</button>
              </div>
            ) : (
              <div className="mt-4 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="flex items-start gap-1.5 text-xs text-amber-200"><Quote size={13} className="mt-0.5 shrink-0" /> This will modify your real workspace. The AI will not do anything else.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirmingAction(false)} className="btn-ghost text-xs">Back</button>
                  <button onClick={applyAction} className="btn-primary flex items-center gap-1.5 text-xs"><Check size={13} /> Apply now</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
