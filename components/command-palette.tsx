"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, Bell, CornerDownLeft, FileText, Folder, FolderKanban, Library, Moon,
  Plus, Search, Settings as SettingsIcon, Sun
} from "lucide-react";
import { useStore } from "@/lib/store";
import { NAV_GROUPS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "./priority-badge";
import type { Note, Project, SavedLink, Task } from "@/lib/types";

interface Cmd {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

type Hit =
  | { type: "task"; key: string; task: Task }
  | { type: "note"; key: string; note: Note }
  | { type: "project"; key: string; project: Project }
  | { type: "link"; key: string; link: SavedLink }
  | { type: "category"; key: string; id: string; name: string };

export function CommandPalette() {
  const router = useRouter();
  const {
    paletteOpen, setPaletteOpen, tasks, categories, projects, smartNotes, savedLinks,
    setDetailTaskId, openQuickAdd, settings, updateSettings
  } = useStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = () => setPaletteOpen(true);
    window.addEventListener("tf:palette", h);
    return () => window.removeEventListener("tf:palette", h);
  }, [setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) { setQuery(""); setActive(0); }
  }, [paletteOpen]);

  const close = () => setPaletteOpen(false);

  const commands = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = NAV_GROUPS.flatMap((g) =>
      g.items.filter((i) => !i.soon).map((i) => ({
        id: `nav:${i.href}:${i.label}`,
        label: i.label,
        group: "Go to",
        icon: i.icon,
        keywords: "navigate page open",
        run: () => { close(); router.push(i.href); }
      }))
    );
    const actions: Cmd[] = [
      { id: "act:new", label: "Create a new task", group: "Actions", icon: Plus, keywords: "add quick create n", run: () => { close(); openQuickAdd(); } },
      { id: "act:note", label: "Create a new note", group: "Actions", icon: FileText, keywords: "write knowledge capture", run: () => { close(); router.push("/notes?new=1"); } },
      { id: "act:theme", label: `Switch to ${settings.theme === "light" ? "dark" : "light"} theme`, group: "Actions", icon: settings.theme === "light" ? Moon : Sun, keywords: "appearance contrast", run: () => { close(); updateSettings({ theme: settings.theme === "light" ? "dark" : "light" }); } },
      { id: "act:notif", label: "Open notifications", group: "Actions", icon: Bell, keywords: "alerts reminders", run: () => { close(); router.push("/notifications"); } },
      { id: "act:settings", label: "Open settings", group: "Actions", icon: SettingsIcon, keywords: "preferences account", run: () => { close(); router.push("/settings"); } }
    ];
    return [...actions, ...nav];
  }, [router, openQuickAdd, settings.theme, updateSettings]);

  const q = query.trim().toLowerCase();

  const filteredCommands = useMemo(() => {
    if (!q) return commands.slice(0, 8);
    return commands.filter((c) => (c.label + " " + (c.keywords || "")).toLowerCase().includes(q)).slice(0, 5);
  }, [commands, q]);

  const hits = useMemo<Hit[]>(() => {
    if (!q) return [];
    const found: Hit[] = [];
    const taskMatches = tasks
      .filter((t) => !t.trashed_at && !t.archived)
      .filter((t) => {
        const cat = categories.find((c) => c.id === t.category_id)?.name || "";
        const project = projects.find((p) => p.id === t.project_id)?.name || "";
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.notes_text || "").toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q) ||
          project.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed"))
      .slice(0, 5);
    for (const task of taskMatches) found.push({ type: "task", key: task.id, task });

    const noteMatches = smartNotes
      .filter((n) => !n.archived)
      .filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((tag) => tag.toLowerCase().includes(q)))
      .slice(0, 4);
    for (const note of noteMatches) found.push({ type: "note", key: note.id, note });

    const projectMatches = projects
      .filter((p) => !p.archived)
      .filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .slice(0, 3);
    for (const project of projectMatches) found.push({ type: "project", key: project.id, project });

    const linkMatches = savedLinks
      .filter((l) => !l.archived)
      .filter((l) => l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.tags.some((tag) => tag.toLowerCase().includes(q)))
      .slice(0, 3);
    for (const link of linkMatches) found.push({ type: "link", key: link.id, link });

    const catMatches = categories.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 2);
    for (const c of catMatches) found.push({ type: "category", key: c.id, id: c.id, name: c.name });
    return found;
  }, [tasks, categories, projects, smartNotes, savedLinks, q]);

  const flat = useMemo(() => [
    ...filteredCommands.map((cmd) => ({ kind: "cmd" as const, cmd })),
    ...hits.map((hit) => ({ kind: "hit" as const, hit }))
  ], [filteredCommands, hits]);

  const total = flat.length;
  const clamped = Math.min(active, Math.max(total - 1, 0));

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${clamped}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [clamped]);

  if (!paletteOpen) return null;

  const openHit = (hit: Hit) => {
    close();
    if (hit.type === "task") setDetailTaskId(hit.task.id);
    else if (hit.type === "note") router.push(`/notes?open=${hit.note.id}`);
    else if (hit.type === "project") router.push(`/projects/${hit.project.id}`);
    else if (hit.type === "category") router.push(`/categories/${hit.id}`);
    else window.open(hit.link.url, "_blank", "noopener,noreferrer");
  };

  const runFlat = (i: number) => {
    const item = flat[i];
    if (!item) return;
    if (item.kind === "cmd") item.cmd.run();
    else openHit(item.hit);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (total ? (a + 1) % total : 0)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (total ? (a - 1 + total) % total : 0)); }
    if (e.key === "Enter") { e.preventDefault(); runFlat(clamped); }
  };

  let idx = filteredCommands.length - 1;
  const nextIdx = () => ++idx;

  const renderHit = (hit: Hit) => {
    const i = nextIdx();
    const isActive = clamped === i;
    const base = cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm", isActive ? "bg-indigo-500/15" : "hover:bg-muted");
    if (hit.type === "task") {
      const cat = categories.find((c) => c.id === hit.task.category_id);
      return (
        <button key={hit.key} data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => openHit(hit)} className={base}>
          <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate", hit.task.status === "completed" && "text-muted-foreground line-through")}>{hit.task.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{cat ? cat.name : "No section"}{hit.task.deadline_date ? ` · ${hit.task.deadline_date}` : ""}</span>
          </span>
          <PriorityBadge priority={hit.task.priority} size="xs" />
        </button>
      );
    }
    if (hit.type === "note") {
      return (
        <button key={hit.key} data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => openHit(hit)} className={base}>
          <FileText size={15} className="shrink-0 text-violet-300" />
          <span className="min-w-0 flex-1"><span className="block truncate">{hit.note.title}</span><span className="block truncate text-[11px] text-muted-foreground">Note · {hit.note.note_type}</span></span>
          <CornerDownLeft size={13} className={cn("text-muted-foreground", !isActive && "opacity-0")} />
        </button>
      );
    }
    if (hit.type === "project") {
      return (
        <button key={hit.key} data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => openHit(hit)} className={base}>
          <FolderKanban size={15} className="shrink-0" style={{ color: hit.project.color }} />
          <span className="min-w-0 flex-1"><span className="block truncate">{hit.project.name}</span><span className="block truncate text-[11px] text-muted-foreground">Project · {hit.project.status}</span></span>
        </button>
      );
    }
    if (hit.type === "link") {
      return (
        <button key={hit.key} data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => openHit(hit)} className={base}>
          <Library size={15} className="shrink-0 text-cyan-300" />
          <span className="min-w-0 flex-1"><span className="block truncate">{hit.link.title}</span><span className="block truncate text-[11px] text-muted-foreground">{hit.link.url}</span></span>
        </button>
      );
    }
    return (
      <button key={hit.key} data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => openHit(hit)} className={base}>
        <Folder size={15} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{hit.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Category</span>
      </button>
    );
  };

  const noteHits = hits.filter((h) => h.type === "note");
  const projectHits = hits.filter((h) => h.type === "project");
  const linkHits = hits.filter((h) => h.type === "link");
  const catHits = hits.filter((h) => h.type === "category");
  const taskHits = hits.filter((h) => h.type === "task");

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/65 p-4 pt-[10vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Global search" onMouseDown={close}>
      <div className="card scale-in w-full max-w-xl overflow-hidden shadow-soft" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search size={17} className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search tasks, notes, projects, links or run a command..."
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Global search"
          />
          <span className="kbd shrink-0">Esc</span>
        </div>

        <div ref={listRef} className="scroll-thin max-h-[56vh] overflow-y-auto p-2">
          {total === 0 && (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-medium">No results for “{query}”</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a task, note, project, link, category or tag.</p>
            </div>
          )}

          {filteredCommands.length > 0 && (
            <>
              <p className="eyebrow px-2 pb-1 pt-2">{q ? "Commands" : "Quick actions & pages"}</p>
              {filteredCommands.map((c, i) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    data-idx={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => c.run()}
                    className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm", clamped === i ? "bg-indigo-500/15 text-indigo-200" : "hover:bg-muted")}
                  >
                    <Icon size={16} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{c.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.group}</span>
                    {clamped === i && <CornerDownLeft size={13} className="text-muted-foreground" />}
                  </button>
                );
              })}
            </>
          )}

          {taskHits.length > 0 && <><p className="eyebrow px-2 pb-1 pt-3">Tasks</p>{taskHits.map(renderHit)}</>}
          {noteHits.length > 0 && <><p className="eyebrow px-2 pb-1 pt-3">Notes</p>{noteHits.map(renderHit)}</>}
          {projectHits.length > 0 && <><p className="eyebrow px-2 pb-1 pt-3">Projects</p>{projectHits.map(renderHit)}</>}
          {linkHits.length > 0 && <><p className="eyebrow px-2 pb-1 pt-3">Knowledge links</p>{linkHits.map(renderHit)}</>}
          {catHits.length > 0 && <><p className="eyebrow px-2 pb-1 pt-3">Categories</p>{catHits.map(renderHit)}</>}
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="flex items-center gap-1"><span className="kbd">↵</span> open</span>
          <span className="ml-auto flex items-center gap-1"><span className="kbd">Ctrl</span><span className="kbd">K</span> anywhere</span>
        </div>
      </div>
    </div>
  );
}
