"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BrainCircuit, Check, ExternalLink, FileText, Inbox, Lightbulb,
  Link2, ListChecks, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, X
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AiStatusBanner } from "@/components/ai-status-banner";
import { useStore } from "@/lib/store";
import { aiRequest, fetchAiStatus } from "@/lib/ai/client";
import type { AiStatus, MemoryItem, MemoryMatch, Relationship } from "@/lib/ai/types";
import { cn, formatDateLabel } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  note: "Note",
  task: "Task",
  inbox: "Inbox capture",
  document: "Document",
  link: "Link",
  conversation: "Conversation",
  fact: "Remembered fact"
};

const KIND_ICON: Record<string, typeof FileText> = {
  note: FileText,
  task: ListChecks,
  inbox: Inbox,
  document: FileText,
  link: Link2,
  conversation: Sparkles,
  fact: Lightbulb
};

function sourceHref(memory: Pick<MemoryItem, "kind" | "source_id">): string | null {
  if (!memory.source_id) return null;
  if (memory.kind === "note") return `/notes?open=${memory.source_id}`;
  if (memory.kind === "inbox") return `/inbox?item=${memory.source_id}`;
  if (memory.kind === "task") return "/all";
  if (memory.kind === "link") return "/knowledge";
  return null;
}

function matchHref(match: MemoryMatch): string | null {
  if (!match.source_id) return null;
  if (match.kind === "note") return `/notes?open=${match.source_id}`;
  if (match.kind === "inbox") return `/inbox?item=${match.source_id}`;
  if (match.kind === "task") return "/all";
  if (match.kind === "link") return "/knowledge";
  return null;
}

export default function MemoryPage() {
  const { ready, user, pushToast, settings } = useStore();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [relationshipStatus, setRelationshipStatus] = useState<"suggested" | "accepted">("suggested");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<MemoryMatch[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rememberOpen, setRememberOpen] = useState(false);
  const [rememberTitle, setRememberTitle] = useState("");
  const [rememberContent, setRememberContent] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);
  const handledItem = useRef(false);

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

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const result = await aiRequest<{ memories: MemoryItem[] }>("/api/ai/memory?limit=200");
      setMemories(result.memories);
      setError(null);
      return result.memories;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load AI memory.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRelationships = useCallback(async (status: "suggested" | "accepted") => {
    setRelationshipError(null);
    try {
      const result = await aiRequest<{ relationships: Relationship[] }>(`/api/ai/relationships?status=${status}`);
      setRelationships(result.relationships);
    } catch (error) {
      setRelationships([]);
      setRelationshipError(error instanceof Error ? error.message : "Could not load connections.");
    }
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    loadStatus();
    loadMemories().then((list) => {
      if (handledItem.current) return;
      handledItem.current = true;
      const id = new URLSearchParams(window.location.search).get("item");
      if (id && list.some((memory) => memory.id === id)) {
        setExpandedId(id);
        window.setTimeout(() => document.getElementById(`memory-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
      }
    });
  }, [ready, user, loadStatus, loadMemories]);

  useEffect(() => {
    if (!ready || !user) return;
    loadRelationships(relationshipStatus);
  }, [ready, user, relationshipStatus, loadRelationships]);

  const kinds = useMemo(() => {
    const set = new Set(memories.map((memory) => memory.kind));
    return ["all", ...[...set].sort()];
  }, [memories]);

  const filtered = useMemo(
    () => memories.filter((memory) => kindFilter === "all" || memory.kind === kindFilter),
    [memories, kindFilter]
  );

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (aiStatus && !aiStatus.embeddings) {
      pushToast({ kind: "info", title: "Embeddings are unavailable", body: "AI memory search needs an embedding model." });
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const result = await aiRequest<{ matches: MemoryMatch[]; note: string | null }>("/api/ai/memory/search", {
        method: "POST",
        body: JSON.stringify({ query: trimmed, limit: 12 })
      });
      setMatches(result.matches);
    } catch (error) {
      setMatches(null);
      setSearchError(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const saveMemory = async () => {
    if (!rememberContent.trim()) return;
    setSavingMemory(true);
    try {
      await aiRequest("/api/ai/memory", {
        method: "POST",
        body: JSON.stringify({
          kind: "fact",
          title: rememberTitle.trim() || "Remembered fact",
          content: rememberContent,
          metadata: { source: "manual" }
        })
      });
      setRememberTitle("");
      setRememberContent("");
      setRememberOpen(false);
      await loadMemories();
      pushToast({ kind: "success", title: "Memory saved", body: "It can now be used by the assistant." });
    } catch (error) {
      pushToast({ kind: "error", title: "Could not save memory", body: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSavingMemory(false);
    }
  };

  const deleteMemory = async (memory: MemoryItem) => {
    if (!confirm(`Forget "${memory.title}"? This removes its searchable index.`)) return;
    try {
      await aiRequest(`/api/ai/memory?id=${encodeURIComponent(memory.id)}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((row) => row.id !== memory.id));
      setMatches((prev) => prev?.filter((row) => row.memory_id !== memory.id) || null);
      if (expandedId === memory.id) setExpandedId(null);
      pushToast({ kind: "info", title: "Memory removed" });
    } catch (error) {
      pushToast({ kind: "error", title: "Could not remove memory", body: error instanceof Error ? error.message : "Try again." });
    }
  };

  const updateRelationship = async (relationship: Relationship, status: "accepted" | "rejected") => {
    try {
      await aiRequest("/api/ai/relationships", {
        method: "PATCH",
        body: JSON.stringify({ id: relationship.id, status })
      });
      setRelationships((prev) => prev.filter((row) => row.id !== relationship.id));
      pushToast({ kind: "info", title: status === "accepted" ? "Connection accepted" : "Connection dismissed" });
    } catch (error) {
      pushToast({ kind: "error", title: "Could not update connection", body: error instanceof Error ? error.message : "Try again." });
    }
  };

  if (!ready) return <div className="skeleton h-64 w-full" />;

  if (!user) {
    return (
      <EmptyState
        icon={BrainCircuit}
        title="Sign in to use AI Memory"
        body="AI Memory is private to your account and needs cloud mode so it can be searched across your workspace."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BrainCircuit}
        title="AI Memory"
        subtitle="Search what your second brain knows, manage indexed memories, and approve connections the AI finds."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => { loadMemories(); loadRelationships(relationshipStatus); loadStatus(); }} className="btn-ghost flex items-center gap-1.5 text-xs">
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              onClick={() => setRememberOpen((value) => !value)}
              disabled={Boolean(aiStatus && !aiStatus.embeddings)}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <Plus size={13} /> Remember
            </button>
          </div>
        }
      />

      <AiStatusBanner status={aiStatus} error={aiError} loading={aiLoading} onRefresh={loadStatus} />

      {rememberOpen && (
        <section className="card space-y-2 border-indigo-500/30 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold"><BrainCircuit size={15} className="text-indigo-400" /> Add a memory</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Useful facts, preferences or context the assistant should remember.</p>
            </div>
            <button onClick={() => setRememberOpen(false)} className="btn-icon" aria-label="Close"><X size={14} /></button>
          </div>
          <input value={rememberTitle} onChange={(e) => setRememberTitle(e.target.value)} className="input" placeholder="Short title (optional)" aria-label="Memory title" />
          <textarea value={rememberContent} onChange={(e) => setRememberContent(e.target.value)} rows={4} className="input" placeholder="What should the assistant remember?" aria-label="Memory content" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRememberOpen(false)} className="btn-ghost text-xs">Cancel</button>
            <button onClick={saveMemory} disabled={savingMemory || !rememberContent.trim()} className="btn-primary flex items-center gap-1.5 text-xs">
              {savingMemory ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Save memory
            </button>
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="border-b p-3">
          <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input pl-9"
                placeholder="Ask your memory: “What did I decide about the launch?”"
                aria-label="Search AI memory"
              />
            </div>
            <button type="submit" disabled={searching || !query.trim()} className="btn-primary flex shrink-0 items-center gap-1.5 text-xs">
              {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Search
            </button>
          </form>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Semantic search finds related meaning, not just exact words. Results only include your own memories.</p>
        </div>

        {searchError && (
          <div className="flex items-start gap-2 border-b border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {searchError}
          </div>
        )}

        {matches !== null && (
          <div className="border-b bg-indigo-500/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles size={13} className="text-indigo-400" /> Search results ({matches.length})</h2>
              <button onClick={() => { setMatches(null); setSearchError(null); }} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
            </div>
            {matches.length === 0 ? (
              <p className="text-xs text-muted-foreground">No matching memories found. Try a different question.</p>
            ) : (
              <div className="space-y-2">
                {matches.map((match) => {
                  const href = matchHref(match);
                  return (
                    <article key={match.chunk_id} className="rounded-xl border bg-card p-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-300">
                          {(() => { const Icon = KIND_ICON[match.kind] || FileText; return <Icon size={12} />; })()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-xs font-semibold">{match.title}</p>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{KIND_LABEL[match.kind] || match.kind}</span>
                            {match.similarity > 0 && <span className="text-[9px] text-indigo-400">{Math.round(match.similarity * 100)}% match</span>}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">{match.content}</p>
                          {href && (
                            <a href={href} className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:underline">
                              Open source <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-b p-2.5">
          {kinds.map((kind) => (
            <button key={kind} onClick={() => setKindFilter(kind)} className={cn("chip", kindFilter === kind && "chip-active")}>
              {kind === "all" ? "All memories" : KIND_LABEL[kind] || kind}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">{memories.length} indexed {memories.length === 1 ? "memory" : "memories"}</span>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 text-xs text-red-300">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2 p-3">
            <div className="skeleton h-20 w-full" />
            <div className="skeleton h-20 w-full" />
            <div className="skeleton h-20 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={BrainCircuit}
              title={memories.length ? "No memories in this filter" : "Your AI memory is empty"}
              body={memories.length ? "Choose another kind or search your memory above." : "Approve an inbox capture, apply an assistant-created item, or add a memory to start building context."}
            />
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((memory) => {
              const Icon = KIND_ICON[memory.kind] || FileText;
              const href = sourceHref(memory);
              const expanded = expandedId === memory.id;
              return (
                <article key={memory.id} id={`memory-${memory.id}`} className={cn("p-3 transition", expanded && "bg-indigo-500/[0.04]")}>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300">
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-xs font-semibold">{memory.title}</h3>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{KIND_LABEL[memory.kind] || memory.kind}</span>
                        <span className="text-[9px] text-muted-foreground">Updated {formatDateLabel(memory.updated_at)}</span>
                      </div>
                      <p className={cn("mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground", !expanded && "line-clamp-3")}>
                        {memory.content}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <button onClick={() => setExpandedId(expanded ? null : memory.id)} className="text-[10px] text-indigo-400 hover:underline">
                          {expanded ? "Show less" : "Read more"}
                        </button>
                        {href && (
                          <a href={href} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                            Open source <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                    </div>
                    <button onClick={() => deleteMemory(memory)} className="rounded p-1 text-muted-foreground hover:text-red-400" aria-label="Forget memory">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Link2 size={15} className="text-violet-400" /> Knowledge connections</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">AI-suggested links between your captures, notes, tasks and links. Accept only what makes sense.</p>
          </div>
          <div className="flex gap-1">
            {(["suggested", "accepted"] as const).map((status) => (
              <button key={status} onClick={() => setRelationshipStatus(status)} className={cn("chip capitalize", relationshipStatus === status && "chip-active")}>
                {status}
              </button>
            ))}
          </div>
        </div>

        {relationshipError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-[11px] text-amber-200">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {relationshipError}
          </div>
        )}

        {relationships.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {relationshipStatus === "suggested" ? "No new connections to review. They appear after AI processes captures." : "No accepted connections yet."}
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {relationships.map((relationship) => (
              <article key={relationship.id} className="rounded-xl border p-3 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] capitalize text-muted-foreground">{relationship.relationship.replace(/_/g, " ")}</span>
                  {typeof relationship.confidence === "number" && (
                    <span className="text-[9px] text-indigo-400">{Math.round(relationship.confidence * 100)}% confidence</span>
                  )}
                </div>
                <p className="mt-1.5 font-semibold">{relationship.source_title}</p>
                <p className="text-[10px] text-muted-foreground">↔ {relationship.target_title}</p>
                <p className="mt-1.5 leading-relaxed text-muted-foreground">{relationship.reason || "Possible connection found by AI."}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a href={relationship.target_href || "#"} className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:underline">
                    Open related item <ExternalLink size={9} />
                  </a>
                  {relationshipStatus === "suggested" && (
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => updateRelationship(relationship, "accepted")} className="btn-icon !p-1.5 text-emerald-400" aria-label="Accept connection"><Check size={13} /></button>
                      <button onClick={() => updateRelationship(relationship, "rejected")} className="btn-icon !p-1.5 text-muted-foreground" aria-label="Reject connection"><X size={13} /></button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="text-center text-[10px] text-muted-foreground">
        Memories are scoped to your account. Automatic indexing is {settings.ai_auto_index ? "on" : "off"} in Settings.
      </p>
    </div>
  );
}
