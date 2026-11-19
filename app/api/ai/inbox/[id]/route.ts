import { NextRequest, NextResponse } from "next/server";
import { extractionSchema } from "@/lib/ai/schemas";
import { isMissingTable, requireAiUser } from "@/lib/ai/server";
import { nowISO } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.ctx.sb
    .from("ai_inbox_items")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", auth.ctx.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Capture not found." }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: nowISO() };

  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200) || "Untitled capture";
  if (typeof body.summary === "string") patch.summary = body.summary.slice(0, 2000);
  if (typeof body.language === "string") patch.language = body.language.slice(0, 20);
  if (body.extracted !== undefined) {
    const parsed = extractionSchema.safeParse(body.extracted);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "The reviewed extraction is invalid.", details: parsed.error.issues }, { status: 400 });
    }
    patch.extracted = parsed.data;
    if (!patch.summary) patch.summary = parsed.data.summary;
    if (!patch.title) patch.title = parsed.data.suggested_title;
  }
  if (typeof body.status === "string") {
    if (!["needs_review", "approved", "archived"].includes(body.status)) {
      return NextResponse.json({ ok: false, error: "That status cannot be set directly." }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === "approved") patch.processed_at = nowISO();
  }

  const { data, error } = await auth.ctx.sb
    .from("ai_inbox_items")
    .update(patch)
    .eq("id", params.id)
    .eq("user_id", auth.ctx.user.id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration.", code: "AI_TABLES_MISSING" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Capture not found." }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;
  const { data: existing } = await sb
    .from("ai_inbox_items")
    .select("storage_path")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const { error } = await sb.from("ai_inbox_items").delete().eq("id", params.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (existing?.storage_path) {
    await sb.storage.from("ai-inbox").remove([existing.storage_path as string]);
  }
  await sb.from("ai_memories").delete().eq("user_id", user.id).eq("kind", "inbox").eq("source_id", params.id);
  await sb.from("ai_relationships").delete().eq("user_id", user.id).eq("source_type", "inbox").eq("source_id", params.id);
  return NextResponse.json({ ok: true });
}
