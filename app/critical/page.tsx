"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { compareByUrgency } from "@/lib/priority";
import { TaskList } from "@/components/task-list";

export default function CriticalPage() {
  const { tasks } = useStore();
  const list = useMemo(() => tasks.filter((t) => !t.trashed_at && !t.archived && t.status !== "completed" && t.priority === "critical").sort(compareByUrgency), [tasks]);
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Critical Deadlines</h1>
      <p className="text-sm text-muted-foreground">Overdue, due today, or due within 4 days — most urgent first.</p></div>
      <TaskList tasks={list} showFilters={false} emptyTitle="No critical tasks" emptyBody="Nothing overdue or due within 4 days. Nice." />
    </div>
  );
}
