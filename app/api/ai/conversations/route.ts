import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, requireAiUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.ctx.sb
    .from("ai_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", auth.ctx.user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration to use the assistant.", code: "AI_TABLES_MISSING" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, conversations: data || [] });
}
