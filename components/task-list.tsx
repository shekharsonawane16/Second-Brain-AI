"use client";
import { useMemo, useState } from "react";
import type { Priority, Task, TaskStatus } from "@/lib/types";
import { useStore } from "@/lib/store";
import { compareByUrgency } from "@/lib/priority";
import { TaskRow, TaskCard } from "./task-row";
import { EmptyState } from "./empty-state";
import { LayoutGrid, List, ListChecks, Rows3, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortKey = "priority" | "deadline" | "created" | "updated" | "alpha";
type View = "list" | "compact" | "grid";

export function sortTasks(list: Task[], sort: SortKey): Task[] {
  const arr = [...list];
  if (sort === "priority") return arr.sort(compareByUrgency);
  if (sort === "deadline") return arr.sort((a, b) => (a.deadline_date ?? "9999") < (b.deadline_date ?? "9999") ? -1 : 1);
  if (sort === "created") return arr.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  if (sort === "updated") return arr.sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1));
  return arr.sort((a, b) => a.title.localeCompare(b.title));
}

export function TaskList({
  tasks,
  showFilters = true,
  emptyTitle = "Nothing here",
  emptyBody = "Tasks you add will appear here."
}: {
  tasks: Task[];
  showFilters?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const { settings, projects } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [project, setProject] = useState("all");
  const [sort, setSort] = useState<SortKey>(settings.default_sort);
  const [view, setView] = useState<View>(settings.default_view);

  const filtered = useMemo(() => {
    let list = tasks.filter((t) => !t.trashed_at && !t.archived);
    if (status !== "all") list = list.filter((t) => t.status === status);
    if (priority !== "all") list = list.filter((t) => t.priority === priority);
    if (project !== "all") list = list.filter((t) => t.project_id === project);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((t) =>
        t.title.toLowerCase().includes(s) ||
        t.description.toLowerCase().includes(s) ||
        (t.notes_text || "").toLowerCase().includes(s) ||
        t.tags.some((tag) => tag.includes(s))
      );
    }
    return sortTasks(list, sort);
  }, [tasks, q, status, priority, project, sort]);

  const activeFilters = (status !== "all" ? 1 : 0) + (priority !== "all" ? 1 : 0) + (project !== "all" ? 1 : 0) + (q.trim() ? 1 : 0);

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="card space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks…" className="input pl-8" aria-label="Filter tasks" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input max-w-[140px]" aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="input max-w-[140px]" aria-label="Filter by priority">
              <option value="all">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
            <select value={project} onChange={(e) => setProject(e.target.value)} className="input max-w-[160px]" aria-label="Filter by project">
              <option value="all">All projects</option>
              {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input max-w-[170px]" aria-label="Sort tasks">
              <option value="priority">Sort: Priority</option>
              <option value="deadline">Sort: Earliest deadline</option>
              <option value="created">Sort: Recently created</option>
              <option value="updated">Sort: Recently updated</option>
              <option value="alpha">Sort: Alphabetical</option>
            </select>
            {activeFilters > 0 && (
              <button className="btn-ghost text-xs" onClick={() => { setQ(""); setStatus("all"); setPriority("all"); setProject("all"); }}>
                <X size={13} /> Clear ({activeFilters})
              </button>
            )}
            <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {([
                { v: "list", icon: List, label: "List" },
                { v: "compact", icon: Rows3, label: "Compact" },
                { v: "grid", icon: LayoutGrid, label: "Grid" }
              ] as const).map(({ v, icon: Icon, label }) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn("rounded-md p-1.5 transition", view === v ? "bg-card text-indigo-300 shadow" : "text-muted-foreground hover:text-foreground")}
                  aria-label={`${label} view`}
                  aria-pressed={view === v}
                  title={`${label} view`}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{filtered.length} task{filtered.length === 1 ? "" : "s"}</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={ListChecks} title={emptyTitle} body={emptyBody} />
      ) : view === "grid" ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      ) : (
        <div className={view === "compact" ? "space-y-1.5" : "space-y-2"}>
          {filtered.map((t) => <TaskRow key={t.id} task={t} compact={view === "compact"} />)}
        </div>
      )}
    </div>
  );
}
