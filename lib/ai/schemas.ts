import { z } from "zod";
import type { InboxExtraction } from "./types";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const tagList = z.array(z.string().trim().min(1).max(30)).max(10).default([]);

export const extractedTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  deadline_date: dateString.nullable().default(null),
  deadline_time: timeString.nullable().default(null),
  deadline_source_text: z.string().max(240).nullable().default(null),
  deadline_confidence: z.enum(["high", "medium", "low", "none"]).default("none"),
  priority_hint: z.enum(["critical", "high", "normal"]).default("normal"),
  category_hint: z.string().max(60).nullable().default(null),
  project_hint: z.string().max(120).nullable().default(null),
  tags: tagList,
  estimated_minutes: z.number().int().min(1).max(10080).nullable().default(null)
});

export const extractedNoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(20000).default(""),
  note_type: z.enum(["general", "meeting", "idea", "research", "journal", "reference"]).default("general"),
  tags: tagList
});

export const extractedConnectionSchema = z.object({
  target_type: z.enum(["note", "task", "link"]),
  target_id: z.string().min(1).max(240),
  reason: z.string().max(500).default(""),
  confidence: z.number().min(0).max(1).default(0.5)
});

export const extractionSchema = z.object({
  language: z.string().max(20).default("en"),
  summary: z.string().max(2000).default(""),
  suggested_title: z.string().trim().max(200).default(""),
  ocr_text: z.string().max(20000).default(""),
  tasks: z.array(extractedTaskSchema).max(30).default([]),
  notes: z.array(extractedNoteSchema).max(10).default([]),
  key_facts: z.array(z.string().max(500)).max(20).default([]),
  people: z.array(z.string().max(120)).max(20).default([]),
  connections: z.array(extractedConnectionSchema).max(20).default([]),
  warnings: z.array(z.string().max(500)).max(10).default([])
});

const citationSchema = z.object({
  type: z.enum(["task", "note", "link", "inbox", "memory"]),
  id: z.string().min(1),
  title: z.string().min(1).max(240),
  excerpt: z.string().max(1000).optional()
});

const createTaskAction = z.object({
  type: z.literal("create_task"),
  label: z.string().min(1).max(120),
  payload: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).optional(),
    deadline_date: dateString.nullable().optional(),
    deadline_time: timeString.nullable().optional(),
    category_hint: z.string().max(60).nullable().optional(),
    project_hint: z.string().max(120).nullable().optional(),
    tags: z.array(z.string().max(30)).max(20).optional(),
    estimated_minutes: z.number().int().min(0).max(10080).nullable().optional()
  })
});

const createNoteAction = z.object({
  type: z.literal("create_note"),
  label: z.string().min(1).max(120),
  payload: z.object({
    title: z.string().trim().min(1).max(200),
    content: z.string().max(20000),
    note_type: z.enum(["general", "meeting", "idea", "research", "journal", "reference"]).optional(),
    tags: z.array(z.string().max(30)).max(20).optional()
  })
});

const updateTaskAction = z.object({
  type: z.literal("update_task"),
  label: z.string().min(1).max(120),
  payload: z.object({
    task_id: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(["todo", "in_progress", "on_hold", "completed", "cancelled"]).optional(),
    deadline_date: dateString.nullable().optional(),
    deadline_time: timeString.nullable().optional()
  })
});

export const assistantActionSchema = z.discriminatedUnion("type", [
  createTaskAction,
  createNoteAction,
  updateTaskAction
]);

export const assistantReplySchema = z.object({
  answer: z.string().min(1).max(12000),
  citations: z.array(citationSchema).max(20).default([]),
  suggested_actions: z.array(assistantActionSchema).max(8).default([]),
  language: z.string().max(20).default("en")
});

export const taskBreakdownSchema = z.object({
  subtasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        estimated_minutes: z.number().int().min(1).max(10080).nullable().default(null),
        rationale: z.string().max(500).default("")
      })
    )
    .min(1)
    .max(15),
  note: z.string().max(1000).default("")
});

export const relationshipsSchema = z.object({
  connections: z
    .array(
      z.object({
        target_type: z.enum(["note", "task", "link"]),
        target_id: z.string().min(1),
        relationship: z.string().max(80).default("related"),
        reason: z.string().max(500).default(""),
        confidence: z.number().min(0).max(1).default(0.5)
      })
    )
    .max(20)
    .default([])
});

export type ExtractionOutput = z.output<typeof extractionSchema>;
export type AssistantReplyOutput = z.output<typeof assistantReplySchema>;
export type TaskBreakdownOutput = z.output<typeof taskBreakdownSchema>;
export type RelationshipsOutput = z.output<typeof relationshipsSchema>;

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function hasSource(text: string, source: string | null): boolean {
  if (!source) return false;
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedSource = source.toLowerCase().replace(/\s+/g, " ").trim();
  return normalizedSource.length >= 3 && normalizedText.includes(normalizedSource);
}

/**
 * Removes deadlines the model cannot tie to an exact source phrase. This is a
 * hard guard against invented dates, while still letting the review UI edit a
 * date manually.
 */
export function sanitizeExtraction(raw: unknown, originalText: string): InboxExtraction {
  const parsed = extractionSchema.parse(raw);
  const verificationText = originalText.trim() || parsed.ocr_text;
  const tasks = parsed.tasks.map((task) => {
    const validDate = task.deadline_date && isRealDate(task.deadline_date);
    const sourced = hasSource(verificationText, task.deadline_source_text);
    const keepDeadline = Boolean(validDate && sourced && task.deadline_confidence !== "none");
    return {
      ...task,
      deadline_date: keepDeadline ? task.deadline_date : null,
      deadline_time: keepDeadline ? task.deadline_time : null,
      deadline_source_text: keepDeadline ? task.deadline_source_text : null,
      deadline_confidence: keepDeadline ? task.deadline_confidence : ("none" as const),
      priority_hint: "normal" as const
    };
  });

  const warnings = [...parsed.warnings];
  if (parsed.tasks.some((t, i) => t.deadline_date && !tasks[i].deadline_date)) {
    warnings.push("A proposed deadline was removed because it could not be tied to explicit wording in the source.");
  }

  return {
    ...parsed,
    suggested_title: parsed.suggested_title.trim() || "Untitled capture",
    tasks,
    warnings: warnings.slice(0, 10)
  };
}
