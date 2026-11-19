"use client";
import { useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import { useStore } from "@/lib/store";
import { compareByUrgency } from "@/lib/priority";
import { TaskRow } from "@/components/task-row";
import { EmptyState } from "@/components/empty-state";

export default function MyDayPage() {
  const { tasks, todayStr, settings, setDetailTaskId } = useStore();
  const [focusMode, setFocusMode] = useState(false);
  const [idx, setIdx] = useState(0);

  const list = useMemo(() => {
    const active = tasks.filter((t) => !t.trashed_at && !t.archived && t.status !== "completed");
    const mine = active.filter((t) => t.deadline_date === todayStr || (t.deadline_date && t.deadline_date < todayStr) || t.is_today_focus);
    return mine.sort(compareByUrgency).slice(0, Math.max(settings.daily_focus_limit, 1) * 3);
  }, [tasks, todayStr, settings.daily_focus_limit]);

  const current = list[idx % Math.max(list.length, 1)];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">My Day</h1>
          <p className="text-sm text-muted-foreground">Overdue, due today and your chosen focus tasks.</p>
        </div>
        {list.length > 0 && (
          <button onClick={() => { setFocusMode((v) => !v); setIdx(0); }} className="btn-ghost flex items-center gap-1.5 text-xs">
            <Crosshair size={14} /> {focusMode ? "Exit focus" : "Focus mode"}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Crosshair} title="Nothing demanding today" body="No overdue tasks, nothing due today, and no focus picks. Add a focus task with Quick Add." />
      ) : focusMode && current ? (
        <div className="card mx-auto max-w-xl p-8 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Focus {idx + 1} of {list.length}</p>
          <h2 className="mt-2 text-2xl font-bold">{current.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{current.description || "No description."}</p>
          <div className="mt-6 flex justify-center gap-2">
            <button className="btn-ghost" onClick={() => setIdx((i) => (i + 1) % list.length)}>Skip →</button>
            <button className="btn-primary" onClick={() => setDetailTaskId(current.id)}>Open details</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}
