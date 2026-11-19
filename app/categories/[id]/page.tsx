"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { TaskList } from "@/components/task-list";

export default function CategoryDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { categories, tasks } = useStore();
  const cat = categories.find((c) => c.id === id);
  const list = tasks.filter((t) => t.category_id === id && !t.trashed_at && !t.archived && t.status !== "completed");

  if (!cat) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold">Section not found</p>
        <Link href="/categories" className="text-sm text-indigo-400 hover:underline">Back to sections</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: cat.color }} />
        <h1 className="text-xl font-bold">{cat.name}</h1>
        <Link href="/categories" className="ml-auto text-xs text-indigo-400 hover:underline">All sections</Link>
      </div>
      <TaskList tasks={list} emptyTitle={`No active tasks in ${cat.name}`} emptyBody="Add a task to this section with Quick Add." />
    </div>
  );
}
