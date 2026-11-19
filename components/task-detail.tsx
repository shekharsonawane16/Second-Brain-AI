"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Crosshair, FileText, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { calculatePriority } from "@/lib/priority";
import { formatDateLabel } from "@/lib/utils";
import { aiRequest, fetchAiStatus } from "@/lib/ai/client";
import type { TaskBreakdown } from "@/lib/ai/types";
import { PriorityBadge } from "./priority-badge";

export function TaskDetail() {
  const {
    detailTaskId, setDetailTaskId, tasks, categories, subtasks, notes, projects, smartNotes,
    updateTask, deleteTask, toggleComplete, addSubtask, toggleSubtask,
    deleteSubtask, addNote, deleteNote, settings, pushToast
  } = useStore();
  const [subTitle, setSubTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [breakdown, setBreakdown] = useState<TaskBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [selectedBreakdown, setSelectedBreakdown] = useState<Set<number>>(new Set());

  useEffect(() => {
    setBreakdown(null);
    setBreakdownError(null);
    setSelectedBreakdown(new Set());
  }, [detailTaskId]);

  const task = tasks.find((t) => t.id === detailTaskId);
  if (!task) return null;

  const subs = subtasks.filter((s) => s.task_id === task.id);
  const tnotes = notes.filter((n) => n.task_id === task.id);
  const linkedNotes = smartNotes.filter((n) => n.linked_task_id === task.id || n.id === task.source_note_id);
  const project = projects.find((p) => p.id === task.project_id);
  const { label } = calculatePriority(task.deadline_date);
  const doneCount = subs.filter((s) => s.completed).length;

  const generateBreakdown = async () => {
    setBreakdownLoading(true);
    setBreakdownError(null);
    try {
      const status = await fetchAiStatus();
      if (!status.configured) throw new Error("AI is not configured on the server yet.");
      const result = await aiRequest<{ breakdown: TaskBreakdown }>("/api/ai/breakdown", {
        method: "POST",
        body: JSON.stringify({ task_id: task.id, timezone: settings.timezone, language: settings.ai_language })
      });
      setBreakdown(result.breakdown);
      setSelectedBreakdown(new Set(result.breakdown.subtasks.map((_, index) => index)));
    } catch (error) {
      setBreakdownError(error instanceof Error ? error.message : "Could not generate a breakdown.");
    } finally {
      setBreakdownLoading(false);
    }
  };

  const applyBreakdown = () => {
    if (!breakdown) return;
    const selected = [...selectedBreakdown].sort((a, b) => a - b).map((index) => breakdown.subtasks[index]).filter(Boolean);
    if (!selected.length) return;
    if (!confirm(`Add ${selected.length} AI-suggested subtask${selected.length === 1 ? "" : "s"} to this task's checklist?`)) return;
    let added = 0;
    const seen = new Set(subs.map((existing) => existing.title.trim().toLowerCase()));
    for (const subtask of selected) {
      const title = subtask.title.trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      addSubtask(task.id, title, subs.length + added);
      added++;
    }
    setBreakdown(null);
    setSelectedBreakdown(new Set());
    pushToast({
      kind: "success",
      title: "Checklist updated",
      body: `${added} subtask${added === 1 ? "" : "s"} added. You can edit or delete them.`
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Task details">
      <div className="scroll-thin h-full w-full max-w-md overflow-y-auto border-l bg-card p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => toggleComplete(task.id)} aria-label="Toggle complete" className="text-indigo-400">
              {task.status === "completed" ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            </button>
            <PriorityBadge priority={task.priority} />
          </div>
          <button onClick={() => setDetailTaskId(null)} aria-label="Close details" className="rounded-lg p-1.5 hover:bg-muted"><X size={18} /></button>
        </div>

        <input
          value={task.title}
          onChange={(e) => updateTask(task.id, { title: e.target.value })}
          className="mt-3 w-full bg-transparent text-xl font-bold outline-none focus:border-b focus:border-indigo-500"
          aria-label="Task title"
        />
        <p className="mt-1 text-xs text-muted-foreground">{label}{task.deadline_date ? ` · ${formatDateLabel(task.deadline_date)}` : ""}</p>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <label className="space-y-1 text-xs">Status
            <select value={task.status} onChange={(e) => updateTask(task.id, { status: e.target.value as typeof task.status })} className="input">
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">Section
            <select value={task.category_id || ""} onChange={(e) => updateTask(task.id, { category_id: e.target.value || null })} className="input">
              <option value="">No section</option>
              {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">Project
            <select value={task.project_id || ""} onChange={(e) => updateTask(task.id, { project_id: e.target.value || null })} className="input">
              <option value="">No project</option>
              {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">Deadline
            <input type="date" value={task.deadline_date || ""} onChange={(e) => updateTask(task.id, { deadline_date: e.target.value || null })} className="input" />
          </label>
          <label className="space-y-1 text-xs">Time
            <input type="time" value={task.deadline_time || ""} onChange={(e) => updateTask(task.id, { deadline_time: e.target.value || null })} className="input" />
          </label>
          <label className="space-y-1 text-xs">Start date
            <input type="date" value={task.start_date || ""} onChange={(e) => updateTask(task.id, { start_date: e.target.value || null })} className="input" />
          </label>
          <label className="space-y-1 text-xs">Subcategory
            <input value={task.subcategory || ""} onChange={(e) => updateTask(task.id, { subcategory: e.target.value || null })} className="input" placeholder="e.g. Exams" />
          </label>
        </div>

        <label className="mt-3 block text-xs">Description
          <textarea value={task.description} onChange={(e) => updateTask(task.id, { description: e.target.value })} rows={3} className="input mt-1" placeholder="Details, links, context…" />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs">Est. minutes
            <input type="number" min={0} value={task.estimated_minutes ?? ""} onChange={(e) => updateTask(task.id, { estimated_minutes: e.target.value ? Number(e.target.value) : null })} className="input mt-1" />
          </label>
          <label className="text-xs">Actual minutes
            <input type="number" min={0} value={task.actual_minutes ?? ""} onChange={(e) => updateTask(task.id, { actual_minutes: e.target.value ? Number(e.target.value) : null })} className="input mt-1" />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={task.is_today_focus} onChange={(e) => updateTask(task.id, { is_today_focus: e.target.checked })} className="h-4 w-4 accent-indigo-500" />
          Show in My Day focus
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {project && <Link href={`/projects/${project.id}`} onClick={() => setDetailTaskId(null)} className="chip chip-active">{project.name}</Link>}
          <Link href="/focus" onClick={() => setDetailTaskId(null)} className="chip"><Crosshair size={12} /> Start focus session</Link>
        </div>

        {linkedNotes.length > 0 && (
          <div className="mt-3">
            <h3 className="text-sm font-semibold">Linked notes</h3>
            <div className="mt-1.5 space-y-1.5">
              {linkedNotes.map((n) => (
                <Link key={n.id} href={`/notes?open=${n.id}`} onClick={() => setDetailTaskId(null)} className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:border-indigo-500/40">
                  <FileText size={14} className="text-indigo-300" />
                  <span className="truncate">{n.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <h3 className="text-sm font-semibold">Checklist {subs.length ? `(${doneCount}/${subs.length})` : ""}</h3>
          {subs.length > 0 && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-indigo-500 transition-all" style={{ width: `${subs.length ? (doneCount / subs.length) * 100 : 0}%` }} />
            </div>
          )}
          <div className="mt-2 space-y-1.5">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm">
                <button onClick={() => toggleSubtask(s.id)} aria-label="Toggle subtask" className="text-indigo-400">
                  {s.completed ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                </button>
                <span className={s.completed ? "flex-1 line-through opacity-60" : "flex-1"}>{s.title}</span>
                <button onClick={() => deleteSubtask(s.id)} aria-label="Delete subtask" className="text-muted-foreground hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="Add checklist item…" className="input" onKeyDown={(e) => { if (e.key === "Enter" && subTitle.trim()) { addSubtask(task.id, subTitle); setSubTitle(""); } }} />
            <button className="btn-ghost shrink-0" onClick={() => { if (subTitle.trim()) { addSubtask(task.id, subTitle); setSubTitle(""); } }} aria-label="Add subtask"><Plus size={16} /></button>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.04] p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={14} className="text-indigo-400" /> AI breakdown</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Suggestions are never added until you confirm.</p>
            </div>
            {!breakdown && (
              <button onClick={generateBreakdown} disabled={breakdownLoading} className="btn-ghost flex shrink-0 items-center gap-1 !px-2 !py-1.5 text-[11px]">
                {breakdownLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {breakdownLoading ? "Thinking..." : "Break down"}
              </button>
            )}
          </div>

          {breakdownError && (
            <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/5 p-2 text-[11px] text-red-300">{breakdownError}</p>
          )}

          {breakdown && (
            <div className="mt-2 space-y-2">
              {breakdown.subtasks.map((subtask, index) => (
                <div key={index} className="flex items-start gap-2 rounded-lg border bg-card p-2">
                  <input
                    type="checkbox"
                    checked={selectedBreakdown.has(index)}
                    onChange={() => {
                      setSelectedBreakdown((prev) => {
                        const next = new Set(prev);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      });
                    }}
                    className="mt-1 h-3.5 w-3.5 accent-indigo-500"
                    aria-label={`Select suggested subtask ${index + 1}`}
                  />
                  <div className="min-w-0 flex-1">
                    <input
                      value={subtask.title}
                      onChange={(e) => setBreakdown((prev) => prev ? {
                        ...prev,
                        subtasks: prev.subtasks.map((row, i) => i === index ? { ...row, title: e.target.value } : row)
                      } : prev)}
                      className="w-full bg-transparent text-xs font-medium outline-none focus:border-b focus:border-indigo-500"
                      aria-label="Suggested subtask title"
                    />
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {subtask.estimated_minutes ? `~${subtask.estimated_minutes} min · ` : ""}{subtask.rationale}
                    </p>
                  </div>
                </div>
              ))}
              {breakdown.note && <p className="text-[10px] text-amber-300">{breakdown.note}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => { setBreakdown(null); setSelectedBreakdown(new Set()); }} className="btn-ghost text-[11px]">Discard</button>
                <button onClick={applyBreakdown} disabled={selectedBreakdown.size === 0} className="btn-primary flex items-center gap-1.5 text-[11px]">
                  <CheckCircle2 size={12} /> Add {selectedBreakdown.size} selected
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold">Notes</h3>
          <div className="mt-2 space-y-1.5">
            {tnotes.map((n) => (
              <div key={n.id} className="rounded-lg border p-2 text-sm">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{formatDateLabel(n.created_at)}</span>
                  <button onClick={() => deleteNote(n.id)} className="hover:text-red-400">Delete</button>
                </div>
              </div>
            ))}
            {tnotes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet.</p>}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note…" className="input" onKeyDown={(e) => { if (e.key === "Enter" && noteBody.trim()) { addNote(task.id, noteBody); setNoteBody(""); } }} />
            <button className="btn-ghost shrink-0" onClick={() => { if (noteBody.trim()) { addNote(task.id, noteBody); setNoteBody(""); } }} aria-label="Add note"><Plus size={16} /></button>
          </div>
        </div>

        <div className="mt-5 rounded-lg border p-3 text-[11px] text-muted-foreground">
          <p>Created {formatDateLabel(task.created_at)} · Updated {formatDateLabel(task.updated_at)}</p>
          {task.completed_at && <p>Completed {formatDateLabel(task.completed_at)}</p>}
          <p className="mt-0.5">ID {task.id}</p>
        </div>

        <div className="mt-4 flex gap-2 pb-8">
          <button className="btn-ghost flex-1" onClick={() => updateTask(task.id, { archived: !task.archived })}>{task.archived ? "Unarchive" : "Archive"}</button>
          <button className="flex-1 rounded-[10px] border border-red-500/40 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10" onClick={() => { if (confirm("Move to trash? You can restore within 30 days.")) { deleteTask(task.id); setDetailTaskId(null); } }}>Delete</button>
        </div>
      </div>
    </div>
  );
}
