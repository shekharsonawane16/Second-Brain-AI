"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { Trash2 } from "lucide-react";

export default function TrashPage() {
  const { tasks, restoreTask, deleteTask } = useStore();
  const list = useMemo(() => tasks.filter((t) => t.trashed_at).sort((a, b) => ((a.trashed_at || "") > (b.trashed_at || "") ? -1 : 1)), [tasks]);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Trash</h1>
      <p className="text-sm text-muted-foreground">Deleted tasks are kept for 30 days and can be restored. Permanent deletion is explicit and confirmed.</p></div>
      {list.length === 0 ? (
        <EmptyState icon={Trash2} title="Trash is empty" body="Tasks you delete will wait here for 30 days before you permanently remove them." />
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <div key={t.id} className="card flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.title}</p>
                <p className="text-[11px] text-muted-foreground">Deleted {t.trashed_at?.slice(0, 10)} · recoverable</p>
              </div>
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => restoreTask(t.id)}>Restore</button>
              <button
                className="rounded-[10px] border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                onClick={() => { if (confirm(`Permanently delete "${t.title}"? This cannot be undone.`)) deleteTask(t.id, true); }}
              >Delete forever</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
