"use client";
import { useState } from "react";
import { CheckCircle2, Circle, Clock, Copy, ExternalLink, Play, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { calculatePriority } from "@/lib/priority";
import { cn, formatDateLabel } from "@/lib/utils";
import { PriorityBadge } from "./priority-badge";
import { ConfirmDialog } from "./confirm-dialog";

function CategoryDot({ categoryId }: { categoryId: string | null }) {
  const { categories } = useStore();
  const c = categories.find((x) => x.id === categoryId);
  if (!c) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
      {c.name}
    </span>
  );
}

const ACCENT: Record<Task["priority"], string> = {
  critical: "border-l-red-500/70",
  high: "border-l-amber-500/70",
  normal: "border-l-transparent"
};

export function TaskRow({ task, compact }: { task: Task; compact?: boolean }) {
  const { toggleComplete, setDetailTaskId, updateTask, duplicateTask, deleteTask, projects } = useStore();
  const { label, overdue } = calculatePriority(task.deadline_date);
  const done = task.status === "completed";
  const closed = done || task.status === "cancelled";
  const project = projects.find((p) => p.id === task.project_id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "card group flex items-start gap-3 border-l-2 px-3 transition hover:border-indigo-500/40 hover:bg-muted/30",
          compact ? "py-2" : "py-3",
          ACCENT[closed ? "normal" : task.priority],
          closed && "opacity-60"
        )}
      >
        <button
          onClick={() => toggleComplete(task.id)}
          aria-label={done ? "Mark as not completed" : "Mark as completed"}
          className={cn("mt-0.5 shrink-0 rounded-full transition", done ? "text-emerald-400" : "text-indigo-400 hover:scale-110 hover:text-indigo-300")}
        >
          {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDetailTaskId(task.id)}
              className={cn("truncate text-left text-sm font-semibold transition hover:text-indigo-300", closed && "line-through")}
            >
              {task.title}
            </button>
            <PriorityBadge priority={task.priority} size="xs" />
            {task.status === "in_progress" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400">
                <Clock size={11} /> In progress
              </span>
            )}
            {task.status === "on_hold" && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">On hold</span>}
            {task.status === "cancelled" && <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Cancelled</span>}
            {task.recurrence && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">↻ {task.recurrence.freq}</span>}
          </div>
          {!compact && task.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{task.description}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("font-medium", overdue && !done ? "text-red-400" : task.priority === "critical" && !done ? "text-red-300/90" : "")}>
              {label}{task.deadline_date ? ` · ${formatDateLabel(task.deadline_date)}` : ""}{task.deadline_time ? ` ${task.deadline_time}` : ""}
            </span>
            <CategoryDot categoryId={task.category_id} />
            {project && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-sm" style={{ background: project.color }} />
                {project.name}
              </span>
            )}
            {task.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">#{t}</span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          {!done && task.status !== "in_progress" && (
            <button className="btn-icon" title="Start" aria-label="Start task" onClick={() => updateTask(task.id, { status: "in_progress" })}>
              <Play size={14} />
            </button>
          )}
          <button className="btn-icon" title="Open" aria-label="Open task" onClick={() => setDetailTaskId(task.id)}>
            <ExternalLink size={14} />
          </button>
          <button className="btn-icon" title="Duplicate" aria-label="Duplicate task" onClick={() => duplicateTask(task.id)}>
            <Copy size={14} />
          </button>
          <button className="btn-icon hover:bg-red-500/10 hover:text-red-400" title="Delete" aria-label="Move task to trash" onClick={() => setConfirmOpen(true)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Move task to trash?"
        body={`"${task.title}" will move to Trash. You can restore it within 30 days.`}
        confirmLabel="Move to trash"
        onConfirm={() => { deleteTask(task.id); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

export function TaskCard({ task }: { task: Task }) {
  const { toggleComplete, setDetailTaskId, categories, projects } = useStore();
  const { label, overdue } = calculatePriority(task.deadline_date);
  const done = task.status === "completed";
  const closed = done || task.status === "cancelled";
  const cat = categories.find((c) => c.id === task.category_id);
  const project = projects.find((p) => p.id === task.project_id);

  return (
    <div
      className={cn(
        "card card-hover group flex h-full flex-col p-3.5 transition hover:border-indigo-500/40",
        closed && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={() => toggleComplete(task.id)}
          aria-label={done ? "Mark as not completed" : "Mark as completed"}
          className={cn("shrink-0 rounded-full transition", done ? "text-emerald-400" : "text-indigo-400 hover:text-indigo-300")}
        >
          {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
        <button
          onClick={() => setDetailTaskId(task.id)}
          className={cn("min-w-0 flex-1 text-left text-sm font-semibold leading-snug hover:text-indigo-300", closed && "line-through")}
        >
          {task.title}
        </button>
      </div>
      <p className={cn("mt-1.5 text-xs font-medium", overdue && !closed ? "text-red-400" : "text-muted-foreground")}>
        {label}{task.deadline_date ? ` · ${formatDateLabel(task.deadline_date)}` : ""}
      </p>
      {(cat || project) && (
        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {cat && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: cat.color }} /> {cat.name}</span>}
          {project && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: project.color }} /> {project.name}</span>}
        </span>
      )}
      <div className="mt-auto flex items-center justify-between pt-2.5">
        <PriorityBadge priority={task.priority} size="xs" />
        {task.tags.length > 0 && <span className="truncate text-[10px] text-muted-foreground">{task.tags.slice(0, 2).map((t) => `#${t}`).join(" ")}</span>}
      </div>
    </div>
  );
}
