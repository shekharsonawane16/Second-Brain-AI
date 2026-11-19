"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, CheckSquare, FileText, FolderKanban, Heart, Link2, NotebookPen, Pin,
  Plus, Search, Tag, Trash2, X
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Note, NoteType } from "@/lib/types";
import { NoteEditor } from "@/components/note-editor";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { cn, formatDateLabel } from "@/lib/utils";
import { wordCount } from "@/lib/markdown";
import type { TaskFormValues } from "@/lib/validation";

const NOTE_TYPES: Array<{ value: NoteType; label: string }> = [
  { value: "general", label: "General" },
  { value: "meeting", label: "Meeting" },
  { value: "idea", label: "Idea" },
  { value: "research", label: "Research" },
  { value: "journal", label: "Journal" },
  { value: "reference", label: "Reference" }
];

const TYPE_TONE: Record<NoteType, string> = {
  general: "bg-slate-500/10 text-slate-300 border-slate-500/25",
  meeting: "bg-blue-500/10 text-blue-300 border-blue-500/25",
  idea: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  research: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
  journal: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  reference: "bg-violet-500/10 text-violet-300 border-violet-500/25"
};

function typeLabel(t: NoteType) {
  return NOTE_TYPES.find((x) => x.value === t)?.label || "General";
}

export default function NotesPage() {
  const {
    ready, user, smartNotes, categories, projects, createSmartNote, updateSmartNote,
    deleteSmartNote, convertNoteToTask
  } = useStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | NoteType>("all");
  const [favorites, setFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!ready || !user || handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search);
    const open = params.get("open");
    if (open && smartNotes.some((n) => n.id === open)) {
      setSelectedId(open);
      return;
    }
    if (params.get("new") === "1") {
      const note = createSmartNote();
      setSelectedId(note.id);
      window.history.replaceState({}, "", "/notes");
    }
  }, [ready, user, smartNotes, createSmartNote]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return smartNotes
      .filter((n) => (showArchived ? n.archived : !n.archived))
      .filter((n) => (favorites ? n.favorite : true))
      .filter((n) => (type === "all" ? true : n.note_type === type))
      .filter((n) => !s || n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s) || n.tags.some((t) => t.includes(s)))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.updated_at < b.updated_at ? 1 : -1;
      });
  }, [smartNotes, q, type, favorites, showArchived]);

  const selected = smartNotes.find((n) => n.id === selectedId) || null;
  const archivedCount = smartNotes.filter((n) => n.archived).length;

  const newNote = () => {
    const note = createSmartNote();
    setSelectedId(note.id);
  };

  if (!ready) return <div className="skeleton h-64 w-full" />;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={NotebookPen}
        title="My Notes"
        subtitle={`${smartNotes.filter((n) => !n.archived).length} notes · ${smartNotes.filter((n) => n.favorite).length} favourites`}
        actions={<button onClick={newNote} className="btn-primary flex items-center gap-1.5"><Plus size={15} /> New note</button>}
      />

      <div className="card space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes and content..." className="input pl-8" aria-label="Search notes" />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="input max-w-[150px]" aria-label="Filter note type">
            <option value="all">All types</option>
            {NOTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={() => setFavorites((v) => !v)} className={cn("chip", favorites && "chip-active")}><Heart size={12} /> Favourites</button>
          <button onClick={() => setShowArchived((v) => !v)} className={cn("chip", showArchived && "chip-active")}><Archive size={12} /> Archived {archivedCount ? `(${archivedCount})` : ""}</button>
        </div>
        <p className="text-[11px] text-muted-foreground">{filtered.length} note{filtered.length === 1 ? "" : "s"} · autosaved</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={NotebookPen} title="No notes found" body="Capture an idea, meeting or research note and it will live here." />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((note) => {
            const cat = categories.find((c) => c.id === note.category_id);
            const project = projects.find((p) => p.id === note.project_id);
            return (
              <button key={note.id} onClick={() => setSelectedId(note.id)} className="card card-hover flex h-full flex-col p-3.5 text-left">
                <div className="flex items-start gap-2">
                  <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", TYPE_TONE[note.note_type])}>{typeLabel(note.note_type)}</span>
                  <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                    {note.pinned && <Pin size={12} className="text-indigo-300" />}
                    {note.favorite && <Heart size={12} className="fill-rose-400 text-rose-400" />}
                  </span>
                </div>
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{note.title}</h3>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {note.content.replace(/[#>*_`\[\]-]/g, " ").replace(/\s+/g, " ").trim() || "Empty note"}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[10px] text-muted-foreground">
                  {cat && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />{cat.name}</span>}
                  {project && <span className="inline-flex items-center gap-1"><FolderKanban size={10} />{project.name}</span>}
                  {note.linked_task_id && <span className="inline-flex items-center gap-1"><CheckSquare size={10} />Task linked</span>}
                  <span className="ml-auto">{formatDateLabel(note.updated_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <NotePanel
          key={selected.id}
          note={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => { deleteSmartNote(selected.id); setSelectedId(null); }}
          onUpdate={updateSmartNote}
          onConvert={convertNoteToTask}
        />
      )}
    </div>
  );
}

function NotePanel({
  note, onClose, onDelete, onUpdate, onConvert
}: {
  note: Note;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onConvert: (id: string, v: Partial<TaskFormValues>) => unknown;
}) {
  const { categories, projects, pushToast } = useStore();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [saved, setSaved] = useState(true);
  const [convertOpen, setConvertOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState(note.title);
  const [deadline, setDeadline] = useState("");

  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => {
      onUpdate(note.id, {
        title: title.trim() || "Untitled note",
        content,
        tags: tags.split(",").map((x) => x.trim().replace(/^#/, "").toLowerCase()).filter(Boolean).slice(0, 20)
      });
      setSaved(true);
    }, 650);
    return () => clearTimeout(t);
  }, [title, content, tags, note.id, onUpdate]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const archive = () => {
    onUpdate(note.id, { archived: !note.archived });
    pushToast({ kind: "info", title: note.archived ? "Note restored" : "Note archived" });
    if (!note.archived) onClose();
  };

  const convert = () => {
    onConvert(note.id, {
      title: taskTitle.trim() || note.title,
      deadline_date: deadline || null,
      category_id: note.category_id,
      project_id: note.project_id,
      tags: note.tags
    });
    setConvertOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/65 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Note editor" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-3xl flex-col border-l bg-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-5">
          <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", TYPE_TONE[note.note_type])}>{typeLabel(note.note_type)}</span>
          <span className="text-[11px] text-muted-foreground">{saved ? "Saved automatically" : "Saving..."}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <button onClick={() => onUpdate(note.id, { favorite: !note.favorite })} className={cn("btn-icon", note.favorite && "text-rose-400")} aria-label="Favourite note" title="Favourite"><Heart size={15} className={note.favorite ? "fill-rose-400" : ""} /></button>
            <button onClick={() => onUpdate(note.id, { pinned: !note.pinned })} className={cn("btn-icon", note.pinned && "text-indigo-300")} aria-label="Pin note" title="Pin"><Pin size={15} /></button>
            <button onClick={archive} className="btn-icon" aria-label="Archive note" title={note.archived ? "Restore" : "Archive"}><Archive size={15} /></button>
            <button onClick={() => { if (confirm("Delete this note permanently? A linked task will be kept.")) onDelete(); }} className="btn-icon hover:text-red-400" aria-label="Delete note" title="Delete"><Trash2 size={15} /></button>
            <button onClick={onClose} className="btn-icon" aria-label="Close editor"><X size={17} /></button>
          </div>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title" className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/60" aria-label="Note title" />

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-muted-foreground">Type
              <select value={note.note_type} onChange={(e) => onUpdate(note.id, { note_type: e.target.value as NoteType })} className="input mt-1">
                {NOTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">Section
              <select value={note.category_id || ""} onChange={(e) => onUpdate(note.id, { category_id: e.target.value || null })} className="input mt-1">
                <option value="">No section</option>
                {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">Project
              <select value={note.project_id || ""} onChange={(e) => onUpdate(note.id, { project_id: e.target.value || null })} className="input mt-1">
                <option value="">No project</option>
                {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground">Tags
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ideas, research" className="input mt-1" />
            </label>
          </div>

          <div className="mt-3">
            <NoteEditor value={content} onChange={setContent} rows={20} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>{wordCount(content)} words</span>
            <span>Created {formatDateLabel(note.created_at)}</span>
            <span>Updated {formatDateLabel(note.updated_at)}</span>
          </div>

          {note.linked_task_id && <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300"><Link2 size={13} /> This note is linked to a task.</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setConvertOpen((v) => !v)} className="btn-ghost flex items-center gap-1.5 text-sm"><CheckSquare size={14} /> Convert to task</button>
            {note.tags.length > 0 && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Tag size={11} /> {note.tags.map((t) => `#${t}`).join(" ")}</span>}
          </div>

          {convertOpen && (
            <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
              <p className="text-xs font-semibold">Create a task from this note</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">The note stays intact and becomes linked to the new task.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_160px]">
                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="input" placeholder="Task title" />
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input" aria-label="Task deadline" />
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button className="btn-ghost text-xs" onClick={() => setConvertOpen(false)}>Cancel</button>
                <button className="btn-primary text-xs" onClick={convert}>Create linked task</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
