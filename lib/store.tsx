"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Category,
  DemoUser,
  FocusSession,
  Note,
  NotificationItem,
  NotificationPrefs,
  Project,
  ProjectStatus,
  SavedLink,
  Subtask,
  Task,
  TaskNote,
  TaskStatus,
  UserSettings
} from "./types";
import { DEFAULT_CATEGORIES } from "./types";
import { calculatePriority, compareByUrgency, todayString } from "./priority";
import { getSupabaseBrowser, isSupabaseConfigured } from "./supabase";
import type { Session } from "@supabase/supabase-js";
import { nowISO, uid } from "./utils";
import type { TaskFormValues } from "./validation";
import { markdownToPlainText } from "./markdown";

const OPTIONAL_TABLES = new Set(["projects", "notes", "saved_links", "focus_sessions"]);

function mergeById<T extends { id: string }>(server: T[], local: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of server) map.set(row.id, row);
  for (const row of local) if (!map.has(row.id)) map.set(row.id, row);
  return [...map.values()];
}

// ── defaults ────────────────────────────────────────────────
const DEFAULT_SETTINGS: UserSettings = {
  display_name: "",
  timezone: "Asia/Kolkata",
  theme: "dark",
  date_format: "dd/MM/yyyy",
  week_start: 1,
  default_sort: "priority",
  default_view: "list",
  daily_focus_limit: 5,
  reminder_days_before: [0, 1, 3, 7],
  ai_language: "en",
  ai_auto_index: true
};

const DEFAULT_NOTIF: NotificationPrefs = {
  enabled: true,
  days_before: [0, 1, 3, 7],
  daily_summary: true,
  overdue_alerts: true,
  permission: typeof Notification !== "undefined" ? Notification.permission : "unknown",
  push_enabled: true,
  push_slots: ["06:00", "12:00", "18:00"]
};

export interface Toast { id: string; title: string; body?: string; kind: "success" | "error" | "info"; }

export interface AuthResult { error: string | null; notice?: string }

interface Store {
  ready: boolean;
  cloudMode: boolean;
  user: DemoUser | null;
  authLoading: boolean;
  settings: UserSettings;
  notifPrefs: NotificationPrefs;
  categories: Category[];
  tasks: Task[];
  subtasks: Subtask[];
  notes: TaskNote[];
  projects: Project[];
  smartNotes: Note[];
  savedLinks: SavedLink[];
  focusSessions: FocusSession[];
  notifications: NotificationItem[];
  unreadCount: number;
  toasts: Toast[];
  todayStr: string;
  // ui state
  quickAddOpen: boolean;
  setQuickAddOpen: (v: boolean) => void;
  quickAddDefaults: Partial<TaskFormValues> | null;
  openQuickAdd: (d?: Partial<TaskFormValues>) => void;
  detailTaskId: string | null;
  setDetailTaskId: (id: string | null) => void;
  globalSearch: string;
  setGlobalSearch: (s: string) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  // auth
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, name?: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  // settings
  updateSettings: (p: Partial<UserSettings>) => void;
  updateNotifPrefs: (p: Partial<NotificationPrefs>) => void;
  markNotifRead: (id: string) => void;
  markAllNotifRead: () => void;
  requestBrowserPermission: () => Promise<void>;
  // tasks
  createTask: (v: TaskFormValues) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleComplete: (id: string) => void;
  deleteTask: (id: string, permanent?: boolean) => void;
  restoreTask: (id: string) => void;
  duplicateTask: (id: string) => void;
  // categories
  createCategory: (name: string, icon: string, color: string) => Category;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string, moveTo: string | null) => void;
  reorderCategories: (orderedIds: string[]) => void;
  // subtasks / task notes
  addSubtask: (taskId: string, title: string, sortOrder?: number) => void;
  toggleSubtask: (id: string) => void;
  deleteSubtask: (id: string) => void;
  addNote: (taskId: string, body: string) => void;
  deleteNote: (id: string) => void;
  // projects
  createProject: (v: {
    name: string;
    description?: string;
    category_id?: string | null;
    color?: string;
    status?: ProjectStatus;
    start_date?: string | null;
    target_date?: string | null;
  }) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  // smart notes
  createSmartNote: (v?: Partial<Pick<Note, "title" | "content" | "note_type" | "category_id" | "project_id" | "tags" | "linked_task_id">>) => Note;
  updateSmartNote: (id: string, patch: Partial<Note>) => void;
  deleteSmartNote: (id: string) => void;
  convertNoteToTask: (noteId: string, v: Partial<TaskFormValues>) => Task | null;
  // knowledge links
  createSavedLink: (v: {
    url: string;
    title?: string;
    description?: string;
    category_id?: string | null;
    project_id?: string | null;
    tags?: string[];
  }) => SavedLink;
  updateSavedLink: (id: string, patch: Partial<SavedLink>) => void;
  deleteSavedLink: (id: string) => void;
  // focus
  recordFocusSession: (v: {
    task_id: string | null;
    project_id: string | null;
    duration_seconds: number;
    planned_seconds: number;
    completed: boolean;
    started_at: string;
    ended_at: string;
  }) => FocusSession;
  // data
  exportJSON: () => string;
  importTasks: (arr: unknown[]) => { ok: number; skipped: number };
}

const Ctx = createContext<Store | null>(null);
export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}
function save(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Google returns full_name/name; password signups set display_name.
function nameFromMeta(meta: Record<string, unknown> | undefined, email?: string | null): string {
  const m = meta || {};
  const cand = [m.display_name, m.full_name, m.name, m.user_name].find(
    (v) => typeof v === "string" && v.trim()
  ) as string | undefined;
  return cand ? cand.trim() : email?.split("@")[0] || "there";
}

// Deterministic IDs: the same default section gets the same primary key on
// every device/browser, so seeding is idempotent and can never duplicate.
function seedCategories(userId: string): Category[] {
  const t = nowISO();
  return DEFAULT_CATEGORIES.map((c, i) => ({
    id: `cat_seed_${userId}_${slugify(c.name)}`,
    user_id: userId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sort_order: i,
    archived: false,
    created_at: t
  }));
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<DemoUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [smartNotes, setSmartNotes] = useState<Note[]>([]);
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [todayStr, setTodayStr] = useState(() => todayString("Asia/Kolkata"));
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddDefaults, setQuickAddDefaults] = useState<Partial<TaskFormValues> | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const cloudMode = isSupabaseConfigured;
  const uidRef = useRef<string | null>(null);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = uid("toast");
    setToasts((p) => [...p.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((p) => p.filter((x) => x.id !== id)), []);

  const ns = useCallback((base: string) => `tf:${uidRef.current ?? "anon"}:${base}`, []);

  // ── auth bootstrap ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      if (sb) {
        const { data } = await sb.auth.getSession();
        const su = data.session?.user;
        if (su) {
          const u: DemoUser = {
            id: su.id,
            email: su.email ?? "user@taskflow.app",
            display_name: nameFromMeta(su.user_metadata, su.email)
          };
          uidRef.current = u.id;
          setUser(u);
        }
        sb.auth.onAuthStateChange((_ev: string, session: Session | null) => {
          const su2 = session?.user;
          if (su2) {
            const u: DemoUser = {
              id: su2.id,
              email: su2.email ?? "user@taskflow.app",
              display_name: nameFromMeta(su2.user_metadata, su2.email)
            };
            uidRef.current = u.id;
            setUser(u);
          } else {
            setUser(null);
            uidRef.current = null;
          }
        });
      } else {
        const saved = load<DemoUser | null>("tf:demo-user", null);
        if (saved) {
          uidRef.current = saved.id;
          setUser(saved);
        }
      }
      setAuthLoading(false);
    })();
  }, []);

  // ── load persisted state when user resolves (or anon) ────
  useEffect(() => {
    if (authLoading) return;
    const id = uidRef.current ?? "anon";
    const cats = load<Category[]>(`tf:${id}:cats`, []);
    const tks = load<Task[]>(`tf:${id}:tasks`, []);
    const sts = load<Subtask[]>(`tf:${id}:subtasks`, []);
    const nts = load<TaskNote[]>(`tf:${id}:notes`, []);
    const prjs = load<Project[]>(`tf:${id}:projects`, []);
    const smart = load<Note[]>(`tf:${id}:smartnotes`, []);
    const links = load<SavedLink[]>(`tf:${id}:links`, []);
    const sessions = load<FocusSession[]>(`tf:${id}:focus`, []);
    const set = load<UserSettings>(`tf:${id}:settings`, DEFAULT_SETTINGS);
    const np = load<NotificationPrefs>(`tf:${id}:notif`, DEFAULT_NOTIF);
    const notifs = load<NotificationItem[]>(`tf:${id}:notifs`, []);
    const finalCats = cats.length ? cats : user ? seedCategories(user.id) : [];
    setCategories(finalCats);
    // recalc priorities on load (day may have changed)
    const today = todayString(set.timezone || "Asia/Kolkata");
    setTodayStr(today);
    const recalc = tks.map((t) => {
      const { priority } = calculatePriority(t.deadline_date, today, set.timezone);
      return t.priority === priority ? t : { ...t, priority, updated_at: nowISO() };
    });
    setTasks(recalc);
    setSubtasks(sts);
    setNotes(nts);
    setProjects(prjs);
    setSmartNotes(smart);
    setSavedLinks(links);
    setFocusSessions(sessions);
    setSettings({ ...DEFAULT_SETTINGS, ...set });
    setNotifPrefs({ ...DEFAULT_NOTIF, ...np });
    setNotifications(notifs);
    setReady(true);

    // pull from Supabase when configured; merge (never blindly replace) so a
    // failed cloud write can never wipe data the user just entered.
    (async () => {
      const sb = getSupabaseBrowser();
      if (!sb || !user) return;
      try {
        const [cRes, tRes, sRes, nRes, pRes, snRes, lRes, fRes] = await Promise.all([
          sb.from("categories").select("*").eq("user_id", user.id).order("sort_order"),
          sb.from("tasks").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2000),
          sb.from("subtasks").select("*").eq("user_id", user.id).order("sort_order").limit(5000),
          sb.from("task_notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2000),
          sb.from("projects").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
          sb.from("notes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(2000),
          sb.from("saved_links").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2000),
          sb.from("focus_sessions").select("*").eq("user_id", user.id).order("started_at", { ascending: false }).limit(1000)
        ]);

        const serverCats = (cRes.data as Category[]) || [];
        // Merge local + server sections, then collapse duplicates by name.
        // (Earlier builds seeded random IDs, so identical names accumulated.)
        const localCats = [...finalCats, ...load<Category[]>(`tf:${id}:cats`, [])];
        const catById = new Map<string, Category>();
        for (const c of serverCats) catById.set(c.id, c); // server copy wins as canonical
        for (const c of localCats) {
          if (c.user_id !== user.id) continue;
          if (!catById.has(c.id)) catById.set(c.id, c);
        }

        const byName = new Map<string, Category>();
        const remapCat = new Map<string, string>(); // duplicate id → canonical id
        const duplicateCats: Category[] = [];
        const ordered = [...catById.values()].sort((a, b) => {
          const s = (a.sort_order ?? 0) - (b.sort_order ?? 0);
          return s !== 0 ? s : (a.created_at || "") < (b.created_at || "") ? -1 : 1;
        });
        for (const c of ordered) {
          const key = c.name.trim().toLowerCase();
          const canonical = byName.get(key);
          if (!canonical) { byName.set(key, c); continue; }
          remapCat.set(c.id, canonical.id);
          duplicateCats.push(c);
        }
        const mergedCats = [...byName.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        // 1) make sure every canonical section exists in the cloud
        const serverIdsForCats = new Set(serverCats.map((c) => c.id));
        const catsToPush = mergedCats.filter((c) => !serverIdsForCats.has(c.id));
        if (catsToPush.length) {
          const { error } = await sb.from("categories").upsert(catsToPush);
          if (error) console.warn("category sync failed", error.message);
        }

        if (tRes.data) {
          const today2 = todayString(set.timezone || "Asia/Kolkata");
          const serverTasks = (tRes.data as Task[]).map((t) => {
            const { priority } = calculatePriority(t.deadline_date, today2, set.timezone);
            return { ...t, priority };
          });
          const byId = new Map<string, Task>();
          for (const t of serverTasks) byId.set(t.id, t);
          // keep local-only tasks (e.g. saved while offline / failed write)
          for (const t of load<Task[]>(`tf:${id}:tasks`, [])) {
            if (!byId.has(t.id) && t.user_id === user.id) byId.set(t.id, t);
          }
          // point tasks at the canonical section when their section was a duplicate
          const remappedTasks: Task[] = [];
          if (remapCat.size) {
            for (const [tid, t] of byId) {
              if (t.category_id && remapCat.has(t.category_id)) {
                const fixed = { ...t, category_id: remapCat.get(t.category_id)! };
                byId.set(tid, fixed);
                remappedTasks.push(fixed);
              }
            }
          }
          const merged = [...byId.values()];
          setTasks(merged);
          save(`tf:${id}:tasks`, merged);

          if (remappedTasks.length) {
            const { error } = await sb.from("tasks").upsert(remappedTasks);
            if (error) console.warn("task remap failed", error.message);
          }
          // Retry pushing tasks that only exist locally (failed earlier).
          const serverTaskIds = new Set(serverTasks.map((t) => t.id));
          const unsynced = merged.filter((t) => !serverTaskIds.has(t.id));
          if (unsynced.length) {
            const { error } = await sb.from("tasks").upsert(unsynced);
            if (error) console.warn("task re-sync failed", error.message);
          }
        }

        // 2) only after tasks are moved, delete the duplicate sections
        if (duplicateCats.length) {
          const { error } = await sb.from("categories").delete().in("id", duplicateCats.map((c) => c.id)).eq("user_id", user.id);
          if (error) console.warn("duplicate category cleanup failed", error.message);
        }

        setCategories(mergedCats);
        save(`tf:${id}:cats`, mergedCats);
        if (sRes.data) { setSubtasks(sRes.data as Subtask[]); save(`tf:${id}:subtasks`, sRes.data); }
        if (nRes.data) {
          const mappedN = (nRes.data as Array<{ id: string; task_id: string; body: string; created_at: string }>).map((r) => ({
            id: r.id, task_id: r.task_id, body: r.body, created_at: r.created_at
          })) as TaskNote[];
          setNotes(mappedN);
          save(`tf:${id}:notes`, mappedN);
        }

        if (pRes.data) {
          const merged = mergeById(pRes.data as Project[], prjs);
          setProjects(merged);
          save(`tf:${id}:projects`, merged);
          const serverIds = new Set((pRes.data as Project[]).map((r) => r.id));
          const unsynced = merged.filter((r) => !serverIds.has(r.id) && r.user_id === user.id);
          if (unsynced.length) {
            const { error } = await sb.from("projects").upsert(unsynced);
            if (error && !["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code || "")) console.warn("project re-sync failed", error.message);
          }
        }
        if (snRes.data) {
          const merged = mergeById(snRes.data as Note[], smart);
          setSmartNotes(merged);
          save(`tf:${id}:smartnotes`, merged);
          const serverIds = new Set((snRes.data as Note[]).map((r) => r.id));
          const unsynced = merged.filter((r) => !serverIds.has(r.id) && r.user_id === user.id);
          if (unsynced.length) {
            const { error } = await sb.from("notes").upsert(unsynced);
            if (error && !["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code || "")) console.warn("notes re-sync failed", error.message);
          }
        }
        if (lRes.data) {
          const merged = mergeById(lRes.data as SavedLink[], links);
          setSavedLinks(merged);
          save(`tf:${id}:links`, merged);
          const serverIds = new Set((lRes.data as SavedLink[]).map((r) => r.id));
          const unsynced = merged.filter((r) => !serverIds.has(r.id) && r.user_id === user.id);
          if (unsynced.length) {
            const { error } = await sb.from("saved_links").upsert(unsynced);
            if (error && !["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code || "")) console.warn("links re-sync failed", error.message);
          }
        }
        if (fRes.data) {
          const merged = mergeById(fRes.data as FocusSession[], sessions);
          setFocusSessions(merged);
          save(`tf:${id}:focus`, merged);
          const serverIds = new Set((fRes.data as FocusSession[]).map((r) => r.id));
          const unsynced = merged.filter((r) => !serverIds.has(r.id) && r.user_id === user.id);
          if (unsynced.length) {
            const { error } = await sb.from("focus_sessions").upsert(unsynced);
            if (error && !["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code || "")) console.warn("focus re-sync failed", error.message);
          }
        }

        // reminder preferences follow the account across devices
        const { data: prefRow } = await sb.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle();
        if (prefRow) {
          setNotifPrefs((prev) => ({
            ...prev,
            enabled: prefRow.enabled ?? prev.enabled,
            days_before: prefRow.days_before ?? prev.days_before,
            daily_summary: prefRow.daily_summary ?? prev.daily_summary,
            overdue_alerts: prefRow.overdue_alerts ?? prev.overdue_alerts,
            push_enabled: prefRow.push_enabled ?? prev.push_enabled,
            push_slots: prefRow.push_slots ?? prev.push_slots
          }));
        }
      } catch (e) {
        console.warn("cloud sync failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  // ── persist locally on change ────────────────────────────
  useEffect(() => { if (ready) save(ns("cats"), categories); }, [categories, ready, ns]);
  useEffect(() => { if (ready) save(ns("tasks"), tasks); }, [tasks, ready, ns]);
  useEffect(() => { if (ready) save(ns("subtasks"), subtasks); }, [subtasks, ready, ns]);
  useEffect(() => { if (ready) save(ns("notes"), notes); }, [notes, ready, ns]);
  useEffect(() => { if (ready) save(ns("projects"), projects); }, [projects, ready, ns]);
  useEffect(() => { if (ready) save(ns("smartnotes"), smartNotes); }, [smartNotes, ready, ns]);
  useEffect(() => { if (ready) save(ns("links"), savedLinks); }, [savedLinks, ready, ns]);
  useEffect(() => { if (ready) save(ns("focus"), focusSessions.slice(0, 500)); }, [focusSessions, ready, ns]);
  useEffect(() => { if (ready) save(ns("settings"), settings); }, [settings, ready, ns]);
  useEffect(() => { if (ready) save(ns("notif"), notifPrefs); }, [notifPrefs, ready, ns]);
  useEffect(() => { if (ready) save(ns("notifs"), notifications.slice(0, 100)); }, [notifications, ready, ns]);

  // ── sync reminder prefs + profile to the cloud (the push scheduler reads these) ──
  useEffect(() => {
    if (!ready || !user) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const uid = user.id;
    const t = setTimeout(() => {
      const base = {
        user_id: uid,
        enabled: notifPrefs.enabled,
        days_before: notifPrefs.days_before,
        daily_summary: notifPrefs.daily_summary,
        overdue_alerts: notifPrefs.overdue_alerts,
        updated_at: new Date().toISOString()
      };
      sb.from("notification_preferences")
        .upsert({ ...base, push_enabled: notifPrefs.push_enabled, push_slots: notifPrefs.push_slots })
        .then(({ error }) => {
          if (!error) return;
          // push_* columns may not be migrated yet — keep the base prefs in sync anyway
          if (error.code === "42703" || error.code === "PGRST204") {
            sb.from("notification_preferences").upsert(base).then(({ error: e2 }) => {
              if (e2) console.warn("prefs sync failed", e2.message);
            });
            return;
          }
          console.warn("prefs sync failed", error.message);
        });
    }, 700);
    return () => clearTimeout(t);
  }, [notifPrefs, ready, user]);

  useEffect(() => {
    if (!ready || !user) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const uid = user.id;
    const t = setTimeout(() => {
      sb.from("profiles")
        .upsert({
          id: uid,
          email: user.email,
          display_name: settings.display_name || user.display_name,
          timezone: settings.timezone,
          theme: settings.theme,
          date_format: settings.date_format,
          week_start: settings.week_start,
          default_sort: settings.default_sort,
          default_view: settings.default_view,
          daily_focus_limit: settings.daily_focus_limit,
          updated_at: new Date().toISOString()
        })
        .then(({ error }) => { if (error) console.warn("profile sync failed", error.message); });
    }, 700);
    return () => clearTimeout(t);
  }, [settings, ready, user]);

  // ── theme class ──────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    const dark = settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    // default premium dark
    if (settings.theme === "light") root.classList.remove("dark");
    else if (settings.theme === "dark") root.classList.add("dark");
    else root.classList.toggle("dark", dark);
    root.style.colorScheme = root.classList.contains("dark") ? "dark" : "light";
  }, [settings.theme]);

  // ── midnight rollover: recalc priorities when day changes ─
  useEffect(() => {
    const tick = () => {
      const t = todayString(settings.timezone);
      setTodayStr((prev) => {
        if (prev !== t) {
          setTasks((all) =>
            all.map((task) => {
              const { priority } = calculatePriority(task.deadline_date, t, settings.timezone);
              return task.priority === priority ? task : { ...task, priority, updated_at: nowISO() };
            })
          );
          return t;
        }
        return prev;
      });
    };
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [settings.timezone]);

  // ── reminders (idempotent per day+task+kind) ──────────────
  useEffect(() => {
    if (!ready || !notifPrefs.enabled) return;
    const today = todayString(settings.timezone);
    const sentKey = (taskId: string, kind: string) => `${ns("sent")}:${today}:${kind}:${taskId}`;
    const fresh: NotificationItem[] = [];
    const browserOK = typeof Notification !== "undefined" && Notification.permission === "granted";

    const push = (taskId: string | null, kind: NotificationItem["kind"], title: string, body: string, dedupe?: string) => {
      if (dedupe && localStorage.getItem(dedupe)) return;
      if (dedupe) try { localStorage.setItem(dedupe, "1"); } catch { /* */ }
      // avoid duplicates already in tray for same day
      setNotifications((prev) => {
        if (prev.some((n) => n.title === title && n.body === body && n.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10))) return prev;
        return [{ id: uid("notif"), task_id: taskId, kind, title, body, read: false, created_at: new Date().toISOString() }, ...prev].slice(0, 100);
      });
      fresh.push({ id: "x", task_id: taskId, kind, title, body, read: false, created_at: new Date().toISOString() });
      if (browserOK) {
        try { new Notification(title, { body }); } catch { /* */ }
      }
    };

    for (const t of tasks) {
      if (t.status === "completed" || t.archived || t.trashed_at) continue;
      const { daysRemaining, overdue } = calculatePriority(t.deadline_date, today, settings.timezone);
      if (daysRemaining === null) continue;
      if (overdue && notifPrefs.overdue_alerts) {
        push(t.id, "overdue", `Overdue: ${t.title}`, `${t.deadline_date} — open Second Brain AI to reschedule.`, sentKey(t.id, "overdue"));
      } else if (notifPrefs.days_before.includes(daysRemaining) && daysRemaining >= 0) {
        const label = daysRemaining === 0 ? "Due today" : daysRemaining === 1 ? "Due tomorrow" : `Due in ${daysRemaining} days`;
        push(t.id, "due_soon", `${label}: ${t.title}`, `Deadline ${t.deadline_date}. Priority: ${t.priority}.`, sentKey(t.id, `due-${daysRemaining}`));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, todayStr, tasks.length]);

  // ── supabase write-through helper ────────────────────────
  // Failures are surfaced to the user instead of being swallowed; the local
  // copy is kept so nothing is lost, and it is re-synced on the next load.
  const sbWrite = useCallback(async (table: string, op: "upsert" | "delete", row?: Record<string, unknown>, id?: string) => {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    try {
      if (op === "upsert" && row) {
        let { error } = await sb.from(table).upsert(row);
        // FK safety net: a task pointing at a section that is not in the cloud
        // fails to save. Retry without the section instead of dropping the task.
        if (error && table === "tasks" && /foreign key|23503/i.test(error.message) && row.category_id) {
          const retry = await sb.from(table).upsert({ ...row, category_id: null });
          if (!retry.error) {
            pushToast({ kind: "info", title: "Task saved", body: "Its section was not in the cloud yet, so it was saved without one." });
            return;
          }
          error = retry.error;
        }
        if (error) {
          const missing = ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code || "");
          if (OPTIONAL_TABLES.has(table) && missing) {
            console.warn(`[taskflow] ${table} is not migrated yet; saved locally only.`);
            return;
          }
          if (table === "tasks" && error.code === "PGRST204") {
            const legacy = { ...row };
            delete legacy.project_id;
            delete legacy.source_note_id;
            const retry = await sb.from(table).upsert(legacy);
            if (!retry.error) {
              pushToast({ kind: "info", title: "Task saved", body: "Run the Prompt 2 migration to enable projects and note links in the cloud." });
              return;
            }
          }
          console.error(`[taskflow] ${table} write failed`, error);
          pushToast({ kind: "error", title: "Cloud save failed", body: `${table}: ${error.message}. Your change is kept locally and will retry.` });
        }
      } else if (op === "delete" && id) {
        const { error } = await sb.from(table).delete().eq("id", id).eq("user_id", user.id);
        if (error) {
          if (OPTIONAL_TABLES.has(table) && ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code || "")) {
            console.warn(`[taskflow] ${table} is not migrated yet; removed locally only.`);
            return;
          }
          console.error(`[taskflow] ${table} delete failed`, error);
          pushToast({ kind: "error", title: "Cloud delete failed", body: error.message });
        }
      }
    } catch (e) {
      console.error(`[taskflow] ${table} network error`, e);
      pushToast({ kind: "error", title: "Cloud unavailable", body: "Change kept locally; it will retry when you are back online." });
    }
  }, [user, pushToast]);

  // ── auth ─────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const sb = getSupabaseBrowser();
    if (sb) {
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        if (!data.session) return { error: "No session returned. If email confirmation is on, confirm your email first." };
        const su = data.user;
        if (su) {
          uidRef.current = su.id;
          setUser({
            id: su.id,
            email: su.email ?? email,
            display_name: nameFromMeta(su.user_metadata, su.email ?? email)
          });
        }
        pushToast({ kind: "success", title: "Signed in" });
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Network error — could not reach Supabase." };
      }
    }
    // local demo mode
    const u: DemoUser = { id: uid("user"), email, display_name: email.split("@")[0] || "there" };
    const existing = load<DemoUser | null>("tf:demo-user", null);
    const final = existing && existing.email === email ? existing : u;
    uidRef.current = final.id;
    save("tf:demo-user", final);
    setUser(final);
    pushToast({ kind: "success", title: `Welcome, ${final.display_name}` });
    return { error: null };
  }, [pushToast]);

  const signUp = useCallback(async (email: string, password: string, name?: string): Promise<AuthResult> => {
    const sb = getSupabaseBrowser();
    if (sb) {
      try {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split("@")[0] } }
        });
        if (error) return { error: error.message };
        if (data.session && data.user) {
          uidRef.current = data.user.id;
          setUser({
            id: data.user.id,
            email: data.user.email ?? email,
            display_name: name?.trim() || nameFromMeta(data.user.user_metadata, data.user.email ?? email)
          });
          pushToast({ kind: "success", title: "Account created" });
          return { error: null };
        }
        return { error: null, notice: "Account created. Check your email to confirm, then sign in." };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Network error — could not reach Supabase." };
      }
    }
    return signIn(email, password);
  }, [pushToast, signIn]);

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    const sb = getSupabaseBrowser();
    if (!sb) return { error: "Cloud auth is not configured (missing Supabase keys)." };
    try {
      const redirectTo = `${window.location.origin}/login`;
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } }
      });
      if (error) {
        if (/provider is not enabled|not enabled/i.test(error.message)) {
          return { error: "Google sign-in is not enabled yet in Supabase (Authentication → Providers → Google)." };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Network error — could not start Google sign-in." };
    }
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (sb) await sb.auth.signOut();
    setUser(null);
    uidRef.current = null;
    // NOTE: never wipe task data on logout (retention requirement).
  }, []);

  // ── settings ─────────────────────────────────────────────
  const updateSettings = useCallback((p: Partial<UserSettings>) => setSettings((s) => ({ ...s, ...p })), []);
  const updateNotifPrefs = useCallback((p: Partial<NotificationPrefs>) => setNotifPrefs((s) => ({ ...s, ...p })), []);
  const markNotifRead = useCallback((id: string) => setNotifications((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n))), []);
  const markAllNotifRead = useCallback(() => setNotifications((p) => p.map((n) => ({ ...n, read: true }))), []);
  const requestBrowserPermission = useCallback(async () => {
    if (typeof Notification === "undefined") { pushToast({ kind: "info", title: "Notifications not supported in this browser" }); return; }
    const r = await Notification.requestPermission();
    setNotifPrefs((s) => ({ ...s, permission: r }));
    pushToast(r === "granted" ? { kind: "success", title: "Notifications enabled" } : { kind: "info", title: "Notifications not granted" });
  }, [pushToast]);

  // ── tasks ────────────────────────────────────────────────
  const createTask = useCallback((v: TaskFormValues): Task => {
    if (!user) throw new Error("Not signed in");
    const today = todayString(settings.timezone);
    const { priority } = calculatePriority(v.deadline_date ?? null, today, settings.timezone);
    const t = nowISO();
    const task: Task = {
      id: uid("task"),
      user_id: user.id,
      title: v.title.trim(),
      description: v.description || "",
      category_id: v.category_id || null,
      project_id: v.project_id || null,
      source_note_id: null,
      subcategory: v.subcategory || null,
      deadline_date: v.deadline_date || null,
      deadline_time: v.deadline_time || null,
      start_date: v.start_date || null,
      status: v.status || "todo",
      priority,
      tags: v.tags || [],
      estimated_minutes: v.estimated_minutes ?? null,
      actual_minutes: v.actual_minutes ?? null,
      recurrence: null,
      notes_text: v.notes_text || null,
      archived: false,
      trashed_at: null,
      completed_at: v.status === "completed" ? t : null,
      is_today_focus: v.is_today_focus || false,
      created_at: t,
      updated_at: t
    };
    setTasks((p) => [task, ...p]);
    sbWrite("tasks", "upsert", { ...task });
    pushToast({ kind: "success", title: "Task added", body: task.title });
    return task;
  }, [user, settings.timezone, sbWrite, pushToast]);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t, ...patch, updated_at: nowISO() };
      if (patch.deadline_date !== undefined) {
        const { priority } = calculatePriority(next.deadline_date, todayString(settings.timezone), settings.timezone);
        next.priority = priority;
      }
      if (patch.status) {
        next.completed_at = patch.status === "completed" ? (t.completed_at ?? nowISO()) : null;
        // recurring: schedule next occurrence without erasing history
        if (patch.status === "completed" && t.recurrence && !patch.completed_at) {
          const nxt = nextDeadlineForRecurrence(next.deadline_date || todayString(settings.timezone), t.recurrence);
          queueMicrotask(() => {
            if (!user) return;
            const { priority } = calculatePriority(nxt, todayString(settings.timezone), settings.timezone);
            const nt: Task = { ...t, id: uid("task"), status: "todo", priority, deadline_date: nxt, completed_at: null, created_at: nowISO(), updated_at: nowISO() };
            setTasks((p) => [nt, ...p]);
            sbWrite("tasks", "upsert", { ...nt });
          });
        }
      }
      sbWrite("tasks", "upsert", { ...next });
      return next;
    }));
  }, [sbWrite, settings.timezone, user]);

  const toggleComplete = useCallback((id: string) => {
    setTasks((prev) => {
      const t = prev.find((x) => x.id === id);
      if (!t) return prev;
      const toCompleted = t.status !== "completed";
      return prev.map((x) => (x.id === id ? {
        ...x,
        status: (toCompleted ? "completed" : "todo") as TaskStatus,
        completed_at: toCompleted ? nowISO() : null,
        updated_at: nowISO()
      } : x));
    });
    const cur = tasks.find((x) => x.id === id);
    if (cur) {
      const nextStatus = cur.status !== "completed" ? "completed" : "todo";
      sbWrite("tasks", "upsert", { ...cur, status: nextStatus, completed_at: nextStatus === "completed" ? nowISO() : null, updated_at: nowISO() });
    }
  }, [sbWrite, tasks]);

  const deleteTask = useCallback((id: string, permanent = false) => {
    if (permanent) {
      setTasks((p) => p.filter((t) => t.id !== id));
      setSubtasks((p) => p.filter((s) => s.task_id !== id));
      setNotes((p) => p.filter((n) => n.task_id !== id));
      setSmartNotes((p) => p.map((n) => (n.linked_task_id === id ? { ...n, linked_task_id: null } : n)));
      setFocusSessions((p) => p.map((f) => (f.task_id === id ? { ...f, task_id: null } : f)));
      sbWrite("tasks", "delete", undefined, id);
      pushToast({ kind: "info", title: "Task permanently deleted" });
    } else {
      setTasks((p) => p.map((t) => (t.id === id ? { ...t, trashed_at: nowISO(), updated_at: nowISO() } : t)));
      pushToast({ kind: "info", title: "Moved to trash", body: "Recover from Trash within 30 days." });
    }
  }, [sbWrite, pushToast]);

  const restoreTask = useCallback((id: string) => {
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, trashed_at: null, archived: false, updated_at: nowISO() } : t)));
  }, []);

  const duplicateTask = useCallback((id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || !user) return;
    const copy: Task = { ...t, id: uid("task"), title: `${t.title} (copy)`, status: "todo", completed_at: null, created_at: nowISO(), updated_at: nowISO() };
    setTasks((p) => [copy, ...p]);
    sbWrite("tasks", "upsert", { ...copy });
    pushToast({ kind: "success", title: "Task duplicated" });
  }, [tasks, user, sbWrite, pushToast]);

  // ── categories ───────────────────────────────────────────
  const createCategory = useCallback((name: string, icon: string, color: string): Category => {
    if (!user) throw new Error("Not signed in");
    const c: Category = { id: uid("cat"), user_id: user.id, name: name.trim(), icon, color, sort_order: categories.length, archived: false, created_at: nowISO() };
    setCategories((p) => [...p, c]);
    sbWrite("categories", "upsert", { ...c });
    return c;
  }, [user, categories.length, sbWrite]);

  const updateCategory = useCallback((id: string, patch: Partial<Category>) => {
    setCategories((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const cur = categories.find((c) => c.id === id);
    if (cur) sbWrite("categories", "upsert", { ...cur, ...patch });
  }, [categories, sbWrite]);

  const deleteCategory = useCallback((id: string, moveTo: string | null) => {
    // Never silently delete tasks: move or trash them explicitly. Projects,
    // notes and links are unassigned rather than deleted.
    setTasks((prev) => prev.map((t) => {
      if (t.category_id !== id) return t;
      const next = moveTo
        ? { ...t, category_id: moveTo, updated_at: nowISO() }
        : { ...t, trashed_at: nowISO(), updated_at: nowISO() };
      sbWrite("tasks", "upsert", { ...next });
      return next;
    }));
    setProjects((prev) => prev.map((p) => {
      if (p.category_id !== id) return p;
      const next = { ...p, category_id: null, updated_at: nowISO() };
      sbWrite("projects", "upsert", { ...next });
      return next;
    }));
    setSmartNotes((prev) => prev.map((n) => {
      if (n.category_id !== id) return n;
      const next = { ...n, category_id: null, updated_at: nowISO() };
      sbWrite("notes", "upsert", { ...next });
      return next;
    }));
    setSavedLinks((prev) => prev.map((l) => {
      if (l.category_id !== id) return l;
      const next = { ...l, category_id: null, updated_at: nowISO() };
      sbWrite("saved_links", "upsert", { ...next });
      return next;
    }));
    setCategories((p) => p.filter((c) => c.id !== id));
    sbWrite("categories", "delete", undefined, id);
    pushToast({ kind: "info", title: moveTo ? "Category deleted, tasks moved" : "Category deleted, tasks moved to trash" });
  }, [pushToast, sbWrite]);

  const reorderCategories = useCallback((orderedIds: string[]) => {
    setCategories((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]));
      const next = orderedIds.map((id, i) => {
        const c = map.get(id);
        return c ? { ...c, sort_order: i } : null;
      }).filter((c): c is Category => Boolean(c));
      for (const c of next) sbWrite("categories", "upsert", { ...c });
      return next;
    });
  }, [sbWrite]);

  // ── subtasks / notes ─────────────────────────────────────
  const addSubtask = useCallback((taskId: string, title: string, sortOrder?: number) => {
    const s: Subtask = {
      id: uid("sub"),
      task_id: taskId,
      title: title.trim(),
      completed: false,
      sort_order: typeof sortOrder === "number" ? sortOrder : subtasks.filter((x) => x.task_id === taskId).length
    };
    setSubtasks((p) => [...p, s]);
    sbWrite("subtasks", "upsert", { ...s, user_id: user?.id });
  }, [subtasks, sbWrite, user]);

  const toggleSubtask = useCallback((id: string) => {
    setSubtasks((p) => p.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, completed: !s.completed };
      sbWrite("subtasks", "upsert", { ...next, user_id: user?.id });
      return next;
    }));
  }, [sbWrite, user]);

  const deleteSubtask = useCallback((id: string) => {
    setSubtasks((p) => p.filter((s) => s.id !== id));
    sbWrite("subtasks", "delete", undefined, id);
  }, [sbWrite]);

  const addNote = useCallback((taskId: string, body: string) => {
    const n: TaskNote = { id: uid("note"), task_id: taskId, body, created_at: nowISO() };
    setNotes((p) => [n, ...p]);
    sbWrite("task_notes", "upsert", { id: n.id, user_id: user?.id, task_id: taskId, body, created_at: n.created_at });
  }, [sbWrite, user]);

  const deleteNote = useCallback((id: string) => {
    setNotes((p) => p.filter((n) => n.id !== id));
    sbWrite("task_notes", "delete", undefined, id);
  }, [sbWrite]);

  // ── export / import ──────────────────────────────────────
  // ── projects ───────────────────────────────────────────────────────────
  const createProject = useCallback((v: {
    name: string;
    description?: string;
    category_id?: string | null;
    color?: string;
    status?: ProjectStatus;
    start_date?: string | null;
    target_date?: string | null;
  }): Project => {
    if (!user) throw new Error("Not signed in");
    const t = nowISO();
    const project: Project = {
      id: uid("project"),
      user_id: user.id,
      name: v.name.trim(),
      description: v.description || "",
      category_id: v.category_id || null,
      color: v.color || "#6366F1",
      status: v.status || "active",
      start_date: v.start_date || null,
      target_date: v.target_date || null,
      archived: false,
      created_at: t,
      updated_at: t
    };
    setProjects((p) => [project, ...p]);
    sbWrite("projects", "upsert", { ...project });
    return project;
  }, [user, sbWrite]);

  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch, updated_at: nowISO() };
      if (patch.status === "archived") next.archived = true;
      if (patch.status && patch.status !== "archived") next.archived = false;
      sbWrite("projects", "upsert", { ...next });
      return next;
    }));
  }, [sbWrite]);

  const deleteProject = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => {
      if (t.project_id !== id) return t;
      const next = { ...t, project_id: null, updated_at: nowISO() };
      sbWrite("tasks", "upsert", { ...next });
      return next;
    }));
    setSmartNotes((prev) => prev.map((n) => {
      if (n.project_id !== id) return n;
      const next = { ...n, project_id: null, updated_at: nowISO() };
      sbWrite("notes", "upsert", { ...next });
      return next;
    }));
    setSavedLinks((prev) => prev.map((l) => {
      if (l.project_id !== id) return l;
      const next = { ...l, project_id: null, updated_at: nowISO() };
      sbWrite("saved_links", "upsert", { ...next });
      return next;
    }));
    setProjects((prev) => prev.filter((p) => p.id !== id));
    sbWrite("projects", "delete", undefined, id);
    pushToast({ kind: "info", title: "Project deleted", body: "Its tasks, notes and links were kept and unassigned." });
  }, [sbWrite, pushToast]);

  // ── smart notes ────────────────────────────────────────────────────────
  const createSmartNote = useCallback((v?: Partial<Pick<Note, "title" | "content" | "note_type" | "category_id" | "project_id" | "tags" | "linked_task_id">>): Note => {
    if (!user) throw new Error("Not signed in");
    const t = nowISO();
    const note: Note = {
      id: uid("note"),
      user_id: user.id,
      title: v?.title?.trim() || "Untitled note",
      content: v?.content || "",
      note_type: v?.note_type || "general",
      category_id: v?.category_id || null,
      project_id: v?.project_id || null,
      tags: v?.tags || [],
      pinned: false,
      favorite: false,
      archived: false,
      linked_task_id: v?.linked_task_id || null,
      created_at: t,
      updated_at: t
    };
    setSmartNotes((p) => [note, ...p]);
    sbWrite("notes", "upsert", { ...note });
    return note;
  }, [user, sbWrite]);

  const updateSmartNote = useCallback((id: string, patch: Partial<Note>) => {
    setSmartNotes((prev) => prev.map((n) => {
      if (n.id !== id) return n;
      const next = { ...n, ...patch, updated_at: nowISO() };
      sbWrite("notes", "upsert", { ...next });
      return next;
    }));
  }, [sbWrite]);

  const deleteSmartNote = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => {
      if (t.source_note_id !== id) return t;
      const next = { ...t, source_note_id: null, updated_at: nowISO() };
      sbWrite("tasks", "upsert", { ...next });
      return next;
    }));
    setSmartNotes((prev) => prev.filter((n) => n.id !== id));
    sbWrite("notes", "delete", undefined, id);
    pushToast({ kind: "info", title: "Note deleted", body: "Tasks created from it were kept." });
  }, [sbWrite, pushToast]);

  const convertNoteToTask = useCallback((noteId: string, v: Partial<TaskFormValues>): Task | null => {
    const note = smartNotes.find((n) => n.id === noteId);
    if (!note || !user) return null;
    const task = createTask({
      title: v.title?.trim() || note.title,
      description: v.description ?? markdownToPlainText(note.content).slice(0, 5000),
      category_id: v.category_id ?? note.category_id,
      project_id: v.project_id ?? note.project_id,
      subcategory: v.subcategory ?? null,
      deadline_date: v.deadline_date ?? null,
      deadline_time: v.deadline_time ?? null,
      start_date: v.start_date ?? null,
      status: v.status || "todo",
      tags: v.tags ?? note.tags,
      estimated_minutes: v.estimated_minutes ?? null,
      actual_minutes: v.actual_minutes ?? null,
      notes_text: v.notes_text ?? null,
      is_today_focus: v.is_today_focus ?? false
    } as TaskFormValues);
    updateTask(task.id, { source_note_id: note.id });
    updateSmartNote(note.id, { linked_task_id: task.id });
    pushToast({ kind: "success", title: "Note converted to task", body: note.title });
    return task;
  }, [smartNotes, user, createTask, updateTask, updateSmartNote, pushToast]);

  // ── knowledge links ────────────────────────────────────────────────────
  const createSavedLink = useCallback((v: {
    url: string;
    title?: string;
    description?: string;
    category_id?: string | null;
    project_id?: string | null;
    tags?: string[];
  }): SavedLink => {
    if (!user) throw new Error("Not signed in");
    let normalized = v.url.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    const parsed = new URL(normalized);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http(s) links are supported.");
    const t = nowISO();
    const link: SavedLink = {
      id: uid("link"),
      user_id: user.id,
      url: parsed.toString(),
      title: v.title?.trim() || parsed.hostname.replace(/^www\./, ""),
      description: v.description || "",
      category_id: v.category_id || null,
      project_id: v.project_id || null,
      tags: v.tags || [],
      favorite: false,
      archived: false,
      created_at: t,
      updated_at: t
    };
    setSavedLinks((p) => [link, ...p]);
    sbWrite("saved_links", "upsert", { ...link });
    return link;
  }, [user, sbWrite]);

  const updateSavedLink = useCallback((id: string, patch: Partial<SavedLink>) => {
    setSavedLinks((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch, updated_at: nowISO() };
      sbWrite("saved_links", "upsert", { ...next });
      return next;
    }));
  }, [sbWrite]);

  const deleteSavedLink = useCallback((id: string) => {
    setSavedLinks((prev) => prev.filter((l) => l.id !== id));
    sbWrite("saved_links", "delete", undefined, id);
    pushToast({ kind: "info", title: "Link removed" });
  }, [sbWrite, pushToast]);

  // ── focus ──────────────────────────────────────────────────────────────
  const recordFocusSession = useCallback((v: {
    task_id: string | null;
    project_id: string | null;
    duration_seconds: number;
    planned_seconds: number;
    completed: boolean;
    started_at: string;
    ended_at: string;
  }): FocusSession => {
    if (!user) throw new Error("Not signed in");
    const session: FocusSession = {
      id: uid("focus"),
      user_id: user.id,
      task_id: v.task_id,
      project_id: v.project_id,
      duration_seconds: Math.max(0, Math.round(v.duration_seconds)),
      planned_seconds: Math.max(0, Math.round(v.planned_seconds)),
      completed: v.completed,
      started_at: v.started_at,
      ended_at: v.ended_at
    };
    setFocusSessions((p) => [session, ...p]);
    sbWrite("focus_sessions", "upsert", { ...session });
    if (v.task_id && session.duration_seconds >= 60) {
      const task = tasks.find((t) => t.id === v.task_id);
      if (task) updateTask(task.id, { actual_minutes: (task.actual_minutes || 0) + Math.max(1, Math.round(session.duration_seconds / 60)) });
    }
    return session;
  }, [user, sbWrite, tasks, updateTask]);

  const exportJSON = useCallback(() => JSON.stringify({
    exported_at: nowISO(), user, settings, categories, tasks, subtasks, notes,
    projects, smartNotes, savedLinks, focusSessions
  }, null, 2), [user, settings, categories, tasks, subtasks, notes, projects, smartNotes, savedLinks, focusSessions]);

  const importTasks = useCallback((arr: unknown[]): { ok: number; skipped: number } => {
    if (!user) return { ok: 0, skipped: 0 };
    let ok = 0, skipped = 0;
    const titles = new Set(tasks.map((t) => `${t.title}||${t.deadline_date}`));
    const fresh: Task[] = [];
    for (const r of arr) {
      if (typeof r !== "object" || !r) { skipped++; continue; }
      const rec = r as Record<string, unknown>;
      const title = String(rec.title || "").trim();
      if (!title) { skipped++; continue; }
      const dd = typeof rec.deadline_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.deadline_date) ? rec.deadline_date : null;
      if (titles.has(`${title}||${dd}`)) { skipped++; continue; }
      const today = todayString(settings.timezone);
      const { priority } = calculatePriority(dd, today, settings.timezone);
      const t = nowISO();
      fresh.push({
        id: uid("task"), user_id: user.id, title: title.slice(0, 200),
        description: String(rec.description || ""), category_id: null, project_id: null, source_note_id: null, subcategory: null,
        deadline_date: dd, deadline_time: null, start_date: null,
        status: "todo", priority, tags: [], estimated_minutes: null, actual_minutes: null,
        recurrence: null, notes_text: null, archived: false, trashed_at: null,
        completed_at: null, is_today_focus: false, created_at: t, updated_at: t
      });
      ok++;
    }
    if (fresh.length) setTasks((p) => [...fresh, ...p]);
    return { ok, skipped };
  }, [user, tasks, settings.timezone]);

  const openQuickAdd = useCallback((d?: Partial<TaskFormValues>) => {
    setQuickAddDefaults(d || null);
    setQuickAddOpen(true);
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value: Store = {
    ready, cloudMode, user, authLoading, settings, notifPrefs, categories, tasks, subtasks, notes,
    projects, smartNotes, savedLinks, focusSessions,
    notifications, unreadCount, toasts, todayStr,
    quickAddOpen, setQuickAddOpen, quickAddDefaults, openQuickAdd,
    detailTaskId, setDetailTaskId, globalSearch, setGlobalSearch, paletteOpen, setPaletteOpen,
    pushToast, dismissToast,
    signIn, signUp, signInWithGoogle, signOut,
    updateSettings, updateNotifPrefs, markNotifRead, markAllNotifRead, requestBrowserPermission,
    createTask, updateTask, toggleComplete, deleteTask, restoreTask, duplicateTask,
    createCategory, updateCategory, deleteCategory, reorderCategories,
    addSubtask, toggleSubtask, deleteSubtask, addNote, deleteNote,
    createProject, updateProject, deleteProject,
    createSmartNote, updateSmartNote, deleteSmartNote, convertNoteToTask,
    createSavedLink, updateSavedLink, deleteSavedLink,
    recordFocusSession,
    exportJSON, importTasks
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function nextDeadlineForRecurrence(base: string, rec: NonNullable<Task["recurrence"]>): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (rec.freq === "daily") dt.setUTCDate(dt.getUTCDate() + rec.interval);
  else if (rec.freq === "weekly") dt.setUTCDate(dt.getUTCDate() + 7 * rec.interval);
  else dt.setUTCMonth(dt.getUTCMonth() + rec.interval);
  const mm = `${dt.getUTCMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getUTCDate()}`.padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export function useSortedTasks(filter?: (t: Task) => boolean): Task[] {
  const { tasks } = useStore();
  return useMemo(() => tasks.filter((t) => !t.trashed_at && !t.archived).filter(filter || (() => true)).sort(compareByUrgency), [tasks, filter]);
}
