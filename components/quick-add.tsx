"use client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { taskSchema, parseTagsInput, type TaskFormValues } from "@/lib/validation";
import { calculatePriority } from "@/lib/priority";
import { parseNaturalDate } from "@/lib/natural-date";
import { formatDateLabel } from "@/lib/utils";
import { PriorityBadge } from "./priority-badge";
import { cn } from "@/lib/utils";

function addDays(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export function QuickAdd() {
  const { quickAddOpen, setQuickAddOpen, quickAddDefaults, createTask, categories, projects, todayStr, settings } = useStore();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: "", description: "", status: "todo", tags: [], is_today_focus: false }
  });

  useEffect(() => {
    if (quickAddOpen) reset({ title: "", description: "", status: "todo", tags: [], is_today_focus: false, deadline_date: null, category_id: null, project_id: null, ...quickAddDefaults } as TaskFormValues);
  }, [quickAddOpen, quickAddDefaults, reset]);

  // N opens quick-add, Esc closes (skip when typing in inputs)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); window.dispatchEvent(new CustomEvent("tf:palette")); }
      else if (!typing && e.key.toLowerCase() === "n") { window.dispatchEvent(new CustomEvent("tf:quickadd")); }
      else if (e.key === "Escape") setQuickAddOpen(false);
    };
    const qa = () => setQuickAddOpen(true);
    window.addEventListener("keydown", h);
    window.addEventListener("tf:quickadd", qa);
    return () => { window.removeEventListener("keydown", h); window.removeEventListener("tf:quickadd", qa); };
  }, [setQuickAddOpen]);

  const deadline = watch("deadline_date");
  const titleValue = watch("title") || "";
  const suggestion = useMemo(() => parseNaturalDate(titleValue, todayStr), [titleValue, todayStr]);
  const preview = useMemo(
    () => calculatePriority((deadline as string | null | undefined) ?? null, todayStr, settings.timezone),
    [deadline, todayStr, settings.timezone]
  );

  if (!quickAddOpen) return null;

  const chips = [
    { label: "Today", value: todayStr },
    { label: "Tomorrow", value: addDays(todayStr, 1) },
    { label: "+3 days", value: addDays(todayStr, 3) },
    { label: "Next week", value: addDays(todayStr, 7) },
    { label: "No deadline", value: null }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Quick add task" onMouseDown={() => setQuickAddOpen(false)}>
      <form
        className="card scale-in w-full max-w-lg p-5 shadow-soft"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit((v) => {
          const tagsRaw = (v as unknown as { tagsRaw?: string }).tagsRaw as unknown as string | undefined;
          const vals: TaskFormValues = {
            ...v,
            tags: typeof tagsRaw === "string" ? parseTagsInput(tagsRaw) : v.tags ?? []
          };
          createTask(vals);
          setQuickAddOpen(false);
        })}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Quick add task</h2>
            <p className="text-[11px] text-muted-foreground">Priority is calculated automatically from the deadline.</p>
          </div>
          <button type="button" onClick={() => setQuickAddOpen(false)} aria-label="Close" className="btn-icon"><X size={17} /></button>
        </div>

        <input autoFocus placeholder="What needs to be done? Try “Submit report by Friday”" {...register("title")} className="input" aria-label="Task title" />
        {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title.message}</p>}
        {suggestion.date && suggestion.date !== deadline && suggestion.title && (
          <button
            type="button"
            onClick={() => { setValue("title", suggestion.title); setValue("deadline_date", suggestion.date as never); }}
            className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-200"
          >
            <CalendarDays size={12} /> Detected “{suggestion.expression}” → {formatDateLabel(suggestion.date)}. Apply date
          </button>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays size={12} /> Deadline</span>
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setValue("deadline_date", c.value as never)}
              className={cn("chip", (c.value ?? null) === ((deadline as string | null | undefined) ?? null) && "chip-active")}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <select {...register("category_id")} className="input" aria-label="Category">
            <option value="">No section</option>
            {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" {...register("deadline_date")} className="input" aria-label="Deadline date" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select {...register("project_id")} className="input" aria-label="Project">
            <option value="">No project</option>
            {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="time" {...register("deadline_time")} className="input" aria-label="Deadline time" />
        </div>
        <input placeholder="tags, comma separated" {...register("tagsRaw" as never)} className="input mt-2" aria-label="Tags" />
        <textarea placeholder="Description (optional)" rows={2} {...register("description")} className="input mt-2" aria-label="Description" />

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" {...register("is_today_focus")} className="h-4 w-4 accent-indigo-500" /> Add to My Day focus
          </label>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Sparkles size={12} className="text-indigo-400" /> Auto priority <PriorityBadge priority={preview.priority} size="xs" />
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground"><span className="kbd">N</span> quick add · <span className="kbd">Esc</span> close</p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setQuickAddOpen(false)}>Cancel</button>
            <button disabled={isSubmitting} className="btn-primary">Add task ↵</button>
          </div>
        </div>
      </form>
    </div>
  );
}
