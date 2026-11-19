import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { AiNotConfiguredError, AiRequestError, AiValidationError, type AiMeta } from "./provider";
import { getAiConfig } from "./config";
import { nowISO, uid } from "@/lib/utils";

export class DatabaseMigrationError extends Error {
  code = "AI_TABLES_MISSING";
}

export interface AuthedContext {
  sb: SupabaseClient;
  user: User;
  token: string;
}

export type AuthResult =
  | { ok: true; ctx: AuthedContext }
  | { ok: false; response: NextResponse };

export async function requireAiUser(req: NextRequest): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Cloud mode is required for AI features. Add Supabase environment variables." },
        { status: 503 }
      )
    };
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Sign in to use AI features." }, { status: 401 }) };
  }
  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Your session has expired. Sign in again." }, { status: 401 }) };
  }
  return { ok: true, ctx: { sb, user: data.user, token } };
}

export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code || "") ||
    /relation .* does not exist|column .* does not exist|could not find the table/i.test(error.message || "")
  );
}

export async function enforceRateLimit(sb: SupabaseClient, userId: string): Promise<void> {
  const cfg = getAiConfig();
  const now = Date.now();
  const minuteAgo = new Date(now - 60_000).toISOString();
  const dayAgo = new Date(now - 86_400_000).toISOString();
  const [minute, day] = await Promise.all([
    sb.from("ai_usage_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", minuteAgo),
    sb.from("ai_usage_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", dayAgo)
  ]);
  if (minute.error || day.error) {
    if (isMissingTable(minute.error) || isMissingTable(day.error)) {
      throw new DatabaseMigrationError("Run the Prompt 3 AI migration before using AI features.");
    }
    throw new AiRequestError(minute.error?.message || day.error?.message || "Could not check AI usage limits.");
  }
  if ((minute.count || 0) >= cfg.ratePerMinute) {
    throw new AiRequestError(`AI rate limit reached (${cfg.ratePerMinute} requests per minute). Try again shortly.`, 429, "AI_RATE_LIMITED");
  }
  if ((day.count || 0) >= cfg.ratePerDay) {
    throw new AiRequestError(`Daily AI limit reached (${cfg.ratePerDay} requests).`, 429, "AI_DAILY_LIMIT");
  }
}

export async function logAiUsage(
  sb: SupabaseClient,
  userId: string,
  operation: string,
  meta: AiMeta | null,
  status: "success" | "error" | "rate_limited" = "success",
  error?: string
): Promise<void> {
  const { error: insertError } = await sb.from("ai_usage_logs").insert({
    id: uid("aiusage"),
    user_id: userId,
    operation,
    provider: meta?.provider || null,
    model: meta?.model || null,
    input_tokens: meta?.inputTokens || 0,
    output_tokens: meta?.outputTokens || 0,
    latency_ms: meta?.latencyMs || 0,
    status,
    error: error ? error.slice(0, 1000) : null,
    created_at: nowISO()
  });
  if (insertError) console.warn("[ai] usage log failed", insertError.message);
}

export function aiErrorResponse(error: unknown): NextResponse {
  if (error instanceof DatabaseMigrationError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
  }
  if (error instanceof AiNotConfiguredError) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI is not configured. Add AI_API_KEY, AI_BASE_URL and AI_MODEL to the server environment.",
        code: error.code
      },
      { status: 503 }
    );
  }
  if (error instanceof AiValidationError) {
    return NextResponse.json(
      { ok: false, error: "The AI returned an invalid result. Nothing was saved; please retry.", code: error.code },
      { status: 502 }
    );
  }
  if (error instanceof AiRequestError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: Math.min(599, Math.max(400, error.status)) });
  }
  const message = error instanceof Error ? error.message : "Unexpected AI error.";
  console.error("[ai]", error);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export function parseBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}
