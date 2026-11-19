import { NextRequest, NextResponse } from "next/server";
import { indexMemory } from "@/lib/ai/memory";
import { aiErrorResponse, enforceRateLimit, isMissingTable, logAiUsage, requireAiUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = new Set(["note", "task", "inbox", "document", "link", "conversation", "fact"]);

export async function GET(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 100, 1), 200);
  const { data, error } = await auth.ctx.sb
    .from("ai_memories")
    .select("id, kind, source_id, title, content, metadata, created_at, updated_at")
    .eq("user_id", auth.ctx.user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration to enable memory.", code: "AI_TABLES_MISSING" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, memories: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind || "note");
  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();
  const sourceId = body.source_id ? String(body.source_id) : null;
  if (!KINDS.has(kind)) return NextResponse.json({ ok: false, error: "Unknown memory kind." }, { status: 400 });
  if (!content) return NextResponse.json({ ok: false, error: "There is nothing to remember yet." }, { status: 400 });
  if (content.length > 100_000) return NextResponse.json({ ok: false, error: "That content is too long to remember (100,000 character maximum)." }, { status: 400 });

  try {
    await enforceRateLimit(sb, user.id);
    const indexed = await indexMemory(sb, user.id, {
      kind: kind as "note" | "task" | "inbox" | "document" | "link" | "conversation" | "fact",
      source_id: sourceId,
      title: title || "Untitled memory",
      content,
      metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : {}
    });
    await logAiUsage(sb, user.id, "memory_index", indexed.meta, "success");
    return NextResponse.json({ ok: true, memory_id: indexed.memoryId, chunks: indexed.chunks }, { status: 201 });
  } catch (error) {
    await logAiUsage(sb, user.id, "memory_index", null, "error", error instanceof Error ? error.message : "failed");
    if (isMissingTable(error as { code?: string; message?: string })) {
      return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration to enable memory.", code: "AI_TABLES_MISSING" }, { status: 503 });
    }
    return aiErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Missing memory id." }, { status: 400 });
  const { error } = await auth.ctx.sb
    .from("ai_memories")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.ctx.user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
