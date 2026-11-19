"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Crosshair, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { PriorityBadge } from "@/components/priority-badge";
import { cn, formatDateLabel } from "@/lib/utils";

const PRESETS = [15, 25, 45, 60];

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function FocusPage() {
  const { ready, tasks, focusSessions, recordFocusSession, pushToast } = useStore();
  const [taskId, setTaskId] = useState("");
  const [plannedMinutes, setPlannedMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [phase, setPhase] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const targetRef = useRef<number>(0);
  const recordedRef = useRef(false);

  const openTasks = useMemo(
    () => tasks.filter((t) => !t.trashed_at && !t.archived && t.status !== "completed" && t.status !== "cancelled").sort((a, b) => a.title.localeCompare(b.title)),
    [tasks]
  );
  const selected = tasks.find((t) => t.id === taskId) || null;

  const today = new Date().toLocaleDateString("en-CA");
  const todaySessions = focusSessions.filter((s) => new Date(s.started_at).toLocaleDateString("en-CA") === today);
  const todayMinutes = Math.round(todaySessions.reduce((sum, s) => sum + s.duration_seconds, 0) / 60);

  const finish = useCallback((completed: boolean) => {
    if (recordedRef.current) return;
    const planned = plannedMinutes * 60;
    const elapsed = completed ? planned : Math.max(0, Math.min(planned, planned - remaining));
    recordedRef.current = true;
    if (elapsed >= 5 && startedAt) {
      recordFocusSession({
        task_id: taskId || null,
        project_id: selected?.project_id || null,
        duration_seconds: elapsed,
        planned_seconds: planned,
        completed,
        started_at: startedAt,
        ended_at: new Date().toISOString()
      });
      pushToast({ kind: "success", title: completed ? "Focus session complete" : "Focus session saved", body: `${Math.max(1, Math.round(elapsed / 60))} minutes${selected ? ` on ${selected.title}` : ""}.` });
    }
    setPhase("done");
    setRemaining(completed ? 0 : Math.max(0, planned - elapsed));
  }, [plannedMinutes, remaining, startedAt, taskId, selected, recordFocusSession, pushToast]);

  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((targetRef.current - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "running" && remaining <= 0) finish(true);
  }, [phase, remaining, finish]);

  const start = () => {
    if (phase === "done" || phase === "idle") {
      recordedRef.current = false;
      setStartedAt(new Date().toISOString());
      setRemaining(plannedMinutes * 60);
      targetRef.current = Date.now() + plannedMinutes * 60 * 1000;
    } else {
      targetRef.current = Date.now() + remaining * 1000;
    }
    setPhase("running");
  };

  const pause = () => {
    setRemaining(Math.max(0, Math.ceil((targetRef.current - Date.now()) / 1000)));
    setPhase("paused");
  };

  const reset = () => {
    setPhase("idle");
    recordedRef.current = false;
    setStartedAt(null);
    setRemaining(plannedMinutes * 60);
  };

  const changePlanned = (minutes: number) => {
    if (phase === "running" || phase === "paused") return;
    setPlannedMinutes(minutes);
    setRemaining(minutes * 60);
    setPhase("idle");
    recordedRef.current = false;
    setStartedAt(null);
  };

  const planned = plannedMinutes * 60;
  const progress = planned ? Math.min(1, Math.max(0, (planned - remaining) / planned)) : 0;
  const circumference = 2 * Math.PI * 82;
  const running = phase === "running";

  if (!ready) return <div className="skeleton h-64 w-full" />;

  return (
    <div className="space-y-4">
      <PageHeader icon={Crosshair} title="Focus Mode" subtitle="One task. One timer. No noise." />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="card relative overflow-hidden p-5 sm:p-7">
          <div className={cn("pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-opacity", running ? "bg-indigo-500/15" : "bg-indigo-500/5")} />
          <div className="relative flex flex-col items-center">
            <label className="w-full max-w-md text-[11px] text-muted-foreground">Working on
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={running || phase === "paused"} className="input mt-1">
                <option value="">No task (free focus)</option>
                {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>

            {selected && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <PriorityBadge priority={selected.priority} size="xs" />
                <span>{selected.deadline_date ? formatDateLabel(selected.deadline_date) : "No deadline"}</span>
              </div>
            )}

            <div className="relative mt-5 h-52 w-52 sm:h-56 sm:w-56">
              <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
                <circle cx="100" cy="100" r="82" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                <circle
                  cx="100" cy="100" r="82" fill="none" stroke="url(#focusGradient)" strokeWidth="10"
                  strokeLinecap="round" strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  className="transition-[stroke-dashoffset] duration-300"
                />
                <defs>
                  <linearGradient id="focusGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6366F1" />
                    <stop offset="100%" stopColor="#A855F7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{fmt(remaining)}</span>
                <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {phase === "done" ? "Session saved" : phase === "paused" ? "Paused" : running ? "In focus" : "Ready"}
                </span>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {PRESETS.map((m) => (
                <button key={m} onClick={() => changePlanned(m)} disabled={running || phase === "paused"} className={cn("chip", plannedMinutes === m && "chip-active", (running || phase === "paused") && "opacity-50")}>
                  {m} min
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-2">
              {!running ? (
                <button onClick={start} className="btn-primary flex min-w-32 items-center justify-center gap-2">
                  <Play size={16} /> {phase === "paused" ? "Resume" : phase === "done" ? "Start again" : "Start focus"}
                </button>
              ) : (
                <button onClick={pause} className="btn-primary flex min-w-32 items-center justify-center gap-2"><Pause size={16} /> Pause</button>
              )}
              {(running || phase === "paused") && (
                <button onClick={() => finish(false)} className="btn-ghost flex items-center gap-1.5"><Square size={14} /> Finish & save</button>
              )}
              {(phase === "paused" || phase === "done") && (
                <button onClick={reset} className="btn-ghost flex items-center gap-1.5"><RotateCcw size={14} /> Reset</button>
              )}
            </div>

            <p className="mt-4 max-w-md text-center text-[11px] leading-relaxed text-muted-foreground">
              The timer uses real elapsed time. Keep this tab open while focusing; paused time is not counted. Finishing saves the session and adds focused minutes to the task.
            </p>

            {selected?.project_id && <p className="mt-2 text-[10px] text-muted-foreground">This session will also count toward the selected task&apos;s project.</p>}
          </div>
        </section>

        <aside className="space-y-3">
          <section className="card p-4">
            <h2 className="section-title">Today</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border p-3"><p className="text-2xl font-bold">{todaySessions.length}</p><p className="text-[10px] text-muted-foreground">sessions</p></div>
              <div className="rounded-xl border p-3"><p className="text-2xl font-bold">{todayMinutes}<span className="text-xs font-medium text-muted-foreground">m</span></p><p className="text-[10px] text-muted-foreground">focused</p></div>
            </div>
          </section>

          <section className="card p-4">
            <h2 className="section-title flex items-center gap-1.5"><CheckCircle2 size={15} className="text-emerald-300" /> Recent sessions</h2>
            <div className="mt-2 space-y-1.5">
              {focusSessions.length === 0 && <p className="text-xs text-muted-foreground">Your completed focus sessions will appear here.</p>}
              {focusSessions.slice(0, 8).map((s) => {
                const task = tasks.find((t) => t.id === s.task_id);
                return (
                  <div key={s.id} className="rounded-lg border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{task?.title || "Free focus"}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{Math.max(1, Math.round(s.duration_seconds / 60))}m</span>
                    </div>
                    <p className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatDateLabel(s.started_at)}</span>
                      <span>{s.completed ? "Completed" : "Ended early"}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
