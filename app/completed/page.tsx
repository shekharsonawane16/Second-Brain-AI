"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { TaskRow } from "@/components/task-row";
import { EmptyState } from "@/components/empty-state";
import { CheckCircle2 } from "lucide-react";

export default function CompletedPage() {
  const { tasks } = useStore();
  const [range, setRange] = useState("30");
  const list = useMemo(() => {
    const cutoff = new Date(Date.now() - Number(range) * 86400000).toISOString();
    return tasks
      .filter((t) => !t.trashed_at && t.status === "completed" && (t.completed_at || "") >= cutoff)
      .sort((a, b) => ((a.completed_at || "") > (b.completed_at || "") ? -1 : 1));
  }, [tasks, range]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Completed</h1>
        <p className="text-sm text-muted-foreground">{list.length} tasks in range. Nothing is auto-deleted.</p></div>
        <select value={range} onChange={(e) => setRange(e.target.value)} className="input max-w-[160px]" aria-label="Date range">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="3650">All time</option>
        </select>
      </div>
      {list.length === 0 ? <EmptyState icon={CheckCircle2} title="No completions in range" body="Completed tasks will appear here with their completion dates." /> : (
        <div className="space-y-2">{list.map((t) => <TaskRow key={t.id} task={t} />)}</div>
      )}
    </div>
  );
}
