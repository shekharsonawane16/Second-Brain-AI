import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiConfig } from "./config";
import { inferMimeType } from "./mime";
import { AiRequestError } from "./provider";
import type { InboxSourceType } from "./types";

export interface UploadedSource {
  kind: "text" | "image" | "audio";
  text: string;
  mimeType: string;
  filename: string;
  dataUrl?: string;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || "upload";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}

export function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg"
  };
  return map[mime] || "bin";
}

export function sourceTypeForFile(name: string, mimeType: string): InboxSourceType {
  const mime = inferMimeType(name, mimeType);
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (["doc", "docx", "txt", "md", "rtf"].includes(ext)) return "document";
  return "document";
}

export function isAllowedUpload(mimeType: string, name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  // Legacy .doc cannot be read safely; reject it before storing the file.
  if (ext === "doc") return false;
  const mime = inferMimeType(name, mimeType);
  return (
    mime === "application/pdf" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    ["pdf", "docx", "txt", "md", "png", "jpg", "jpeg", "webp", "gif", "mp3", "m4a", "wav", "webm", "ogg"].includes(ext)
  );
}

function decodeEntities(input: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const point = code.startsWith("#x") ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) return match;
      return String.fromCodePoint(point);
    }
    return entities[code.toLowerCase()] ?? match;
  });
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim());
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => decodeEntities(m));
  return {
    title,
    text: cleaned.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  };
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "metadata.google.internal", "metadata.google.com"].includes(lower)) return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal") || lower.endsWith(".localhost")) return true;
  const ipVersion = isIP(lower);
  if (ipVersion === 6) {
    return lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("::ffff:");
  }
  if (ipVersion === 4) return isPrivateIpv4(lower);
  return false;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AiRequestError("Enter a valid http(s) URL.", 400, "AI_BAD_URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new AiRequestError("Only http(s) URLs can be imported.", 400, "AI_BAD_URL");
  }
  if (url.username || url.password) throw new AiRequestError("URLs containing credentials are not allowed.", 400, "AI_BAD_URL");
  if (!url.hostname || isPrivateHost(url.hostname)) {
    throw new AiRequestError("Private and local network URLs cannot be imported.", 400, "AI_BLOCKED_URL");
  }
  try {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.some((entry) => isPrivateHost(entry.address))) {
      throw new AiRequestError("This URL resolves to a private network address.", 400, "AI_BLOCKED_URL");
    }
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    throw new AiRequestError("Could not resolve that URL.", 400, "AI_BAD_URL");
  }
  return url;
}

export async function fetchUrlText(raw: string): Promise<{ title: string; text: string; url: string }> {
  let current = await assertPublicUrl(raw);
  for (let redirects = 0; redirects < 4; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "SecondBrainAI/1.0 (+https://taskflow-one-bice.vercel.app)", accept: "text/html,text/plain,application/pdf" },
        cache: "no-store"
      });
    } catch {
      throw new AiRequestError("Could not download that URL.", 400, "AI_URL_FETCH");
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new AiRequestError("The URL redirected without a destination.", 400, "AI_URL_FETCH");
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new AiRequestError(`The URL returned HTTP ${response.status}.`, 400, "AI_URL_FETCH");
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!/text\/|application\/xhtml|application\/json/.test(contentType)) {
      throw new AiRequestError("Only public web pages and plain-text URLs can be imported.", 400, "AI_URL_TYPE");
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 5 * 1024 * 1024) throw new AiRequestError("That page is too large to import (5 MB max).", 400, "AI_URL_SIZE");
    const rawText = (await response.text()).slice(0, 5 * 1024 * 1024);
    const parsed = /html/.test(contentType)
      ? htmlToText(rawText)
      : { title: current.hostname.replace(/^www\./, ""), text: rawText.trim() };
    return { title: parsed.title || current.hostname.replace(/^www\./, ""), text: parsed.text.slice(0, 60_000), url: current.toString() };
  }
  throw new AiRequestError("Too many redirects while importing that URL.", 400, "AI_URL_FETCH");
}

export async function downloadStorageFile(sb: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await sb.storage.from("ai-inbox").download(path);
  if (error || !data) {
    throw new AiRequestError(`Could not read the uploaded file: ${error?.message || "not found"}`, 400, "AI_FILE_READ");
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function extractUploadedFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<UploadedSource> {
  const cfg = getAiConfig();
  if (buffer.byteLength > cfg.maxUploadBytes) {
    throw new AiRequestError("That file is larger than the configured upload limit.", 400, "AI_FILE_SIZE");
  }
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mime = inferMimeType(filename, mimeType);

  if (mime.startsWith("image/")) {
    return {
      kind: "image",
      text: "",
      mimeType: mime,
      filename,
      dataUrl: `data:${mime};base64,${buffer.toString("base64")}`
    };
  }

  if (mime.startsWith("audio/")) {
    const { transcribeAudio } = await import("./provider");
    const result = await transcribeAudio(buffer, filename, mime);
    return { kind: "audio", text: result.data, mimeType: mime, filename };
  }

  if (mime === "application/pdf" || ext === "pdf") {
    let text = "";
    try {
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const parsed = await pdfParse(buffer);
      text = parsed.text.trim();
    } catch {
      text = "";
    }
    if (text.replace(/\s+/g, "").length >= 20) {
      return { kind: "text", text: text.slice(0, 80_000), mimeType: "application/pdf", filename };
    }

    let ocrError: Error | null = null;
    try {
      const { ocrPdf } = await import("./ocr");
      const ocrText = (await ocrPdf(buffer)).trim();
      if (ocrText) {
        return { kind: "text", text: ocrText.slice(0, 80_000), mimeType: "application/pdf", filename };
      }
    } catch (error) {
      ocrError = error instanceof Error ? error : new Error("PDF OCR failed.");
    }

    if (text) {
      return { kind: "text", text: text.slice(0, 80_000), mimeType: "application/pdf", filename };
    }
    if (ocrError) {
      throw new AiRequestError(
        `This PDF looks scanned, but OCR could not read it: ${ocrError.message}`,
        400,
        "AI_PDF_OCR"
      );
    }
    throw new AiRequestError(
      "No readable text was found in this PDF. If it is scanned, upload it as an image or try a clearer copy.",
      400,
      "AI_PDF_NO_TEXT"
    );
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    return {
      kind: "text",
      text: parsed.value.trim().slice(0, 80_000),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename
    };
  }

  if (mime === "application/msword" || ext === "doc") {
    throw new AiRequestError("Legacy .doc files cannot be read reliably. Save the file as PDF or DOCX and upload again.", 400, "AI_FILE_TYPE");
  }

  if (mime.startsWith("text/") || ["txt", "md", "csv", "rtf"].includes(ext)) {
    return { kind: "text", text: buffer.toString("utf8").slice(0, 80_000), mimeType: mime, filename };
  }

  throw new AiRequestError("That file type is not supported. Upload a PDF, DOCX, text file, image or audio file.", 400, "AI_FILE_TYPE");
}
