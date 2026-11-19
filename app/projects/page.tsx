"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowUpRight, FolderKanban, Plus, Search, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { cn, formatDateLabel } from "@/lib/utils";

const COLORS = ["#6366F1", "#8B5CF6", "#3B82F6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];
const STATUSES: Array<{ value: ProjectStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" }
];

const STATUS_TONE: Record<ProjectStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  paused: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  completed: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  archived: "border-slate-500/30 bg-slate-500/10 text-slate-400"
};

export default function ProjectsPage() {
  const { ready, projects, tasks, categories, createProject, updateProject, deleteProject, pushToast } = useStore();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [targetDate, setTargetDate] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return projects
      .filter((p) => (showArchived ? p.archived : !p.archived))
      .filter((p) => !s || p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s))
      .sort((a, b) => {
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        return a.created_at < b.created_at ? 1 : -1;
      });
  }, [projects, q, showArchived]);

  if (!ready) return <div className="skeleton h-64 w-full" />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createProject({ name, description, category_id: categoryId || null, color, target_date: targetDate || null });
    pushToast({ kind: "success", title: "Project created", body: name.trim() });
    setName(""); setDescription(""); setCategoryId(""); setTargetDate(""); setCreateOpen(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={FolderKanban}
        title="Projects"
        subtitle="Group tasks, notes and references around outcomes."
        actions={<button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5"><Plus size={15} /> New project</button>}
      />

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[180px] flex-1 sm:max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects..." className="input pl-8" aria-label="Search projects" />
        </div>
        <button onClick={() => setShowArchived((v) => !v)} className={cn("chip", showArchived && "chip-active")}><Archive size={12} /> Archived</button>
        <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} project{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" body="Create a project to connect tasks, notes and links around one outcome." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const pt = tasks.filter((t) => t.project_id === p.id && !t.trashed_at);
            const done = pt.filter((t) => t.status === "completed").length;
            const active = pt.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
            const pct = pt.length ? Math.round((done / pt.length) * 100) : 0;
            const cat = categories.find((c) => c.id === p.category_id);
            return (
              <div key={p.id} className="card card-hover relative overflow-hidden p-4">
                <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: p.color }} />
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${p.color}22`, color: p.color }}><FolderKanban size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/projects/${p.id}`} className="line-clamp-1 text-sm font-semibold hover:text-indigo-300">{p.name}</Link>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description || "No description yet."}</p>
                  </div>
                  <ArrowUpRight size={14} className="text-muted-foreground" />
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize", STATUS_TONE[p.status])}>{p.status}</span>
                  {cat && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />{cat.name}</span>}
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground"><span>{done}/{pt.length} tasks complete</span><span>{pct}%</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} /></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{active} active</span>
                  {p.target_date && <span>Target {formatDateLabel(p.target_date)}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    <button onClick={() => updateProject(p.id, { status: p.status === "archived" ? "active" : "archived" })} className="rounded px-1 py-0.5 hover:text-foreground">{p.archived ? "Restore" : "Archive"}</button>
                    <button onClick={() => { if (confirm(`Delete "${p.name}"? Tasks and notes will be kept and unassigned.`)) deleteProject(p.id); }} className="rounded p-0.5 hover:text-red-400" aria-label="Delete project"><Trash2 size={12} /></button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8vh] backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={() => setCreateOpen(false)}>
          <form onSubmit={submit} className="card scale-in w-full max-w-lg p-5" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div><h2 className="text-base font-semibold">New project</h2><p className="text-[11px] text-muted-foreground">Define the outcome, then attach tasks and notes.</p></div>
              <button type="button" onClick={() => setCreateOpen(false)} className="btn-icon" aria-label="Close"><X size={16} /></button>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="input mt-4" autoFocus />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does done look like?" rows={3} className="input mt-2" />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input" aria-label="Category">
                <option value="">No section</option>
                {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="input" aria-label="Target date" />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {COLORS.map((c) => <button type="button" key={c} onClick={() => setColor(c)} className="h-6 w-6 rounded-full border-2" style={{ background: c, borderColor: color === c ? "#fff" : "transparent" }} aria-label={`Color ${c}`} />)}
            </div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn-primary">Create project</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
