import { NextRequest, NextResponse } from "next/server";
import { isMissingTable, requireAiUser } from "@/lib/ai/server";
import { nowISO } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RelationRow = {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship: string;
  reason: string;
  confidence: number | null;
  status: "suggested" | "accepted" | "rejected";
  created_at: string;
};

export async function GET(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;
  const status = req.nextUrl.searchParams.get("status") || "suggested";
  let query = sb
    .from("ai_relationships")
    .select("id, source_type, source_id, target_type, target_id, relationship, reason, confidence, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (["suggested", "accepted", "rejected"].includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration to enable connections.", code: "AI_TABLES_MISSING" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const relations = (data || []) as RelationRow[];
  const ids = [...new Set(relations.flatMap((r) => [r.source_id, r.target_id]))];
  const typeSet = new Set(relations.flatMap((r) => [r.source_type, r.target_type]));

  const [inbox, notes, tasks, links] = await Promise.all([
    typeSet.has("inbox")
      ? sb.from("ai_inbox_items").select("id, title").eq("user_id", user.id).in("id", ids)
      : Promise.resolve({ data: [] }),
    typeSet.has("note") ? sb.from("notes").select("id, title").eq("user_id", user.id).in("id", ids) : Promise.resolve({ data: [] }),
    typeSet.has("task") ? sb.from("tasks").select("id, title").eq("user_id", user.id).in("id", ids) : Promise.resolve({ data: [] }),
    typeSet.has("link") ? sb.from("saved_links").select("id, title, url").eq("user_id", user.id).in("id", ids) : Promise.resolve({ data: [] })
  ]);

  const titleMap = new Map<string, string>();
  const hrefMap = new Map<string, string>();
  for (const row of (inbox.data || []) as Array<{ id: string; title: string }>) {
    titleMap.set(`inbox:${row.id}`, row.title);
    hrefMap.set(`inbox:${row.id}`, `/inbox?item=${row.id}`);
  }
  for (const row of (notes.data || []) as Array<{ id: string; title: string }>) {
    titleMap.set(`note:${row.id}`, row.title);
    hrefMap.set(`note:${row.id}`, `/notes?open=${row.id}`);
  }
  for (const row of (tasks.data || []) as Array<{ id: string; title: string }>) {
    titleMap.set(`task:${row.id}`, row.title);
    hrefMap.set(`task:${row.id}`, "/all");
  }
  for (const row of (links.data || []) as Array<{ id: string; title: string; url: string }>) {
    titleMap.set(`link:${row.id}`, row.title);
    hrefMap.set(`link:${row.id}`, row.url);
  }

  return NextResponse.json({
    ok: true,
    relationships: relations.map((relation) => ({
      ...relation,
      source_title: titleMap.get(`${relation.source_type}:${relation.source_id}`) || "Unknown item",
      target_title: titleMap.get(`${relation.target_type}:${relation.target_id}`) || "Unknown item",
      target_href: hrefMap.get(`${relation.target_type}:${relation.target_id}`) || "#"
    }))
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!id || !["accepted", "rejected"].includes(status)) {
    return NextResponse.json({ ok: false, error: "Choose accept or reject for a connection." }, { status: 400 });
  }
  const { data, error } = await auth.ctx.sb
    .from("ai_relationships")
    .update({ status, updated_at: nowISO() })
    .eq("id", id)
    .eq("user_id", auth.ctx.user.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
  return NextResponse.json({ ok: true, relationship: data });
}
