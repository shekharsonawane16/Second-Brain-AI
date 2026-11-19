import { NextRequest, NextResponse } from "next/server";
import { downloadStorageFile, extractUploadedFile, sanitizeFilename } from "@/lib/ai/files";
import { ocrImage } from "@/lib/ai/ocr";
import { AiRequestError } from "@/lib/ai/provider";
import { aiErrorResponse, enforceRateLimit, logAiUsage, requireAiUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;

  try {
    await enforceRateLimit(sb, user.id);
  } catch (error) {
    return aiErrorResponse(error);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const path = String(body.storage_path || "");
  const filename = sanitizeFilename(String(body.filename || body.original_name || "upload"));
  const mimeType = String(body.mime_type || "application/octet-stream");

  if (!path.startsWith(`${user.id}/`) || path.includes("..")) {
    return NextResponse.json({ ok: false, error: "Invalid upload path." }, { status: 400 });
  }

  try {
    const buffer = await downloadStorageFile(sb, path);
    const extracted = await extractUploadedFile(buffer, filename, mimeType);
    let text = extracted.text.trim();
    if (!text && extracted.dataUrl) {
      text = (await ocrImage(extracted.dataUrl)).trim();
    }
    if (!text) {
      throw new AiRequestError(
        "No readable text was found in this file. Try a clearer scan or upload the pages as images.",
        400,
        "AI_NO_READABLE_TEXT"
      );
    }
    await logAiUsage(sb, user.id, "assistant_extract", null, "success");
    return NextResponse.json({ ok: true, text: text.slice(0, 80_000), filename });
  } catch (error) {
    await logAiUsage(sb, user.id, "assistant_extract", null, "error", error instanceof Error ? error.message : "failed");
    return aiErrorResponse(error);
  } finally {
    await sb.storage.from("ai-inbox").remove([path]);
  }
}
