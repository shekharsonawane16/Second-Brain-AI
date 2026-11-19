import { NextRequest, NextResponse } from "next/server";
import { defaultLanguage } from "@/lib/ai/config";
import { analyzeSource, type KnownItem } from "@/lib/ai/extraction";
import { downloadStorageFile, extractUploadedFile, fetchUrlText } from "@/lib/ai/files";
import {
  aiErrorResponse,
  enforceRateLimit,
  isMissingTable,
  logAiUsage,
  requireAiUser
} from "@/lib/ai/server";
import type { AiMeta } from "@/lib/ai/provider";
import { nowISO, uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return "Asia/Kolkata";
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;

  const { data: item, error: readError } = await sb
    .from("ai_inbox_items")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) {
    if (isMissingTable(readError)) {
      return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration.", code: "AI_TABLES_MISSING" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }
  if (!item) return NextResponse.json({ ok: false, error: "Capture not found." }, { status: 404 });
  if (item.status === "processing") {
    return NextResponse.json({ ok: false, error: "This capture is already being processed." }, { status: 409 });
  }

  try {
    await enforceRateLimit(sb, user.id);
  } catch (error) {
    return aiErrorResponse(error);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const timezone = validTimezone(String(body.timezone || "Asia/Kolkata"));
  const outputLanguage = ["en", "hi", "mr"].includes(String(body.language))
    ? String(body.language)
    : defaultLanguage();
  const jobId = uid("aijob");
  let stage = "starting";
  let meta: AiMeta | null = null;

  const setStage = async (next: string) => {
    stage = next;
    await sb.from("ai_processing_jobs").update({ stage: next }).eq("id", jobId).eq("user_id", user.id);
  };

  const { error: jobError } = await sb.from("ai_processing_jobs").insert({
    id: jobId,
    user_id: user.id,
    inbox_item_id: item.id,
    status: "running",
    stage,
    attempts: 1,
    started_at: nowISO(),
    created_at: nowISO()
  });
  if (jobError) return aiErrorResponse(jobError);

  await sb
    .from("ai_inbox_items")
    .update({ status: "processing", error: null, updated_at: nowISO() })
    .eq("id", item.id)
    .eq("user_id", user.id);

  try {
    await setStage("fetching");
    let text = String(item.original_text || "");
    let sourceTitle = String(item.title || "Untitled capture");
    let sourceUrl: string | null = item.source_url || null;
    let imageDataUrl: string | undefined;

    if (item.storage_path) {
      await setStage("reading");
      const buffer = await downloadStorageFile(sb, item.storage_path as string);
      const extracted = await extractUploadedFile(
        buffer,
        String(item.original_name || "upload"),
        String(item.mime_type || "application/octet-stream")
      );
      text = extracted.text;
      imageDataUrl = extracted.dataUrl;
    } else if (item.source_url) {
      const fetched = await fetchUrlText(String(item.source_url));
      text = fetched.text;
      sourceUrl = fetched.url;
      if (fetched.title) {
        sourceTitle = fetched.title.slice(0, 200);
        const current = String(item.title || "");
        if (!current || current === "Imported page" || current === new URL(String(item.source_url)).hostname.replace(/^www\./, "")) {
          await sb.from("ai_inbox_items").update({ title: sourceTitle }).eq("id", item.id).eq("user_id", user.id);
        }
      }
    }

    if (!text.trim() && !imageDataUrl) {
      throw new Error("No readable text was found in this capture.");
    }

    await setStage("extracting");
    const [noteRows, taskRows, linkRows] = await Promise.all([
      sb.from("notes").select("id, title").eq("user_id", user.id).eq("archived", false).order("updated_at", { ascending: false }).limit(50),
      sb.from("tasks").select("id, title").eq("user_id", user.id).is("trashed_at", null).eq("archived", false).order("updated_at", { ascending: false }).limit(50),
      sb.from("saved_links").select("id, title").eq("user_id", user.id).eq("archived", false).order("created_at", { ascending: false }).limit(40)
    ]);
    const known: KnownItem[] = [
      ...((noteRows.data || []) as Array<{ id: string; title: string }>).map((row) => ({ type: "note" as const, id: row.id, title: row.title })),
      ...((taskRows.data || []) as Array<{ id: string; title: string }>).map((row) => ({ type: "task" as const, id: row.id, title: row.title })),
      ...((linkRows.data || []) as Array<{ id: string; title: string }>).map((row) => ({ type: "link" as const, id: row.id, title: row.title }))
    ];

    const analyzed = await analyzeSource({
      title: sourceTitle,
      text: text || sourceTitle,
      sourceType: String(item.source_type || "text"),
      sourceUrl,
      outputLanguage,
      timezone,
      known,
      imageDataUrl
    });
    meta = analyzed.meta;
    const extraction = analyzed.extraction;

    await setStage("validating");
    const now = nowISO();
    const { data: updated, error: updateError } = await sb
      .from("ai_inbox_items")
      .update({
        original_text: (text || extraction.ocr_text || "").slice(0, 80_000),
        summary: extraction.summary,
        language: extraction.language,
        extracted: extraction,
        status: "needs_review",
        error: null,
        updated_at: now,
        processed_at: now
      })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    await setStage("connections");
    await sb
      .from("ai_relationships")
      .delete()
      .eq("user_id", user.id)
      .eq("source_type", "inbox")
      .eq("source_id", item.id)
      .eq("status", "suggested");
    if (extraction.connections.length) {
      const rows = extraction.connections.map((connection) => ({
        id: uid("relation"),
        user_id: user.id,
        source_type: "inbox",
        source_id: item.id,
        target_type: connection.target_type,
        target_id: connection.target_id,
        relationship: "related",
        reason: connection.reason,
        confidence: connection.confidence,
        status: "suggested",
        created_at: now,
        updated_at: now
      }));
      const { error: relationError } = await sb
        .from("ai_relationships")
        .upsert(rows, { onConflict: "user_id,source_type,source_id,target_type,target_id", ignoreDuplicates: true });
      if (relationError) console.warn("[ai] could not save suggested connections", relationError.message);
    }

    await sb
      .from("ai_processing_jobs")
      .update({ status: "completed", stage: "completed", completed_at: nowISO() })
      .eq("id", jobId)
      .eq("user_id", user.id);
    await logAiUsage(sb, user.id, "inbox_extract", meta, "success");

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed.";
    await sb
      .from("ai_inbox_items")
      .update({ status: "failed", error: message.slice(0, 2000), updated_at: nowISO() })
      .eq("id", item.id)
      .eq("user_id", user.id);
    await sb
      .from("ai_processing_jobs")
      .update({ status: "failed", stage, error: message.slice(0, 2000), completed_at: nowISO() })
      .eq("id", jobId)
      .eq("user_id", user.id);
    await logAiUsage(sb, user.id, "inbox_extract", meta, "error", message);
    return aiErrorResponse(error);
  }
}
