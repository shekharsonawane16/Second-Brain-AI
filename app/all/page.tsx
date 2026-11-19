"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { TaskList } from "@/components/task-list";

export default function AllPage() {
  const { tasks } = useStore();
  const list = useMemo(() => tasks.filter((t) => !t.trashed_at && !t.archived && t.status !== "completed"), [tasks]);
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">All Tasks</h1>
      <p className="text-sm text-muted-foreground">{list.length} active tasks. Search, filter and sort.</p></div>
      <TaskList tasks={list} emptyTitle="No active tasks" emptyBody="Press N or Add task to create your first task." />
    </div>
  );
}
