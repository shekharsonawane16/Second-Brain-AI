// ── TaskFlow shared types ─────────────────────────────────────

export type Priority = "critical" | "high" | "normal";
export type TaskStatus = "todo" | "in_progress" | "completed" | "on_hold" | "cancelled";
export type ThemeMode = "dark" | "light" | "system";
export type RecurrenceFreq = "daily" | "weekly" | "monthly";
export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type NoteType = "general" | "meeting" | "idea" | "research" | "journal" | "reference";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string; // lucide icon name key
  color: string; // hex accent
  sort_order: number;
  archived: boolean;
  created_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  sort_order: number;
}

export interface TaskNote {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
}

export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number; // every N days/weeks/months
  next_run?: string | null; // yyyy-MM-dd
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category_id: string | null;
  color: string;
  status: ProjectStatus;
  start_date: string | null;
  target_date: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Long-form knowledge note. Kept separate from task_notes. */
export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  note_type: NoteType;
  category_id: string | null;
  project_id: string | null;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  archived: boolean;
  linked_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedLink {
  id: string;
  user_id: string;
  url: string;
  title: string;
  description: string;
  category_id: string | null;
  project_id: string | null;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface FocusSession {
  id: string;
  user_id: string;
  task_id: string | null;
  project_id: string | null;
  duration_seconds: number;
  planned_seconds: number;
  completed: boolean;
  started_at: string;
  ended_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category_id: string | null;
  project_id: string | null;
  source_note_id: string | null;
  subcategory: string | null;
  /** yyyy-MM-dd in the user's timezone, or null */
  deadline_date: string | null;
  /** HH:mm 24h, optional */
  deadline_time: string | null;
  start_date: string | null;
  status: TaskStatus;
  priority: Priority;
  tags: string[];
  estimated_minutes: number | null;
  actual_minutes: number | null;
  recurrence: Recurrence | null;
  notes_text: string | null;
  archived: boolean;
  trashed_at: string | null;
  completed_at: string | null;
  is_today_focus: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPrefs {
  enabled: boolean;
  days_before: number[]; // e.g. [0,1,3,7]
  daily_summary: boolean;
  overdue_alerts: boolean;
  permission: NotificationPermission | "unknown";
  push_enabled: boolean;
  push_slots: string[]; // local times "HH:mm", e.g. ["06:00","12:00","18:00"]
}

export interface NotificationItem {
  id: string;
  task_id: string | null;
  kind: "overdue" | "due_soon" | "daily_summary" | "info";
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface UserSettings {
  display_name: string;
  timezone: string;
  theme: ThemeMode;
  date_format: "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd";
  week_start: 0 | 1; // 0 Sunday, 1 Monday
  default_sort: "priority" | "deadline" | "created" | "updated" | "alpha";
  default_view: "list" | "compact";
  daily_focus_limit: number;
  reminder_days_before: number[];
  ai_language: "en" | "hi" | "mr";
  ai_auto_index: boolean;
}

export interface DemoUser {
  id: string;
  email: string;
  display_name: string;
}

export const DEFAULT_CATEGORIES: Array<Pick<Category, "name" | "icon" | "color">> = [
  { name: "Home", icon: "home", color: "#6366F1" },
  { name: "College", icon: "graduation-cap", color: "#8B5CF6" },
  { name: "Company", icon: "briefcase", color: "#3B82F6" },
  { name: "Projects", icon: "folder-kanban", color: "#06B6D4" },
  { name: "Learning", icon: "book-open", color: "#10B981" },
  { name: "Personal", icon: "user", color: "#F59E0B" },
  { name: "Finance", icon: "wallet", color: "#22C55E" },
  { name: "Health & Fitness", icon: "heart-pulse", color: "#EF4444" }
];
