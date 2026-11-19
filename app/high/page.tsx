"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { TaskList } from "@/components/task-list";

export default function HighPage() {
  const { tasks } = useStore();
  const list = useMemo(() => tasks.filter((t) => !t.trashed_at && !t.archived && t.status !== "completed" && t.priority === "high").sort((a, b) => (a.deadline_date || "9999") < (b.deadline_date || "9999") ? -1 : 1), [tasks]);
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">High Priority</h1>
      <p className="text-sm text-muted-foreground">Deadlines 5–10 days away, earliest first.</p></div>
      <TaskList tasks={list} showFilters={false} emptyTitle="No high-priority tasks" emptyBody="Tasks due in 5–10 days will appear here." />
    </div>
  );
}
