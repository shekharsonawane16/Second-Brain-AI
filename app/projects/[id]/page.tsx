"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, CalendarDays, CheckSquare, ExternalLink, FileText, FolderKanban,
  Link2, Plus, Trash2
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { ProjectStatus } from "@/lib/types";
import { TaskList } from "@/components/task-list";
import { formatDateLabel } from "@/lib/utils";

const STATUSES: ProjectStatus[] = ["active", "paused", "completed", "archived"];

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const {
    ready, projects, tasks, smartNotes, savedLinks, categories, updateProject,
    deleteProject, openQuickAdd, createSmartNote
  } = useStore();
  const project = projects.find((p) => p.id === params.id);

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.project_id === params.id && !t.trashed_at && !t.archived),
    [tasks, params.id]
  );
  const notes = useMemo(
    () => smartNotes.filter((n) => n.project_id === params.id && !n.archived).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
    [smartNotes, params.id]
  );
  const links = useMemo(
    () => savedLinks.filter((l) => l.project_id === params.id && !l.archived),
    [savedLinks, params.id]
  );

  if (!ready) return <div className="skeleton h-64 w-full" />;
  if (!project) {
    return (
      <div className="card p-8 text-center">
        <FolderKanban size={28} className="mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold">Project not found</p>
        <Link href="/projects" className="mt-3 inline-flex text-xs text-indigo-400 hover:underline">Back to projects</Link>
      </div>
    );
  }

  const done = projectTasks.filter((t) => t.status === "completed").length;
  const active = projectTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
  const pct = projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0;
  const cat = categories.find((c) => c.id === project.category_id);

  return (
    <div className="space-y-4">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={13} /> Projects</Link>

      <section className="card relative overflow-hidden p-4 sm:p-5">
        <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: project.color }} />
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${project.color}22`, color: project.color }}><FolderKanban size={21} /></span>
          <div className="min-w-0 flex-1">
            <input
              defaultValue={project.name}
              key={`name-${project.id}`}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== project.name) updateProject(project.id, { name: e.target.value.trim() }); }}
              className="w-full bg-transparent text-xl font-bold tracking-tight outline-none focus:border-b focus:border-indigo-500 sm:text-2xl"
              aria-label="Project name"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {cat && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />{cat.name}</span>}
              <span>{active} active</span><span>{done}/{projectTasks.length} complete</span>
              {project.target_date && <span className="inline-flex items-center gap-1"><CalendarDays size={10} />Target {formatDateLabel(project.target_date)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={project.status} onChange={(e) => updateProject(project.id, { status: e.target.value as ProjectStatus })} className="input max-w-[130px] !py-1 text-xs" aria-label="Project status">
              {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
            <button onClick={() => openQuickAdd({ project_id: project.id, category_id: project.category_id })} className="btn-primary flex items-center gap-1.5 text-xs"><Plus size={13} /> Task</button>
            <button onClick={() => { if (confirm(`Delete "${project.name}"? Tasks, notes and links will be kept and unassigned.`)) { deleteProject(project.id); router.push("/projects"); } }} className="btn-icon hover:text-red-400" aria-label="Delete project"><Trash2 size={15} /></button>
          </div>
        </div>

        <textarea
          defaultValue={project.description}
          key={`desc-${project.id}`}
          onBlur={(e) => { if (e.target.value !== project.description) updateProject(project.id, { description: e.target.value }); }}
          placeholder="What does done look like?"
          rows={2}
          className="input mt-3 text-sm"
          aria-label="Project description"
        />

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] text-muted-foreground">Section
            <select value={project.category_id || ""} onChange={(e) => updateProject(project.id, { category_id: e.target.value || null })} className="input mt-1">
              <option value="">No section</option>
              {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground">Start date
            <input type="date" value={project.start_date || ""} onChange={(e) => updateProject(project.id, { start_date: e.target.value || null })} className="input mt-1" />
          </label>
          <label className="text-[11px] text-muted-foreground">Target date
            <input type="date" value={project.target_date || ""} onChange={(e) => updateProject(project.id, { target_date: e.target.value || null })} className="input mt-1" />
          </label>
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-muted-foreground"><span>Project progress</span><span>{pct}%</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: project.color }} /></div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="section-title flex items-center gap-1.5"><CheckSquare size={15} className="text-indigo-300" /> Tasks ({projectTasks.length})</h2>
            <button onClick={() => openQuickAdd({ project_id: project.id, category_id: project.category_id })} className="btn-ghost flex items-center gap-1 text-xs"><Plus size={12} /> Add task</button>
          </div>
          <TaskList tasks={projectTasks} showFilters={projectTasks.length > 6} emptyTitle="No tasks in this project" emptyBody="Add a task or assign an existing one from its details." />
        </section>

        <aside className="space-y-3">
          <section className="card p-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title flex items-center gap-1.5"><FileText size={15} className="text-violet-300" /> Notes ({notes.length})</h2>
              <button
                onClick={() => { const n = createSmartNote({ project_id: project.id, category_id: project.category_id }); router.push(`/notes?open=${n.id}`); }}
                className="btn-icon" aria-label="Create project note"
              ><Plus size={14} /></button>
            </div>
            <div className="mt-2 space-y-1.5">
              {notes.length === 0 && <p className="text-xs text-muted-foreground">No notes linked yet.</p>}
              {notes.map((n) => (
                <Link key={n.id} href={`/notes?open=${n.id}`} className="flex items-center gap-2 rounded-lg border p-2 text-xs hover:border-indigo-500/40">
                  <FileText size={13} className="shrink-0 text-violet-300" />
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateLabel(n.updated_at)}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="card p-3">
            <h2 className="section-title flex items-center gap-1.5"><Link2 size={15} className="text-cyan-300" /> Knowledge links ({links.length})</h2>
            <div className="mt-2 space-y-1.5">
              {links.length === 0 && <p className="text-xs text-muted-foreground">Save links to this project from the Knowledge Library.</p>}
              {links.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border p-2 text-xs hover:border-indigo-500/40">
                  <ExternalLink size={13} className="shrink-0 text-cyan-300" />
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                </a>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
