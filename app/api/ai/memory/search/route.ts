import { NextRequest, NextResponse } from "next/server";
import { semanticSearch } from "@/lib/ai/memory";
import { aiErrorResponse, enforceRateLimit, logAiUsage, requireAiUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const query = String(body.query || "").trim();
  if (!query) return NextResponse.json({ ok: false, error: "Enter a search question." }, { status: 400 });
  const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 20);

  try {
    await enforceRateLimit(auth.ctx.sb, auth.ctx.user.id);
    const result = await semanticSearch(auth.ctx.sb, auth.ctx.user.id, query, limit);
    await logAiUsage(auth.ctx.sb, auth.ctx.user.id, "memory_search", result.meta, "success");
    return NextResponse.json({ ok: true, matches: result.matches, note: result.matches.length ? null : "No matching memories found." });
  } catch (error) {
    await logAiUsage(auth.ctx.sb, auth.ctx.user.id, "memory_search", null, "error", error instanceof Error ? error.message : "failed");
    return aiErrorResponse(error);
  }
}
