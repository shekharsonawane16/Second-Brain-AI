import { NextRequest, NextResponse } from "next/server";
import { aiStatus } from "@/lib/ai/config";
import { requireAiUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: true, status: aiStatus() });
}
