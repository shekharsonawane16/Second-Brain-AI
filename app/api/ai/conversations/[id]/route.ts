import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, requireAiUser } from "@/lib/ai/server";
import { nowISO } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;
  const { data: conversation, error: convError } = await sb
    .from("ai_conversations")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (convError) return NextResponse.json({ ok: false, error: convError.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });
  const { data: messages, error } = await sb
    .from("ai_messages")
    .select("id, conversation_id, role, content, actions, citations, created_at")
    .eq("conversation_id", params.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, conversation, messages: messages || [] });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "Title is required." }, { status: 400 });
  const { data, error } = await auth.ctx.sb
    .from("ai_conversations")
    .update({ title: title.slice(0, 120), updated_at: nowISO() })
    .eq("id", params.id)
    .eq("user_id", auth.ctx.user.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ ok: true, conversation: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { error } = await auth.ctx.sb
    .from("ai_conversations")
    .delete()
    .eq("id", params.id)
    .eq("user_id", auth.ctx.user.id);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration." }, { status: 503 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
