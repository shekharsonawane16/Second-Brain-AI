import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional().default(""),
  category_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  subcategory: z.string().max(80).nullable().optional(),
  deadline_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd")
    .nullable()
    .optional(),
  deadline_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm")
    .nullable()
    .optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["todo", "in_progress", "completed", "on_hold", "cancelled"]).default("todo"),
  tags: z.array(z.string().max(30)).max(20).default([]),
  estimated_minutes: z.number().int().min(0).max(100000).nullable().optional(),
  actual_minutes: z.number().int().min(0).max(100000).nullable().optional(),
  notes_text: z.string().max(10000).nullable().optional(),
  is_today_focus: z.boolean().default(false)
});

export type TaskFormValues = z.infer<typeof taskSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  icon: z.string().max(40).default("folder"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a color").default("#6366F1")
});

export type CategoryFormValues = z.infer<typeof categorySchema>;

export function parseTagsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}
