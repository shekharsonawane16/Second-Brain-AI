"use client";
import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { ArrowDown, ArrowUp, FolderKanban, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

const ICONS = ["home", "graduation-cap", "briefcase", "folder-kanban", "book-open", "user", "wallet", "heart-pulse", "folder", "star", "flag"];
const COLORS = ["#6366F1", "#8B5CF6", "#3B82F6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

export default function CategoriesPage() {
  const { categories, tasks, smartNotes, projects, todayStr, createCategory, updateCategory, deleteCategory, reorderCategories, pushToast } = useStore();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [color, setColor] = useState(COLORS[0]);
  const [moveMap, setMoveMap] = useState<Record<string, string>>({});

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const ids = categories.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderCategories(ids);
  };

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Categories</h1>
      <p className="text-sm text-muted-foreground">Sections for home, college, work and everything else. Deleting never silently deletes tasks.</p></div>

      <form
        className="card flex flex-wrap items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createCategory(name, icon, color);
          setName("");
          pushToast({ kind: "success", title: "Section created" });
        }}
      >
        <label className="text-xs">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Side Hustle" className="input mt-1 w-48" /></label>
        <label className="text-xs">Icon
          <select value={icon} onChange={(e) => setIcon(e.target.value)} className="input mt-1">{ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</select>
        </label>
        <label className="text-xs">Color
          <div className="mt-1 flex gap-1">{COLORS.map((c) => <button type="button" key={c} onClick={() => setColor(c)} aria-label={c} className="h-7 w-7 rounded-full border-2" style={{ background: c, borderColor: color === c ? "#fff" : "transparent" }} />)}</div>
        </label>
        <button className="btn-primary flex items-center gap-1"><Plus size={15} /> Add section</button>
      </form>

      {categories.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No sections" body="Create your first section above." />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {categories.map((c, index) => {
            const ct = tasks.filter((t) => t.category_id === c.id && !t.trashed_at);
            const active = ct.filter((t) => t.status !== "completed");
            const overdue = active.filter((t) => t.deadline_date && t.deadline_date < todayStr).length;
            const critical = active.filter((t) => t.priority === "critical").length;
            const noteCount = smartNotes.filter((n) => n.category_id === c.id && !n.archived).length;
            const projectCount = projects.filter((p) => p.category_id === c.id && !p.archived).length;
            return (
              <div key={c.id} className="card p-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                  <input value={c.name} onChange={(e) => updateCategory(c.id, { name: e.target.value })} className="w-full bg-transparent text-sm font-semibold outline-none" aria-label="Category name" />
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button onClick={() => move(index, -1)} disabled={index === 0} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move category up"><ArrowUp size={12} /></button>
                    <button onClick={() => move(index, 1)} disabled={index === categories.length - 1} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move category down"><ArrowDown size={12} /></button>
                  </div>
                  <button onClick={() => updateCategory(c.id, { archived: !c.archived })} className="text-[11px] text-muted-foreground hover:text-foreground">{c.archived ? "Unarchive" : "Archive"}</button>
                </div>
                {(noteCount > 0 || projectCount > 0) && <p className="mt-0.5 text-[10px] text-muted-foreground">{projectCount} project{projectCount === 1 ? "" : "s"} · {noteCount} note{noteCount === 1 ? "" : "s"}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">{active.length} active · {ct.filter((t) => t.status === "completed").length} done{overdue > 0 && ` · ${overdue} overdue`}{critical > 0 && ` · ${critical} critical`}{c.archived && " · archived"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Link href={`/categories/${c.id}`} className="text-xs text-indigo-400 hover:underline">Open →</Link>
                  <select value={moveMap[c.id] || ""} onChange={(e) => setMoveMap((m) => ({ ...m, [c.id]: e.target.value }))} className="input max-w-[180px] !py-1 text-xs" aria-label="Move tasks to">
                    <option value="">Move tasks to… (or trash)</option>
                    {categories.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button
                    className="text-xs text-red-400 hover:underline"
                    onClick={() => {
                      const n = ct.filter((t) => !t.trashed_at).length;
                      if (!confirm(`Delete "${c.name}"? ${n} task(s) will be ${moveMap[c.id] ? "moved" : "moved to Trash"} — never silently deleted.`)) return;
                      deleteCategory(c.id, moveMap[c.id] || null);
                    }}
                  >Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
