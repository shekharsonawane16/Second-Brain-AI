import { NextRequest, NextResponse } from "next/server";
import { requireAiUser, isMissingTable } from "@/lib/ai/server";
import { getAiConfig } from "@/lib/ai/config";
import { isAllowedUpload, sanitizeFilename, sourceTypeForFile } from "@/lib/ai/files";
import { inferMimeType } from "@/lib/ai/mime";
import type { InboxSourceType } from "@/lib/ai/types";
import { nowISO, uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_TYPES = new Set(["text", "url", "pdf", "image", "document", "audio", "meeting"]);

function titleFromText(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return (line || "Pasted note").slice(0, 160);
}

export async function GET(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const status = req.nextUrl.searchParams.get("status");
  let query = auth.ctx.sb
    .from("ai_inbox_items")
    .select("*")
    .eq("user_id", auth.ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status && ["queued", "processing", "needs_review", "approved", "failed", "archived"].includes(status)) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration to enable the inbox.", code: "AI_TABLES_MISSING" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;
  const cfg = getAiConfig();
  const id = uid("inbox");
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  try {
    let row: Record<string, unknown>;
    let storagePath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });
      }
      if (file.size > cfg.maxUploadBytes) {
        return NextResponse.json({ ok: false, error: `File too large. Maximum is ${Math.round(cfg.maxUploadBytes / 1024 / 1024)} MB.` }, { status: 400 });
      }
      const filename = sanitizeFilename(file.name || "upload");
      const mime = inferMimeType(filename, file.type);
      if (!isAllowedUpload(mime, filename)) {
        return NextResponse.json({ ok: false, error: "Unsupported file type. Use PDF, DOCX, text, image or audio." }, { status: 400 });
      }
      const requestedType = String(form.get("sourceType") || "");
      const sourceType: InboxSourceType =
        requestedType === "meeting" && mime.startsWith("audio/") ? "meeting" : sourceTypeForFile(filename, mime);
      const title = String(form.get("title") || "").trim().slice(0, 160) || filename;
      storagePath = `${user.id}/${id}/${filename}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await sb.storage.from("ai-inbox").upload(storagePath, buffer, {
        contentType: mime,
        upsert: false
      });
      if (uploadError) {
        const message = /bucket not found/i.test(uploadError.message)
          ? "The ai-inbox storage bucket is missing. Run the Prompt 3 migration."
          : uploadError.message;
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
      }
      row = {
        id,
        user_id: user.id,
        title,
        source_type: sourceType,
        original_name: filename,
        mime_type: mime,
        size_bytes: file.size,
        storage_path: storagePath,
        source_url: null,
        original_text: "",
        status: "queued",
        language: "en",
        summary: "",
        extracted: null,
        error: null,
        created_at: nowISO(),
        updated_at: nowISO(),
        processed_at: null
      };
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const type = String(body.type || "text");
      const language = ["en", "hi", "mr"].includes(String(body.language)) ? String(body.language) : "en";
      const isDirectUpload = type === "upload";
      if (!SOURCE_TYPES.has(type) && !isDirectUpload) {
        return NextResponse.json({ ok: false, error: "Unknown source type." }, { status: 400 });
      }
      if (isDirectUpload) {
        const path = String(body.storage_path || "");
        if (!path.startsWith(`${user.id}/`) || path.includes("..")) {
          return NextResponse.json({ ok: false, error: "Invalid upload path." }, { status: 400 });
        }
        const originalName = sanitizeFilename(String(body.original_name || "upload"));
        const mime = inferMimeType(originalName, String(body.mime_type || "application/octet-stream"));
        if (!isAllowedUpload(mime, originalName)) {
          return NextResponse.json({ ok: false, error: "Unsupported file type." }, { status: 400 });
        }
        const sourceType = SOURCE_TYPES.has(String(body.source_type))
          ? String(body.source_type)
          : sourceTypeForFile(originalName, mime);
        storagePath = path;
        row = {
          id,
          user_id: user.id,
          title: String(body.title || originalName).trim().slice(0, 160) || originalName,
          source_type: sourceType,
          original_name: originalName,
          mime_type: mime,
          size_bytes: Number(body.size_bytes) || null,
          storage_path: path,
          source_url: null,
          original_text: "",
          status: "queued",
          language,
          summary: "",
          extracted: null,
          error: null,
          created_at: nowISO(),
          updated_at: nowISO(),
          processed_at: null
        };
      } else if (type === "url") {
        const rawUrl = String(body.url || "").trim();
        let parsed: URL;
        try {
          parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
        } catch {
          return NextResponse.json({ ok: false, error: "Enter a valid URL." }, { status: 400 });
        }
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return NextResponse.json({ ok: false, error: "Only http(s) URLs are supported." }, { status: 400 });
        }
        row = {
          id,
          user_id: user.id,
          title: String(body.title || parsed.hostname.replace(/^www\./, "")).trim().slice(0, 160) || "Imported page",
          source_type: "url",
          original_name: null,
          mime_type: null,
          size_bytes: null,
          storage_path: null,
          source_url: parsed.toString(),
          original_text: "",
          status: "queued",
          language,
          summary: "",
          extracted: null,
          error: null,
          created_at: nowISO(),
          updated_at: nowISO(),
          processed_at: null
        };
      } else {
        const text = String(body.text || "").trim();
        if (!text) return NextResponse.json({ ok: false, error: "Paste some text first." }, { status: 400 });
        if (text.length > 80_000) return NextResponse.json({ ok: false, error: "That text is too long (80,000 character maximum)." }, { status: 400 });
        row = {
          id,
          user_id: user.id,
          title: String(body.title || "").trim().slice(0, 160) || titleFromText(text),
          source_type: type === "meeting" ? "meeting" : "text",
          original_name: null,
          mime_type: "text/plain",
          size_bytes: Buffer.byteLength(text, "utf8"),
          storage_path: null,
          source_url: null,
          original_text: text,
          status: "queued",
          language,
          summary: "",
          extracted: null,
          error: null,
          created_at: nowISO(),
          updated_at: nowISO(),
          processed_at: null
        };
      }
    }

    const { data, error } = await sb.from("ai_inbox_items").insert(row).select("*").single();
    if (error) {
      if (storagePath) await sb.storage.from("ai-inbox").remove([storagePath]);
      if (isMissingTable(error)) {
        return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration to enable the inbox.", code: "AI_TABLES_MISSING" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, item: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not add that capture." },
      { status: 500 }
    );
  }
}
