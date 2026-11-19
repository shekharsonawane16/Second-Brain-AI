import { getSupabaseBrowser } from "@/lib/supabase";
import { uid } from "@/lib/utils";
import { inferMimeType } from "./mime";
import type { AiStatus, InboxItem } from "./types";

export class AiClientError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function authToken(): Promise<string> {
  const sb = getSupabaseBrowser();
  if (!sb) throw new AiClientError("AI features need cloud mode. Configure Supabase and sign in.");
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiClientError("Your session has expired. Sign in again.", 401);
  return token;
}

export async function aiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await authToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers || {}),
      authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new AiClientError(
      String(payload.error || `Request failed (${response.status}).`),
      response.status,
      typeof payload.code === "string" ? payload.code : undefined
    );
  }
  return payload as T;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  const result = await aiRequest<{ status: AiStatus }>("/api/ai/status");
  return result.status;
}

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "upload";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}

export interface AssistantFileUpload {
  path: string;
  filename: string;
  mime: string;
  size: number;
}

export async function uploadAssistantFile(file: File): Promise<AssistantFileUpload> {
  const sb = getSupabaseBrowser();
  if (!sb) throw new AiClientError("File uploads need cloud mode. Configure Supabase and sign in.");
  const { data: sessionData } = await sb.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AiClientError("Sign in to upload files.", 401);
  const filename = safeName(file.name || "upload");
  const mime = inferMimeType(filename, file.type);
  const path = `${user.id}/assistant/${uid("upload")}/${filename}`;
  const { error } = await sb.storage.from("ai-inbox").upload(path, file, {
    contentType: mime,
    upsert: false
  });
  if (error) {
    const message = /bucket not found/i.test(error.message)
      ? "The ai-inbox storage bucket is missing. Run the Prompt 3 migration first."
      : error.message;
    throw new AiClientError(message, 500);
  }
  return { path, filename, mime, size: file.size };
}

export async function uploadInboxFile(
  file: File,
  options?: { title?: string; sourceType?: "meeting" }
): Promise<InboxItem> {
  const sb = getSupabaseBrowser();
  if (!sb) throw new AiClientError("File uploads need cloud mode. Configure Supabase and sign in.");
  const { data: sessionData } = await sb.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new AiClientError("Sign in to upload files.", 401);
  const filename = safeName(file.name || "upload");
  const mime = inferMimeType(filename, file.type);
  const path = `${user.id}/${uid("upload")}/${filename}`;
  const { error } = await sb.storage.from("ai-inbox").upload(path, file, {
    contentType: mime,
    upsert: false
  });
  if (error) {
    const message = /bucket not found/i.test(error.message)
      ? "The ai-inbox storage bucket is missing. Run the Prompt 3 migration first."
      : error.message;
    throw new AiClientError(message, 500);
  }
  try {
    const result = await aiRequest<{ item: InboxItem }>("/api/ai/inbox", {
      method: "POST",
      body: JSON.stringify({
        type: "upload",
        storage_path: path,
        original_name: filename,
        mime_type: mime,
        size_bytes: file.size,
        title: options?.title || filename,
        source_type: options?.sourceType || undefined
      })
    });
    return result.item;
  } catch (error) {
    await sb.storage.from("ai-inbox").remove([path]);
    throw error;
  }
}
