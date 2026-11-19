import type { AiLanguage, AiStatus } from "./types";

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getAiConfig() {
  const apiKey = process.env.AI_API_KEY || "";
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const keyOptional = process.env.AI_API_KEY_OPTIONAL === "1";
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  return {
    apiKey,
    baseUrl,
    nativeBaseUrl: (process.env.AI_NATIVE_BASE_URL || baseUrl.replace(/\/openai\/?$/, "")).replace(/\/+$/, ""),
    keyOptional,
    configured: Boolean(model && baseUrl && (apiKey || keyOptional)),
    provider: process.env.AI_PROVIDER || "openai-compatible",
    model,
    fallbackModels: (process.env.AI_FALLBACK_MODELS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    visionModel: process.env.AI_VISION_MODEL || model,
    ocrModel: process.env.AI_OCR_MODEL || process.env.AI_VISION_MODEL || model,
    transcriptionModel: process.env.AI_TRANSCRIPTION_MODEL || "whisper-1",
    transcriptionMode: process.env.AI_TRANSCRIPTION_MODE === "chat" ? "chat" as const : "api" as const,
    transcriptionBaseUrl: (process.env.AI_TRANSCRIPTION_BASE_URL || baseUrl).replace(/\/+$/, ""),
    transcriptionApiKey: process.env.AI_TRANSCRIPTION_API_KEY || apiKey,
    embeddingModel: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
    embeddingDimensions: Math.floor(envNumber("AI_EMBEDDING_DIMENSIONS", 1536)),
    embeddingBaseUrl: (process.env.AI_EMBEDDING_BASE_URL || baseUrl).replace(/\/+$/, ""),
    embeddingApiKey: process.env.AI_EMBEDDING_API_KEY || apiKey,
    timeoutMs: envNumber("AI_TIMEOUT_MS", 45_000),
    maxRetries: envNumber("AI_MAX_RETRIES", 2),
    maxUploadBytes: envNumber("AI_MAX_UPLOAD_BYTES", 25 * 1024 * 1024),
    ratePerMinute: envNumber("AI_RATE_LIMIT_PER_MINUTE", 12),
    ratePerDay: envNumber("AI_RATE_LIMIT_PER_DAY", 300)
  };
}

export function defaultLanguage(): AiLanguage {
  const value = (process.env.AI_DEFAULT_LANGUAGE || "en").toLowerCase();
  return value === "hi" || value === "mr" ? value : "en";
}

export function aiStatus(): AiStatus {
  const cfg = getAiConfig();
  const missing: string[] = [];
  if (!cfg.apiKey && !cfg.keyOptional) missing.push("AI_API_KEY");
  if (!cfg.model) missing.push("AI_MODEL");
  const transcriptionConfigured = Boolean(
    cfg.transcriptionModel &&
    cfg.transcriptionBaseUrl &&
    (cfg.transcriptionApiKey || cfg.keyOptional)
  );
  const embeddingsConfigured = Boolean(
    cfg.embeddingModel &&
    cfg.embeddingBaseUrl &&
    (cfg.embeddingApiKey || cfg.keyOptional) &&
    process.env.AI_EMBEDDINGS_DISABLED !== "1"
  );
  return {
    configured: cfg.configured,
    provider: cfg.provider,
    model: cfg.configured ? cfg.model : null,
    vision: cfg.configured,
    transcription: transcriptionConfigured,
    embeddings: embeddingsConfigured,
    language: defaultLanguage(),
    missing
  };
}
