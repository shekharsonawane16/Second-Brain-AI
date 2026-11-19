"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { compareByUrgency, deadlineLabel, daysRemaining } from "@/lib/priority";
import { TaskRow } from "@/components/task-row";
import { EmptyState } from "@/components/empty-state";
import { CalendarClock } from "lucide-react";

export default function UpcomingPage() {
  const { tasks, todayStr } = useStore();
  const groups = useMemo(() => {
    const active = tasks.filter((t) => !t.trashed_at && !t.archived && t.status !== "completed" && t.deadline_date);
    const next30 = active.filter((t) => {
      const d = daysRemaining(t.deadline_date, todayStr);
      return d !== null && d >= 0 && d <= 30;
    }).sort(compareByUrgency);
    const map = new Map<string, typeof next30>();
    for (const t of next30) {
      const k = t.deadline_date as string;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [tasks, todayStr]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Upcoming</h1>
        <p className="text-sm text-muted-foreground">Chronological view of the next 30 days.</p>
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No upcoming deadlines" body="Nothing due in the next 30 days. Future deadlines will appear here automatically." />
      ) : (
        groups.map(([date, list]) => (
          <section key={date}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{date} · {deadlineLabel(daysRemaining(date, todayStr))}</h2>
            <div className="space-y-2">{list.map((t) => <TaskRow key={t.id} task={t} />)}</div>
          </section>
        ))
      )}
    </div>
  );
}
