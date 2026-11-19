import { NextRequest, NextResponse } from "next/server";
import { defaultLanguage } from "@/lib/ai/config";
import { chatJson } from "@/lib/ai/provider";
import { taskBreakdownSchema } from "@/lib/ai/schemas";
import { aiErrorResponse, enforceRateLimit, isMissingTable, logAiUsage, requireAiUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LANGUAGE_NAMES: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi" };

export async function POST(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const taskId = String(body.task_id || "");
  if (!taskId) return NextResponse.json({ ok: false, error: "Task id is required." }, { status: 400 });

  const { data: task, error: taskError } = await sb
    .from("tasks")
    .select("id, title, description, deadline_date, estimated_minutes, status, tags, priority")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (taskError) {
    if (isMissingTable(taskError)) return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
    return NextResponse.json({ ok: false, error: taskError.message }, { status: 500 });
  }
  if (!task) return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });

  const language = ["en", "hi", "mr"].includes(String(body.language)) ? String(body.language) : defaultLanguage();
  const timezone = String(body.timezone || "Asia/Kolkata");
  const prompt = `Break the following task into a practical checklist.

TASK
Title: ${task.title}
Description: ${task.description || "(none)"}
Deadline: ${task.deadline_date || "(none)"}
Estimated minutes: ${task.estimated_minutes ?? "(not set)"}
Current status: ${task.status}
Priority: ${task.priority} (do not change it)

RULES
- Produce 3 to 10 independently actionable subtasks in a sensible order.
- Do not invent facts, files, people, requirements or deadlines.
- Do not repeat the parent task as a subtask.
- Keep titles short and concrete. Estimates are suggestions only.
- Respond in ${LANGUAGE_NAMES[language] || "English"}.
- Return ONE JSON object: {"subtasks":[{"title":"...","estimated_minutes":15,"rationale":"..."}],"note":"brief caveat or empty string"}`;

  try {
    await enforceRateLimit(sb, user.id);
    const result = await chatJson(
      {
        system: `You are a careful task-planning assistant inside Second Brain AI. You never execute actions and never invent deadlines. The user timezone is ${timezone}.`,
        user: prompt,
        temperature: 0.2,
        maxTokens: 1800
      },
      taskBreakdownSchema
    );
    await logAiUsage(sb, user.id, "task_breakdown", result.meta, "success");
    return NextResponse.json({ ok: true, breakdown: result.data, task_id: task.id });
  } catch (error) {
    await logAiUsage(sb, user.id, "task_breakdown", null, "error", error instanceof Error ? error.message : "failed");
    return aiErrorResponse(error);
  }
}
