"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/priority-badge";
import { PageHeader } from "@/components/page-header";

function monthCells(year: number, month: number, weekStart: number): (null | Date)[] {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (null | Date)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}
const toKey = (d: Date) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date, weekStart: number) => addDays(d, -((d.getDay() - weekStart + 7) % 7));

export default function CalendarPage() {
  const { tasks, projects, setDetailTaskId, openQuickAdd, todayStr, settings } = useStore();
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [projectId, setProjectId] = useState("all");
  const [hideCompleted, setHideCompleted] = useState(false);

  const weekStart = settings.week_start ?? 0;

  const byDate = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      if (!t.deadline_date || t.trashed_at || t.archived) continue;
      if (projectId !== "all" && t.project_id !== projectId) continue;
      if (hideCompleted && t.status === "completed") continue;
      if (!map.has(t.deadline_date)) map.set(t.deadline_date, []);
      map.get(t.deadline_date)!.push(t);
    }
    return map;
  }, [tasks, projectId, hideCompleted]);

  const overdueCount = useMemo(
    () => tasks.filter((t) => !t.trashed_at && !t.archived && t.status !== "completed" && t.status !== "cancelled" && t.deadline_date && t.deadline_date < todayStr && (projectId === "all" || t.project_id === projectId)).length,
    [tasks, todayStr, projectId]
  );

  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const cells = monthCells(y, m, weekStart);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, weekStart), i));
  const dayNames = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(2024, 0, 7), (i + weekStart) % 7);
    return d.toLocaleDateString("en-IN", { weekday: "short" });
  });

  const label = view === "month"
    ? anchor.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : `${weekDays[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  const step = (dir: number) => {
    if (view === "month") setAnchor(new Date(y, m + dir, 1));
    else setAnchor(addDays(anchor, dir * 7));
  };
  const goToday = () => setAnchor(new Date());
  const isSameMonth = anchor.getFullYear() === new Date().getFullYear() && anchor.getMonth() === new Date().getMonth();

  const DayTasks = ({ k, limit, big }: { k: string; limit: number; big?: boolean }) => {
    const all = byDate.get(k) || [];
    const list = all.slice(0, limit);
    const extra = all.length - list.length;
    if (big) {
      return (
        <div className="mt-1.5 space-y-1">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={(e) => { e.stopPropagation(); setDetailTaskId(t.id); }}
              className={cn("block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-medium transition hover:brightness-125",
                t.status === "completed" ? "bg-emerald-500/15 text-emerald-300 line-through" : t.priority === "critical" ? "bg-red-500/15 text-red-300" : t.priority === "high" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300")}
            >
              {t.deadline_time ? `${t.deadline_time} ` : ""}{t.title}
            </button>
          ))}
          {extra > 0 && <p className="px-1 text-[10px] text-muted-foreground">+{extra} more</p>}
          <button
            onClick={(e) => { e.stopPropagation(); openQuickAdd({ deadline_date: k }); }}
            className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus size={10} /> Add
          </button>
        </div>
      );
    }
    return (
      <>
        <div className="mt-1 hidden space-y-1 md:block">
          {list.map((t) => (
            <span
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setDetailTaskId(t.id); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setDetailTaskId(t.id); } }}
              className={cn("block truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
                t.status === "completed" ? "bg-emerald-500/15 text-emerald-300 line-through" : t.priority === "critical" ? "bg-red-500/15 text-red-300" : t.priority === "high" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300")}
            >{t.title}</span>
          ))}
          {extra > 0 && <span className="block text-[10px] text-muted-foreground">+{extra} more</span>}
        </div>
        <div className="mt-1 flex gap-0.5 md:hidden">
          {list.map((t) => (
            <span key={t.id} className={cn("h-1.5 w-1.5 rounded-full", t.status === "completed" ? "bg-emerald-400" : t.priority === "critical" ? "bg-red-400" : t.priority === "high" ? "bg-amber-400" : "bg-slate-400")} />
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarDays}
        title="Calendar"
        subtitle="Deadlines by day. Click a date to add, a task to open."
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {(["month", "week"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium capitalize transition", view === v ? "bg-card text-indigo-300 shadow" : "text-muted-foreground hover:text-foreground")}>
                  {v}
                </button>
              ))}
            </div>
            <button className="btn-ghost text-xs" onClick={goToday} disabled={isSameMonth && view === "month"}>Today</button>
            <div className="flex items-center gap-1">
              <button className="btn-icon" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
              <span className="min-w-36 text-center text-sm font-semibold">{label}</span>
              <button className="btn-icon" aria-label="Next" onClick={() => step(1)}><ChevronRight size={16} /></button>
            </div>
          </>
        }
      />

      <div className="card flex flex-wrap items-center gap-2 p-2.5 text-xs">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input max-w-[190px]" aria-label="Filter calendar by project">
          <option value="all">All projects</option>
          {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-500" />
          Hide completed
        </label>
        {overdueCount > 0 && (
          <Link href="/critical" className="chip border-red-500/35 bg-red-500/10 text-red-300">
            {overdueCount} overdue — reschedule
          </Link>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">Click any day to add a deadline</span>
      </div>

      {view === "month" ? (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
            {dayNames.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="min-h-20 rounded-xl md:min-h-24" />;
              const k = toKey(d);
              const isToday = k === todayStr;
              return (
                <button
                  key={i}
                  onClick={() => openQuickAdd({ deadline_date: k })}
                  className={cn("min-h-20 rounded-xl border p-1.5 text-left align-top transition hover:border-indigo-500/50 md:min-h-24", isToday ? "border-indigo-500 bg-indigo-500/10" : "bg-card")}
                >
                  <span className={cn("text-xs font-semibold", isToday ? "text-indigo-300" : "text-muted-foreground")}>{d.getDate()}</span>
                  <DayTasks k={k} limit={3} />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="grid gap-2 overflow-x-auto pb-1 sm:grid-cols-2 lg:grid-cols-7 lg:gap-1.5">
          {weekDays.map((d) => {
            const k = toKey(d);
            const isToday = k === todayStr;
            return (
              <div
                key={k}
                className={cn("min-w-[140px] rounded-xl border p-2 lg:min-w-0", isToday ? "border-indigo-500 bg-indigo-500/10" : "bg-card")}
              >
                <button onClick={() => openQuickAdd({ deadline_date: k })} className="mb-1 flex w-full items-baseline justify-between rounded-md px-0.5 hover:bg-muted/40">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {d.toLocaleDateString("en-IN", { weekday: "short" })}
                  </span>
                  <span className={cn("text-base font-bold", isToday ? "text-indigo-300" : "")}>{d.getDate()}</span>
                </button>
                <DayTasks k={k} limit={6} big />
              </div>
            );
          })}
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-3 p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Legend:</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Overdue / Critical</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> High</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" /> Normal</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Completed</span>
        <span className="ml-auto flex items-center gap-2"><PriorityBadge priority="critical" size="xs" /> text labels always accompany color</span>
      </div>
    </div>
  );
}
