"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Archive, Check, CheckCircle2, ChevronDown, Clock3, ExternalLink,
  FileAudio, FileText, FileType2, Image as ImageIcon, Inbox, Link2, Loader2,
  RefreshCw, Sparkles, Trash2, UploadCloud, X
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AiStatusBanner } from "@/components/ai-status-banner";
import { useStore } from "@/lib/store";
import { getSupabaseBrowser } from "@/lib/supabase";
import { aiRequest, fetchAiStatus, uploadInboxFile } from "@/lib/ai/client";
import { extractionSchema } from "@/lib/ai/schemas";
import type {
  AiStatus, ExtractedNote, ExtractedTask, InboxExtraction, InboxItem, InboxStatus, Relationship
} from "@/lib/ai/types";
import { cn, formatDateLabel } from "@/lib/utils";
import { parseTagsInput } from "@/lib/validation";

const STATUS_LABEL: Record<InboxStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  needs_review: "Needs review",
  approved: "Approved",
  failed: "Failed",
  archived: "Archived"
};

const STATUS_TONE: Record<InboxStatus, string> = {
  queued: "bg-slate-500/10 text-slate-300 border-slate-500/25",
  processing: "bg-indigo-500/10 text-indigo-300 border-indigo-500/25",
  needs_review: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  approved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  failed: "bg-red-500/10 text-red-300 border-red-500/25",
  archived: "bg-muted text-muted-foreground border-border"
};

type CaptureMode = "text" | "url" | "upload";

function sourceIcon(type: InboxItem["source_type"]) {
  if (type === "image") return ImageIcon;
  if (type === "audio" || type === "meeting") return FileAudio;
  if (type === "url") return Link2;
  if (type === "document" || type === "pdf") return FileType2;
  return FileText;
}

function sourceLabel(item: InboxItem): string {
  if (item.source_type === "meeting") return "Meeting";
  if (item.source_type === "audio") return "Audio";
  if (item.source_type === "pdf") return "PDF";
  if (item.source_type === "document") return item.original_name?.split(".").pop()?.toUpperCase() || "Document";
  if (item.source_type === "image") return "Image";
  if (item.source_type === "url") return "Web page";
  return "Text";
}

export default function InboxPage() {
  const { ready, user, settings, pushToast } = useStore();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | InboxStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<CaptureMode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [meeting, setMeeting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const openHandled = useRef(false);

  const loadStatus = useCallback(async (): Promise<AiStatus | null> => {
    setAiLoading(true);
    try {
      const status = await fetchAiStatus();
      setAiStatus(status);
      setAiError(null);
      return status;
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Could not check AI status.");
      return null;
    } finally {
      setAiLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await aiRequest<{ items: InboxItem[] }>("/api/ai/inbox");
      setItems(result.items);
      setLoadError(null);
      return result.items;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load the inbox.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    loadStatus();
    loadItems();
  }, [ready, user, loadStatus, loadItems]);

  useEffect(() => {
    if (!ready || openHandled.current || !items.length) return;
    const id = new URLSearchParams(window.location.search).get("item");
    if (id && items.some((item) => item.id === id)) {
      openHandled.current = true;
      setSelectedId(id);
    }
  }, [ready, items]);

  const replaceItem = (next: InboxItem) => {
    setItems((prev) => prev.map((item) => (item.id === next.id ? next : item)));
  };

  const processItem = useCallback(
    async (item: InboxItem) => {
      setProcessingId(item.id);
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, status: "processing", error: null } : row)));
      try {
        const result = await aiRequest<{ item: InboxItem }>(`/api/ai/inbox/${item.id}/process`, {
          method: "POST",
          body: JSON.stringify({ timezone: settings.timezone, language: settings.ai_language })
        });
        replaceItem(result.item);
        setSelectedId(result.item.id);
        pushToast({ kind: "success", title: "Ready for review", body: result.item.extracted?.summary || "Extraction completed." });
      } catch (error) {
        await loadItems();
        pushToast({
          kind: "error",
          title: "Processing failed",
          body: error instanceof Error ? error.message : "The capture could not be processed."
        });
      } finally {
        setProcessingId(null);
      }
    },
    [settings.timezone, settings.ai_language, pushToast, loadItems]
  );

  const saveTextCapture = async () => {
    if (!text.trim()) return pushToast({ kind: "info", title: "Paste some text first" });
    setBusy(true);
    try {
      const result = await aiRequest<{ item: InboxItem }>("/api/ai/inbox", {
        method: "POST",
        body: JSON.stringify({
          type: meeting ? "meeting" : "text",
          text,
          language: settings.ai_language
        })
      });
      setText("");
      setMeeting(false);
      setItems((prev) => [result.item, ...prev]);
      if (aiStatus?.configured) await processItem(result.item);
      else pushToast({ kind: "info", title: "Capture saved", body: "Configure AI, then press Process on the capture." });
    } catch (error) {
      pushToast({ kind: "error", title: "Could not save capture", body: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const saveUrlCapture = async () => {
    if (!url.trim()) return pushToast({ kind: "info", title: "Enter a URL first" });
    setBusy(true);
    try {
      const result = await aiRequest<{ item: InboxItem }>("/api/ai/inbox", {
        method: "POST",
        body: JSON.stringify({ type: "url", url, language: settings.ai_language })
      });
      setUrl("");
      setItems((prev) => [result.item, ...prev]);
      if (aiStatus?.configured) await processItem(result.item);
      else pushToast({ kind: "info", title: "Link saved", body: "Configure AI, then press Process on the capture." });
    } catch (error) {
      pushToast({ kind: "error", title: "Could not import link", body: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const saveFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) {
          pushToast({ kind: "error", title: "File too large", body: `${file.name} is larger than 25 MB.` });
          continue;
        }
        const item = await uploadInboxFile(file, { sourceType: meeting && file.type.startsWith("audio/") ? "meeting" : undefined });
        setItems((prev) => [item, ...prev]);
        if (aiStatus?.configured) await processItem(item);
        else pushToast({ kind: "info", title: "File saved", body: "Configure AI, then press Process on the capture." });
      }
      setMeeting(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      pushToast({ kind: "error", title: "Upload failed", body: error instanceof Error ? error.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const retryItem = async (item: InboxItem) => {
    let configured = Boolean(aiStatus?.configured);
    if (!configured) {
      const status = await loadStatus();
      configured = Boolean(status?.configured);
    }
    if (!configured) {
      pushToast({ kind: "info", title: "AI is not configured", body: "Add the server AI environment variables first." });
      return;
    }
    await processItem(item);
  };

  const removeItem = async (item: InboxItem) => {
    if (!confirm(`Delete "${item.title}" and its uploaded file?`)) return;
    try {
      await aiRequest(`/api/ai/inbox/${item.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      if (selectedId === item.id) setSelectedId(null);
      pushToast({ kind: "info", title: "Capture deleted" });
    } catch (error) {
      pushToast({ kind: "error", title: "Delete failed", body: error instanceof Error ? error.message : "Try again." });
    }
  };

  const filtered = useMemo(
    () => items.filter((item) => statusFilter === "all" || item.status === statusFilter),
    [items, statusFilter]
  );
  const selected = items.find((item) => item.id === selectedId) || null;
  const counts = useMemo(() => {
    const base: Record<string, number> = { all: items.length };
    for (const item of items) base[item.status] = (base[item.status] || 0) + 1;
    return base;
  }, [items]);

  if (!ready) return <div className="skeleton h-64 w-full" />;

  if (!user) {
    return (
      <EmptyState
        icon={Inbox}
        title="Sign in to use AI Life Inbox"
        body="AI captures, files and memory require a cloud account so your data stays private and available across devices."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Inbox}
        title="AI Life Inbox"
        subtitle="Drop anything here. AI organises it into a review — nothing is saved until you approve it."
        actions={
          <button onClick={() => { loadItems(); loadStatus(); }} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      <AiStatusBanner status={aiStatus} error={aiError} loading={aiLoading} onRefresh={loadStatus} />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b p-2">
          {(["text", "url", "upload"] as CaptureMode[]).map((value) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={cn("chip capitalize", mode === value && "chip-active")}
            >
              {value === "text" ? <FileText size={12} /> : value === "url" ? <Link2 size={12} /> : <UploadCloud size={12} />}
              {value === "text" ? "Paste text" : value === "url" ? "Web link" : "Upload file"}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={meeting} onChange={(e) => setMeeting(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-500" />
            Meeting recording or notes
          </label>
        </div>

        <div className="p-3">
          {mode === "text" && (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                className="input resize-y"
                placeholder="Paste a message, meeting notes, email, assignment, idea or anything else..."
                aria-label="Capture text"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{text.length.toLocaleString()} characters · English, Hindi and Marathi supported</p>
                <button onClick={saveTextCapture} disabled={busy || !text.trim()} className="btn-primary flex items-center gap-1.5">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Capture
                </button>
              </div>
            </div>
          )}

          {mode === "url" && (
            <div className="space-y-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="input"
                placeholder="https://example.com/article"
                aria-label="Page URL"
                onKeyDown={(e) => { if (e.key === "Enter") saveUrlCapture(); }}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">Public http(s) pages only. Private/local network URLs are blocked.</p>
                <button onClick={saveUrlCapture} disabled={busy || !url.trim()} className="btn-primary flex items-center gap-1.5">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Import
                </button>
              </div>
            </div>
          )}

          {mode === "upload" && (
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setDragging(false); saveFiles(Array.from(e.dataTransfer.files)); }}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition",
                dragging ? "border-indigo-500 bg-indigo-500/10" : "border-border hover:border-indigo-500/40"
              )}
            >
              <UploadCloud size={28} className="text-indigo-400" />
              <p className="mt-2 text-sm font-semibold">Drop a file here</p>
              <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                PDF, DOCX, text, image or audio · up to 25 MB. Scanned PDFs are OCR&apos;d with Gemini when needed; images and audio are read by the configured AI models.
              </p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.mp3,.m4a,.wav,.webm,.ogg,audio/*,image/*"
                onChange={(e) => saveFiles(Array.from(e.target.files || []))}
              />
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-ghost mt-3 flex items-center gap-1.5 text-xs">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />} Choose file
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", "needs_review", "processing", "queued", "approved", "failed", "archived"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={cn("chip", statusFilter === value && "chip-active")}
          >
            {value === "all" ? "All" : STATUS_LABEL[value]}
            <span className="text-[10px] opacity-70">{counts[value] || 0}</span>
          </button>
        ))}
      </div>

      {loadError && (
        <div className="card flex items-start gap-2 border-red-500/30 p-3 text-xs text-red-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing here yet"
          body="Capture a message, link, document, image or recording above. AI will extract tasks and notes for your review."
        />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {filtered.map((item) => {
            const Icon = sourceIcon(item.source_type);
            const preview = item.summary || item.extracted?.summary || item.original_text || item.error || "Waiting to be processed.";
            return (
              <article key={item.id} className="card card-hover flex h-full flex-col p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", STATUS_TONE[item.status])}>
                        {STATUS_LABEL[item.status]}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{sourceLabel(item)}</span>
                      <span className="text-[10px] text-muted-foreground">· {formatDateLabel(item.created_at)}</span>
                    </div>
                    <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug">{item.title}</h3>
                  </div>
                  <button onClick={() => removeItem(item)} className="rounded p-1 text-muted-foreground hover:text-red-400" aria-label="Delete capture">
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{preview}</p>
                {item.error && item.status === "failed" && (
                  <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/5 p-2 text-[11px] text-red-300">{item.error}</p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                  {item.extracted && (
                    <span className="text-[10px] text-muted-foreground">
                      {item.extracted.tasks.length} task{item.extracted.tasks.length === 1 ? "" : "s"} · {item.extracted.notes.length} note{item.extracted.notes.length === 1 ? "" : "s"}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    {(item.status === "queued" || item.status === "failed" || item.status === "processing" || processingId === item.id) && (
                      <button
                        onClick={() => retryItem(item)}
                        disabled={processingId === item.id}
                        className="btn-ghost flex items-center gap-1 !px-2 !py-1.5 text-[11px]"
                      >
                        {processingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {processingId === item.id ? "Processing..." : item.status === "processing" ? "Resume" : "Process"}
                      </button>
                    )}
                    {item.extracted && (
                      <button onClick={() => setSelectedId(item.id)} className="btn-primary flex items-center gap-1 !px-2.5 !py-1.5 text-[11px]">
                        Review <ChevronDown size={12} className="-rotate-90" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <ReviewPanel
          key={selected.id}
          item={selected}
          aiStatus={aiStatus}
          onClose={() => setSelectedId(null)}
          onUpdated={replaceItem}
          onDeleted={() => { setItems((prev) => prev.filter((row) => row.id !== selected.id)); setSelectedId(null); }}
          onRetry={() => retryItem(selected)}
          processing={processingId === selected.id}
        />
      )}
    </div>
  );
}

function ReviewPanel({
  item,
  aiStatus,
  onClose,
  onUpdated,
  onDeleted,
  onRetry,
  processing
}: {
  item: InboxItem;
  aiStatus: AiStatus | null;
  onClose: () => void;
  onUpdated: (item: InboxItem) => void;
  onDeleted: () => void;
  onRetry: () => void;
  processing: boolean;
}) {
  const {
    settings, categories, projects, createTask, createSmartNote, pushToast
  } = useStore();
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary || item.extracted?.summary || "");
  const [extraction, setExtraction] = useState<InboxExtraction | null>(item.extracted);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(
    () => new Set((item.extracted?.tasks || []).map((_, index) => index))
  );
  const [selectedNotes, setSelectedNotes] = useState<Set<number>>(
    () => new Set((item.extracted?.notes || []).map((_, index) => index))
  );
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const h = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // The panel stays open while a failed capture is retried, so sync the new
  // extraction when processing completes.
  useEffect(() => {
    setExtraction(item.extracted);
    setTitle(item.title);
    setSummary(item.summary || item.extracted?.summary || "");
    setSelectedTasks(new Set((item.extracted?.tasks || []).map((_, index) => index)));
    setSelectedNotes(new Set((item.extracted?.notes || []).map((_, index) => index)));
  }, [item.id, item.title, item.summary, item.extracted]);

  useEffect(() => {
    if (!item.storage_path) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    sb.storage.from("ai-inbox").createSignedUrl(item.storage_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setPreviewUrl(data.signedUrl);
    });
  }, [item.storage_path]);

  useEffect(() => {
    if (item.status !== "needs_review" && item.status !== "approved") return;
    aiRequest<{ relationships: Relationship[] }>("/api/ai/relationships?status=suggested")
      .then((result) => setRelationships(result.relationships.filter((relation) => relation.source_type === "inbox" && relation.source_id === item.id)))
      .catch(() => setRelationships([]));
  }, [item.id, item.status]);

  const updateTask = (index: number, patch: Partial<ExtractedTask>) => {
    setExtraction((prev) => {
      if (!prev) return prev;
      const tasks = prev.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task));
      return { ...prev, tasks };
    });
  };

  const updateNote = (index: number, patch: Partial<ExtractedNote>) => {
    setExtraction((prev) => {
      if (!prev) return prev;
      const notes = prev.notes.map((note, i) => (i === index ? { ...note, ...patch } : note));
      return { ...prev, notes };
    });
  };

  const toggle = (set: Set<number>, setter: (next: Set<number>) => void, index: number) => {
    const next = new Set(set);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setter(next);
  };

  const saveReview = async (nextStatus?: "approved" | "archived") => {
    if (!extraction && !nextStatus) return;
    setSaving(true);
    try {
      const result = await aiRequest<{ item: InboxItem }>(`/api/ai/inbox/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim() || item.title,
          summary,
          extracted: extraction || undefined,
          status: nextStatus || (item.status === "approved" ? "approved" : "needs_review")
        })
      });
      onUpdated(result.item);
      pushToast({ kind: "success", title: nextStatus === "archived" ? "Capture archived" : "Review saved" });
      if (nextStatus === "archived") onClose();
      return result.item;
    } catch (error) {
      pushToast({ kind: "error", title: "Could not save review", body: error instanceof Error ? error.message : "Try again." });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!extraction) return;
    const validated = extractionSchema.safeParse(extraction);
    if (!validated.success) {
      pushToast({
        kind: "error",
        title: "Review needs attention",
        body: "Every task and note needs a title, and all fields must be valid before approval."
      });
      return;
    }
    const taskCount = selectedTasks.size;
    const noteCount = selectedNotes.size;
    if (item.status !== "approved") {
      const message = taskCount + noteCount === 0
        ? "Approve without creating any tasks or notes?"
        : `Create ${taskCount} task${taskCount === 1 ? "" : "s"} and ${noteCount} note${noteCount === 1 ? "" : "s"}, then approve this capture?`;
      if (!confirm(message)) return;
    }

    setApproving(true);
    let createdTasks = 0;
    let createdNotes = 0;
    try {
      for (const index of [...selectedTasks].sort((a, b) => a - b)) {
        const task = extraction.tasks[index];
        if (!task) continue;
        const category = categories.find((c) => c.name.toLowerCase() === (task.category_hint || "").toLowerCase());
        const project = projects.find((p) => p.name.toLowerCase() === (task.project_hint || "").toLowerCase());
        createTask({
          title: task.title,
          description: task.description || "",
          category_id: category?.id || null,
          project_id: project?.id || null,
          subcategory: null,
          deadline_date: task.deadline_date || null,
          deadline_time: task.deadline_time || null,
          start_date: null,
          status: "todo",
          tags: task.tags,
          estimated_minutes: task.estimated_minutes,
          actual_minutes: null,
          notes_text: `Imported from AI Life Inbox: ${item.title}`,
          is_today_focus: false
        });
        createdTasks++;
      }
      for (const index of [...selectedNotes].sort((a, b) => a - b)) {
        const note = extraction.notes[index];
        if (!note) continue;
        createSmartNote({
          title: note.title,
          content: note.content,
          note_type: note.note_type,
          category_id: null,
          project_id: null,
          tags: note.tags
        });
        createdNotes++;
      }

      if (settings.ai_auto_index) {
        const memoryContent = [
          `Capture: ${title || item.title}`,
          summary ? `Summary: ${summary}` : "",
          item.original_text ? `Original:\n${item.original_text}` : ""
        ].filter(Boolean).join("\n\n");
        if (memoryContent.trim()) {
          try {
            await aiRequest("/api/ai/memory", {
              method: "POST",
              body: JSON.stringify({
                kind: "inbox",
                source_id: item.id,
                title: title || item.title,
                content: memoryContent,
                metadata: { source_type: item.source_type }
              })
            });
          } catch (memoryError) {
            pushToast({
              kind: "info",
              title: "Approved, but memory indexing failed",
              body: memoryError instanceof Error ? memoryError.message : "You can retry from AI Memory."
            });
          }
        }
      }

      const updated = await saveReview("approved");
      if (updated) {
        setSelectedTasks(new Set());
        setSelectedNotes(new Set());
        pushToast({
          kind: "success",
          title: "Capture approved",
          body: `${createdTasks} task${createdTasks === 1 ? "" : "s"} and ${createdNotes} note${createdNotes === 1 ? "" : "s"} created.`
        });
      }
    } catch (error) {
      pushToast({ kind: "error", title: "Could not create items", body: error instanceof Error ? error.message : "Try again." });
    } finally {
      setApproving(false);
    }
  };

  const updateRelationship = async (relationship: Relationship, status: "accepted" | "rejected") => {
    try {
      await aiRequest("/api/ai/relationships", {
        method: "PATCH",
        body: JSON.stringify({ id: relationship.id, status })
      });
      setRelationships((prev) => prev.map((row) => (row.id === relationship.id ? { ...row, status } : row)));
      pushToast({ kind: "info", title: status === "accepted" ? "Connection accepted" : "Connection dismissed" });
    } catch (error) {
      pushToast({ kind: "error", title: "Could not update connection", body: error instanceof Error ? error.message : "Try again." });
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${item.title}" and its uploaded file?`)) return;
    try {
      await aiRequest(`/api/ai/inbox/${item.id}`, { method: "DELETE" });
      pushToast({ kind: "info", title: "Capture deleted" });
      onDeleted();
    } catch (error) {
      pushToast({ kind: "error", title: "Delete failed", body: error instanceof Error ? error.message : "Try again." });
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/65 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Review capture" onMouseDown={onClose}>
      <div className="scroll-thin flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l bg-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start gap-2 border-b bg-card/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", STATUS_TONE[item.status])}>{STATUS_LABEL[item.status]}</span>
              <span className="text-[10px] text-muted-foreground">{sourceLabel(item)} · {formatDateLabel(item.created_at)}</span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.original_name || item.source_url || "Pasted text"}</p>
          </div>
          <button onClick={() => saveReview("archived")} disabled={saving} className="btn-icon" aria-label="Archive capture"><Archive size={15} /></button>
          <button onClick={remove} className="btn-icon text-red-400" aria-label="Delete capture"><Trash2 size={15} /></button>
          <button onClick={onClose} className="btn-icon" aria-label="Close review"><X size={16} /></button>
        </div>

        {!extraction ? (
          <div className="p-6">
            <div className="card border-amber-500/25 bg-amber-500/5 p-4 text-sm">
              <p className="font-semibold text-amber-300">No extraction yet</p>
              <p className="mt-1 text-muted-foreground">{item.error || "Process this capture to extract tasks and notes."}</p>
              <button onClick={onRetry} disabled={!aiStatus?.configured || processing} className="btn-primary mt-3 flex items-center gap-1.5 text-xs">
                {processing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {processing ? "Processing..." : item.status === "processing" ? "Resume processing" : "Process capture"}
              </button>
            </div>
            <SourcePreview item={item} previewUrl={previewUrl} showSource={showSource} setShowSource={setShowSource} />
          </div>
        ) : (
          <div className="space-y-5 p-4">
            {extraction.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-amber-300"><AlertTriangle size={13} /> Review notes</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                  {extraction.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium">Capture title
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1" />
              </label>
              <label className="text-xs font-medium">Summary
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="input mt-1" />
              </label>
            </div>

            <section>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 size={15} className="text-indigo-400" /> Suggested tasks ({extraction.tasks.length})</h2>
                <span className="text-[10px] text-muted-foreground">Priority is always set by the app&apos;s deadline engine</span>
              </div>
              {extraction.tasks.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No clear action items were found.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {extraction.tasks.map((task, index) => (
                    <div key={index} className={cn("rounded-xl border p-3", selectedTasks.has(index) ? "border-indigo-500/40 bg-indigo-500/5" : "opacity-65")}>
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTasks.has(index)}
                          onChange={() => toggle(selectedTasks, setSelectedTasks, index)}
                          className="mt-1 h-4 w-4 accent-indigo-500"
                          aria-label={`Create task ${index + 1}`}
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <input value={task.title} onChange={(e) => updateTask(index, { title: e.target.value })} className="input font-medium" aria-label="Task title" />
                          <textarea value={task.description} onChange={(e) => updateTask(index, { description: e.target.value })} rows={2} className="input" placeholder="Context" aria-label="Task description" />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="text-[10px] text-muted-foreground">Deadline
                              <input type="date" value={task.deadline_date || ""} onChange={(e) => updateTask(index, { deadline_date: e.target.value || null })} className="input mt-1" />
                            </label>
                            <label className="text-[10px] text-muted-foreground">Time
                              <input type="time" value={task.deadline_time || ""} onChange={(e) => updateTask(index, { deadline_time: e.target.value || null })} className="input mt-1" />
                            </label>
                            <label className="text-[10px] text-muted-foreground">Section
                              <select
                                value={task.category_hint || ""}
                                onChange={(e) => updateTask(index, { category_hint: e.target.value || null })}
                                className="input mt-1"
                              >
                                <option value="">No section</option>
                                {categories.filter((category) => !category.archived).map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                              </select>
                            </label>
                            <label className="text-[10px] text-muted-foreground">Project
                              <select
                                value={task.project_hint || ""}
                                onChange={(e) => updateTask(index, { project_hint: e.target.value || null })}
                                className="input mt-1"
                              >
                                <option value="">No project</option>
                                {projects.filter((project) => !project.archived).map((project) => <option key={project.id} value={project.name}>{project.name}</option>)}
                              </select>
                            </label>
                            <label className="text-[10px] text-muted-foreground">Tags
                              <input value={task.tags.join(", ")} onChange={(e) => updateTask(index, { tags: parseTagsInput(e.target.value) })} className="input mt-1" placeholder="tags" />
                            </label>
                            <label className="text-[10px] text-muted-foreground">Estimate (minutes)
                              <input type="number" min={1} value={task.estimated_minutes ?? ""} onChange={(e) => updateTask(index, { estimated_minutes: e.target.value ? Number(e.target.value) : null })} className="input mt-1" />
                            </label>
                          </div>
                          {task.deadline_date && task.deadline_source_text && (
                            <p className="text-[10px] text-emerald-400">Deadline sourced from: “{task.deadline_source_text}”</p>
                          )}
                          {!task.deadline_date && (
                            <p className="text-[10px] text-muted-foreground">No explicit deadline was found. Leave empty unless you want to add one.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold"><FileText size={15} className="text-cyan-400" /> Suggested notes ({extraction.notes.length})</h2>
              {extraction.notes.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No standalone note was suggested.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {extraction.notes.map((note, index) => (
                    <div key={index} className={cn("rounded-xl border p-3", selectedNotes.has(index) ? "border-cyan-500/40 bg-cyan-500/5" : "opacity-65")}>
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedNotes.has(index)}
                          onChange={() => toggle(selectedNotes, setSelectedNotes, index)}
                          className="mt-1 h-4 w-4 accent-cyan-500"
                          aria-label={`Save note ${index + 1}`}
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <input value={note.title} onChange={(e) => updateNote(index, { title: e.target.value })} className="input font-medium" aria-label="Note title" />
                          <textarea value={note.content} onChange={(e) => updateNote(index, { content: e.target.value })} rows={4} className="input" aria-label="Note content" />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <select value={note.note_type} onChange={(e) => updateNote(index, { note_type: e.target.value as ExtractedNote["note_type"] })} className="input" aria-label="Note type">
                              <option value="general">General</option>
                              <option value="meeting">Meeting</option>
                              <option value="idea">Idea</option>
                              <option value="research">Research</option>
                              <option value="journal">Journal</option>
                              <option value="reference">Reference</option>
                            </select>
                            <input value={note.tags.join(", ")} onChange={(e) => updateNote(index, { tags: parseTagsInput(e.target.value) })} className="input" placeholder="tags" aria-label="Note tags" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {(extraction.key_facts.length > 0 || extraction.people.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {extraction.key_facts.length > 0 && (
                  <div className="rounded-xl border p-3 text-xs">
                    <p className="font-semibold">Key facts</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                      {extraction.key_facts.map((fact, index) => <li key={index}>{fact}</li>)}
                    </ul>
                  </div>
                )}
                {extraction.people.length > 0 && (
                  <div className="rounded-xl border p-3 text-xs">
                    <p className="font-semibold">People mentioned</p>
                    <p className="mt-1 text-muted-foreground">{extraction.people.join(" · ")}</p>
                  </div>
                )}
              </div>
            )}

            {relationships.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Link2 size={15} className="text-violet-400" /> Suggested connections</h2>
                <div className="mt-2 space-y-1.5">
                  {relationships.map((relationship) => (
                    <div key={relationship.id} className="rounded-xl border p-3 text-xs">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">Related to: {relationship.target_title}</p>
                          <p className="mt-0.5 text-muted-foreground">{relationship.reason || "The AI found a possible connection."}</p>
                        </div>
                        <button onClick={() => updateRelationship(relationship, "accepted")} className="btn-icon !p-1.5 text-emerald-400" aria-label="Accept connection"><Check size={13} /></button>
                        <button onClick={() => updateRelationship(relationship, "rejected")} className="btn-icon !p-1.5 text-muted-foreground" aria-label="Reject connection"><X size={13} /></button>
                      </div>
                      <a href={relationship.target_href} className="mt-2 inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:underline">
                        Open <ExternalLink size={10} />
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <SourcePreview item={item} previewUrl={previewUrl} showSource={showSource} setShowSource={setShowSource} />

            {item.status !== "approved" && (
              <div className="sticky bottom-0 -mx-4 mt-2 flex flex-wrap items-center gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur">
                <button onClick={() => saveReview()} disabled={saving || approving} className="btn-ghost flex items-center gap-1.5 text-xs">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save review
                </button>
                <button onClick={approve} disabled={saving || approving} className="btn-primary ml-auto flex items-center gap-1.5">
                  {approving ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Create selected & approve
                </button>
              </div>
            )}
            {item.status === "approved" && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-300">
                This capture is approved. You can still archive or delete it.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SourcePreview({
  item,
  previewUrl,
  showSource,
  setShowSource
}: {
  item: InboxItem;
  previewUrl: string | null;
  showSource: boolean;
  setShowSource: (value: boolean) => void;
}) {
  return (
    <section className="rounded-xl border">
      <button onClick={() => setShowSource(!showSource)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold">
        <span className="flex items-center gap-1.5"><FileText size={13} /> Original capture</span>
        <ChevronDown size={14} className={cn("transition", showSource && "rotate-180")} />
      </button>
      {showSource && (
        <div className="space-y-2 border-t p-3">
          {previewUrl && item.source_type === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={item.title} className="max-h-80 w-auto rounded-lg border object-contain" />
          )}
          {previewUrl && (item.source_type === "audio" || item.source_type === "meeting") && (
            <audio controls src={previewUrl} className="w-full" />
          )}
          {previewUrl && (item.source_type === "pdf" || item.source_type === "document") && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:underline">
              Open original file <ExternalLink size={11} />
            </a>
          )}
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:underline">
              Open original page <ExternalLink size={11} />
            </a>
          )}
          {item.original_text ? (
            <pre className="scroll-thin max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
              {item.original_text}
            </pre>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock3 size={11} /> The original is stored privately in your account.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
