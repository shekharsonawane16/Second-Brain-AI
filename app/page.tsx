"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, Circle,
  Clock3, Crosshair, FolderKanban, Library, ListChecks, NotebookPen, Plus,
  RotateCcw, SlidersHorizontal, Sunrise, TrendingUp, X
} from "lucide-react";
import { useStore } from "@/lib/store";
import { compareByUrgency, deadlineLabel, daysRemaining } from "@/lib/priority";
import { greetingForHour, motivationalMessage, cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/priority-badge";
import { TaskRow } from "@/components/task-row";
import { EmptyState, SkeletonList } from "@/components/empty-state";
import type { Task } from "@/lib/types";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

function Kpi({
  href, label, value, sub, icon: Icon, tone
}: {
  href: string; label: string; value: string | number; sub: string; icon: typeof Plus; tone: string;
}) {
  return (
    <Link href={href} className="card card-hover group relative p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("rounded-lg p-1.5", tone)}><Icon size={15} /></span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
      <ArrowUpRight size={14} className="absolute bottom-3 right-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
    </Link>
  );
}

const WIDGETS = [
  { id: "focus", label: "Today's focus" },
  { id: "upcoming", label: "Upcoming deadlines" },
  { id: "chart", label: "Completion trend" },
  { id: "sections", label: "Section progress" },
  { id: "activity", label: "Recent activity" }
] as const;
type WidgetId = typeof WIDGETS[number]["id"];

function useDashboardWidgets() {
  const [hidden, setHidden] = useState<WidgetId[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sb:dashboard:hidden");
      if (raw) setHidden(JSON.parse(raw) as WidgetId[]);
    } catch { /* ignore */ }
  }, []);
  const toggle = (id: WidgetId) => {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("sb:dashboard:hidden", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  return { hidden, toggle, isVisible: (id: WidgetId) => !hidden.includes(id) };
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface Activity {
  key: string;
  kind: "created" | "completed" | "updated";
  task: Task;
  at: string;
}

export default function OverviewPage() {
  const { ready, user, tasks, categories, projects, smartNotes, savedLinks, focusSessions, todayStr, settings, openQuickAdd, setDetailTaskId, setPaletteOpen } = useStore();
  const { hidden, toggle, isVisible } = useDashboardWidgets();
  const [customize, setCustomize] = useState(false);

  const data = useMemo(() => {
    const live = tasks.filter((t) => !t.trashed_at && !t.archived);
    const active = live.filter((t) => t.status !== "completed");
    const dueToday = active.filter((t) => t.deadline_date === todayStr);
    const overdue = active.filter((t) => t.deadline_date && t.deadline_date < todayStr);
    const critical = active.filter((t) => t.priority === "critical");
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const doneWeek = live.filter((t) => t.status === "completed" && (t.completed_at || "") >= weekAgo);
    const doneAll = live.filter((t) => t.status === "completed").length;
    const rate = live.length ? Math.round((doneAll / live.length) * 100) : 0;
    const focus = [...active].sort(compareByUrgency).slice(0, 7);
    const upcoming7 = active.filter((t) => {
      const d = daysRemaining(t.deadline_date, todayStr);
      return d !== null && d >= 0 && d <= 7;
    }).sort(compareByUrgency).slice(0, 5);
    const days: { day: string; done: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const c = live.filter((t) => (t.completed_at || "").slice(0, 10) === d).length;
      days.push({ day: d.slice(5), done: c });
    }
    const perCat = categories.filter((c) => !c.archived).map((c) => {
      const ct = live.filter((t) => t.category_id === c.id);
      const done = ct.filter((t) => t.status === "completed").length;
      const act = ct.filter((t) => t.status !== "completed");
      const od = act.filter((t) => t.deadline_date && t.deadline_date < todayStr).length;
      const cr = act.filter((t) => t.priority === "critical").length;
      return { cat: c, total: ct.length, done, active: act.length, overdue: od, critical: cr, pct: ct.length ? Math.round((done / ct.length) * 100) : 0 };
    });

    const events: Activity[] = [];
    for (const t of live) {
      if (t.created_at) events.push({ key: `${t.id}:created`, kind: "created", task: t, at: t.created_at });
      if (t.status === "completed" && t.completed_at) events.push({ key: `${t.id}:completed`, kind: "completed", task: t, at: t.completed_at });
      if (t.status !== "completed" && t.updated_at && t.created_at && new Date(t.updated_at).getTime() - new Date(t.created_at).getTime() > 60000) {
        events.push({ key: `${t.id}:updated`, kind: "updated", task: t, at: t.updated_at });
      }
    }
    events.sort((a, b) => (a.at < b.at ? 1 : -1));

    return { live, active, dueToday, overdue, critical, doneWeek, rate, focus, upcoming7, days, perCat, doneAll, events: events.slice(0, 6) };
  }, [tasks, categories, todayStr]);

  if (!ready) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-32 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-28" />)}</div>
        <SkeletonList rows={5} />
      </div>
    );
  }

  const hour = new Date().getHours();
  const name = settings.display_name || user?.display_name || "there";
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: settings.timezone });
  const greeting = greetingForHour(hour);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="card surface relative overflow-hidden p-5 md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-24 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Overview</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">{greeting}, {name}.</h1>
            <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
            <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">{motivationalMessage(todayStr)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => openQuickAdd()} className="btn-primary flex items-center gap-1.5"><Plus size={16} /> Add task</button>
            <Link href="/my-day" className="btn-ghost flex items-center gap-1.5"><Sunrise size={15} /> My Day</Link>
            <button onClick={() => setPaletteOpen(true)} className="btn-ghost hidden items-center gap-1.5 sm:flex"><SlidersHorizontal size={15} /> Search</button>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="chip chip-active"><Circle size={8} className="fill-current" /> {data.active.length} active</span>
          {data.overdue.length > 0 && <span className="chip border-red-500/35 bg-red-500/10 text-red-300"><AlertOctagon size={11} /> {data.overdue.length} overdue</span>}
          <span className="chip"><Clock3 size={11} /> {data.dueToday.length} due today</span>
          <span className="chip"><CheckCircle2 size={11} /> {data.doneWeek.length} done this week</span>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi href="/all" label="Active tasks" value={data.active.length} sub="to do + in progress" icon={ListChecks} tone="bg-indigo-500/15 text-indigo-400" />
        <Kpi href="/my-day" label="Due today" value={data.dueToday.length} sub={todayStr} icon={Sunrise} tone="bg-blue-500/15 text-blue-400" />
        <Kpi href="/critical" label="Overdue" value={data.overdue.length} sub="needs rescheduling" icon={AlertOctagon} tone="bg-red-500/15 text-red-400" />
        <Kpi href="/critical" label="Critical" value={data.critical.length} sub="due ≤ 4 days" icon={CalendarClock} tone="bg-amber-500/15 text-amber-400" />
        <Kpi href="/completed" label="Done this week" value={data.doneWeek.length} sub="last 7 days" icon={CheckCircle2} tone="bg-emerald-500/15 text-emerald-400" />
        <Kpi href="/analytics" label="Completion" value={`${data.rate}%`} sub={`${data.doneAll}/${data.live.length} total`} icon={TrendingUp} tone="bg-violet-500/15 text-violet-400" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { href: "/notes", label: "Notes", count: smartNotes.filter((n) => !n.archived).length, sub: "capture & connect", icon: NotebookPen, tone: "text-violet-400" },
          { href: "/projects", label: "Projects", count: projects.filter((p) => !p.archived && p.status !== "completed").length, sub: "active workspaces", icon: FolderKanban, tone: "text-indigo-400" },
          { href: "/knowledge", label: "Knowledge", count: savedLinks.filter((l) => !l.archived).length, sub: "saved references", icon: Library, tone: "text-cyan-400" },
          { href: "/focus", label: "Focus", count: `${Math.round(focusSessions.filter((f) => new Date(f.started_at).toDateString() === new Date().toDateString()).reduce((s, f) => s + f.duration_seconds, 0) / 60)}m`, sub: "focused today", icon: Crosshair, tone: "text-fuchsia-400" }
        ].map((item) => (
          <Link key={item.href} href={item.href} className="card card-hover group flex items-center gap-3 p-3">
            <span className={cn("rounded-lg bg-muted p-2", item.tone)}><item.icon size={17} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5"><span className="text-sm font-semibold">{item.label}</span><span className="text-xs font-bold text-muted-foreground">{item.count}</span></span>
              <span className="block truncate text-[10px] text-muted-foreground">{item.sub}</span>
            </span>
            <ArrowUpRight size={13} className="text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Your workspace</h2>
        <div className="relative">
          <button onClick={() => setCustomize((v) => !v)} className="chip" aria-expanded={customize}>
            <SlidersHorizontal size={12} /> Customize
          </button>
          {customize && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCustomize(false)} />
              <div className="card fade-in absolute right-0 z-50 mt-2 w-60 p-2 shadow-soft">
                <div className="flex items-center justify-between px-2 py-1">
                  <p className="text-xs font-semibold">Dashboard widgets</p>
                  <button onClick={() => setCustomize(false)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close"><X size={13} /></button>
                </div>
                {WIDGETS.map((w) => (
                  <label key={w.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted">
                    <input type="checkbox" checked={!hidden.includes(w.id)} onChange={() => toggle(w.id)} className="h-3.5 w-3.5 accent-indigo-500" />
                    {w.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {isVisible("focus") && (
          <section className="card p-4 lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Today&apos;s Focus</h2>
                <p className="text-[11px] text-muted-foreground">Sorted by urgency · deadlines drive priority</p>
              </div>
              <Link href="/my-day" className="flex items-center gap-1 text-xs text-indigo-400 hover:underline">Open My Day <ArrowRight size={12} /></Link>
            </div>
            {data.focus.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="All clear" body="No active tasks. Enjoy the calm — or add your next task." action={<button className="btn-primary" onClick={() => openQuickAdd()}>Add task</button>} />
            ) : (
              <div className="space-y-2">
                {data.focus.map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            )}
          </section>
        )}

        {isVisible("upcoming") && (
          <section className={cn("card p-4", isVisible("focus") ? "lg:col-span-2" : "lg:col-span-5")}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Upcoming</h2>
                <p className="text-[11px] text-muted-foreground">Next 7 days</p>
              </div>
              <Link href="/upcoming" className="text-xs text-indigo-400 hover:underline">View all</Link>
            </div>
            {data.upcoming7.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing due in the next 7 days.</p>
            ) : (
              <ol className="relative space-y-1 border-l border-dashed pl-4">
                {data.upcoming7.map((t) => (
                  <li key={t.id} className="relative">
                    <span className={cn("absolute -left-[21px] top-3 h-2 w-2 rounded-full ring-4 ring-card",
                      t.priority === "critical" ? "bg-red-400" : t.priority === "high" ? "bg-amber-400" : "bg-slate-400")} />
                    <button onClick={() => setDetailTaskId(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-muted">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{t.title}</span>
                        <span className="text-[11px] text-muted-foreground">{t.deadline_date} · {deadlineLabel(daysRemaining(t.deadline_date, todayStr))}</span>
                      </span>
                      <PriorityBadge priority={t.priority} size="xs" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>

      {isVisible("sections") && (
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Sections</h2>
              <p className="text-[11px] text-muted-foreground">Progress across your life areas</p>
            </div>
            <Link href="/categories" className="text-xs text-indigo-400 hover:underline">Manage</Link>
          </div>
          {data.perCat.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No sections yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {data.perCat.map(({ cat, total, done, active, overdue, critical, pct }) => (
                <Link key={cat.id} href={`/categories/${cat.id}`} className="card-hover rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
                    <p className="truncate text-sm font-semibold">{cat.name}</p>
                    <span className="ml-auto text-[11px] text-muted-foreground">{done}/{total}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cat.color }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{active} active{overdue > 0 && ` · ${overdue} overdue`}{critical > 0 && ` · ${critical} critical`}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {isVisible("chart") && (
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Completion trend</h2>
                <p className="text-[11px] text-muted-foreground">Tasks completed · last 14 days</p>
              </div>
              <TrendingUp size={16} className="text-muted-foreground" />
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.days}>
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#8b93a7" }} interval={2} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} contentStyle={{ background: "#151D32", border: "1px solid #2a3560", borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="done" fill="#6366F1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {isVisible("activity") && (
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Recent activity</h2>
                <p className="text-[11px] text-muted-foreground">Built from your task history</p>
              </div>
              <RotateCcw size={15} className="text-muted-foreground" />
            </div>
            {data.events.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Activity appears as you create and complete tasks.</p>
            ) : (
              <ul className="space-y-1">
                {data.events.map((e) => (
                  <li key={e.key}>
                    <button onClick={() => setDetailTaskId(e.task.id)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                      <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                        e.kind === "completed" ? "bg-emerald-500/15 text-emerald-400" : e.kind === "created" ? "bg-indigo-500/15 text-indigo-400" : "bg-amber-500/15 text-amber-400")}>
                        {e.kind === "completed" ? <CheckCircle2 size={13} /> : e.kind === "created" ? <Plus size={13} /> : <RotateCcw size={12} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs">
                          <span className="text-muted-foreground">{e.kind === "completed" ? "Completed " : e.kind === "created" ? "Created " : "Updated "}</span>
                          <span className="font-medium">{e.task.title}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground">{relativeTime(e.at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
