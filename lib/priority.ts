// ── TaskFlow Automatic Priority Engine ────────────────────────
// Single source of truth for deadline → priority. Used by dashboard,
// lists, search, calendar, analytics and notifications.
//
// Rules (calendar days, user's local date in their timezone):
//   overdue (<0)            → critical
//   due today (0)            → critical
//   1–4 days remaining       → critical
//   5–10 days remaining      → high
//   >10 days remaining       → normal
//   no deadline              → normal

import type { Priority, Task } from "./types";

/** yyyy-MM-dd for "today" in the given IANA timezone. */
export function todayString(timezone?: string): string {
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    // en-CA yields yyyy-MM-dd
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch {
    const d = new Date();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
}

/** Parse yyyy-MM-dd as UTC-midnight ms (calendar-day safe). */
export function parseDay(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Calendar-day difference: deadline − today. Null when no deadline. */
export function daysRemaining(deadline: string | null | undefined, today?: string, timezone?: string): number | null {
  if (!deadline) return null;
  const t = today ?? todayString(timezone);
  return Math.round((parseDay(deadline) - parseDay(t)) / 86400000);
}

export function priorityForDays(days: number | null): Priority {
  if (days === null || days === undefined) return "normal";
  if (days <= 4) return "critical"; // covers overdue, today, 1–4
  if (days <= 10) return "high";
  return "normal";
}

export interface PriorityResult {
  priority: Priority;
  daysRemaining: number | null;
  overdue: boolean;
  label: string;
}

export function calculatePriority(
  deadline: string | null | undefined,
  today?: string,
  timezone?: string
): PriorityResult {
  const days = daysRemaining(deadline, today, timezone);
  const priority = priorityForDays(days);
  const overdue = days !== null && days < 0;
  return { priority, daysRemaining: days, overdue, label: deadlineLabel(days) };
}

export function deadlineLabel(days: number | null): string {
  if (days === null || days === undefined) return "No deadline";
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "Overdue by 1 day" : `Overdue by ${n} days`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/** Recompute priority for a task object (pure). */
export function withRecalculatedPriority<T extends Pick<Task, "deadline_date" | "priority">>(
  task: T,
  today?: string,
  timezone?: string
): T {
  const { priority } = calculatePriority(task.deadline_date, today, timezone);
  if (task.priority === priority) return task;
  return { ...task, priority };
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2 };

/**
 * Urgency sort: overdue+critical first, then high, then normal.
 * Within same priority → earliest deadline → oldest created.
 */
export function compareByUrgency(
  a: Pick<Task, "priority" | "deadline_date" | "created_at" | "status"> & { __days?: number | null },
  b: Pick<Task, "priority" | "deadline_date" | "created_at" | "status"> & { __days?: number | null }
): number {
  const aDone = a.status === "completed" ? 1 : 0;
  const bDone = b.status === "completed" ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr !== 0) return pr;
  const ad = a.deadline_date ?? "9999-12-31";
  const bd = b.deadline_date ?? "9999-12-31";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.created_at < b.created_at ? -1 : 1;
}

/** Is the task's calendar day now overdue relative to today? */
export function isOverdue(deadline: string | null | undefined, today?: string, timezone?: string): boolean {
  const d = daysRemaining(deadline, today, timezone);
  return d !== null && d < 0;
}
