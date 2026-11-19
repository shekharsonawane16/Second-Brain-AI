import type { z } from "zod";
import { getAiConfig } from "./config";
import { fitEmbeddingDimensions } from "./embedding";

export class AiNotConfiguredError extends Error {
  code = "AI_NOT_CONFIGURED";
}

export class AiRequestError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 502, code = "AI_REQUEST_FAILED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class AiValidationError extends Error {
  code = "AI_INVALID_OUTPUT";
  issues: unknown;
  constructor(message: string, issues: unknown) {
    super(message);
    this.issues = issues;
  }
}

export interface AiMeta {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface AiResult<T> {
  data: T;
  meta: AiMeta;
}

type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
      | { type: "input_audio"; input_audio: { data: string; format: string } }
    >;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: MessageContent;
}

interface RawCompletion {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

const JSON_RETRY_SUFFIX =
  "\n\nYour previous reply was not valid against the required JSON schema. Return ONLY a single valid JSON object that matches the schema. Do not use markdown.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface EndpointOverride {
  baseUrl: string;
  apiKey: string;
  keyOptional: boolean;
}

async function rawPost(
  path: string,
  body: unknown,
  operation: string,
  timeoutMs: number,
  endpoint?: EndpointOverride
): Promise<{ response: Response; latencyMs: number }> {
  const cfg = getAiConfig();
  const baseUrl = endpoint?.baseUrl || cfg.baseUrl;
  const apiKey = endpoint?.apiKey || cfg.apiKey;
  const keyOptional = endpoint?.keyOptional ?? cfg.keyOptional;
  if (!baseUrl || (!apiKey && !keyOptional)) {
    throw new AiNotConfiguredError("AI is not configured on the server.");
  }

  let lastError: Error | null = null;
  const attempts = Math.max(1, Math.min(4, cfg.maxRetries + 1));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store"
      });
      const latencyMs = Date.now() - started;
      clearTimeout(timer);
      if (response.ok) return { response, latencyMs };

      const text = await response.text().catch(() => "");
      lastError = new AiRequestError(
        `${operation} failed (${response.status}): ${text.slice(0, 500) || response.statusText}`,
        response.status
      );
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof AiRequestError) throw error;
      const message = error instanceof Error && error.name === "AbortError"
        ? `${operation} timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? error.message
          : "Network error";
      lastError = new AiRequestError(message, 504);
    }
    if (attempt < attempts - 1) await sleep(500 * 2 ** attempt);
  }
  throw lastError || new AiRequestError(`${operation} failed.`);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new AiValidationError("The AI response did not contain a JSON object.", { raw: text.slice(0, 1000) });
  }
}

interface ChatOptions {
  system: string;
  user?: string;
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
  endpoint?: EndpointOverride;
}

export async function chatText(options: ChatOptions): Promise<AiResult<string>> {
  const cfg = getAiConfig();
  const primary = options.model || cfg.model;
  const models = [primary, ...cfg.fallbackModels].filter((model, index, list) => model && list.indexOf(model) === index);
  const messages: ChatMessage[] = [
    { role: "system", content: options.system },
    ...(options.messages || []),
    ...(options.user ? [{ role: "user" as const, content: options.user }] : [])
  ];

  const run = async (model: string) => {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 2048
    };
    if (options.json) body.response_format = { type: "json_object" };

    let result: { response: Response; latencyMs: number };
    try {
      result = await rawPost("/chat/completions", body, "AI chat", options.timeoutMs || cfg.timeoutMs, options.endpoint);
    } catch (error) {
      if (options.json && error instanceof AiRequestError && error.status === 400) {
        delete body.response_format;
        result = await rawPost("/chat/completions", body, "AI chat", options.timeoutMs || cfg.timeoutMs, options.endpoint);
      } else {
        throw error;
      }
    }

    const payload = (await result.response.json()) as RawCompletion;
    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new AiRequestError(payload.error?.message || "The AI provider returned an empty response.");
    }
    return {
      data: text,
      meta: {
        provider: cfg.provider,
        model,
        inputTokens: payload.usage?.prompt_tokens || 0,
        outputTokens: payload.usage?.completion_tokens || 0,
        latencyMs: result.latencyMs
      }
    };
  };

  let lastError: Error | null = null;
  for (let index = 0; index < models.length; index++) {
    try {
      return await run(models[index]);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("AI chat failed.");
      const transient = error instanceof AiRequestError && [404, 429, 500, 502, 503, 504].includes(error.status);
      if (!transient || index === models.length - 1) throw lastError;
    }
  }
  throw lastError || new AiRequestError("AI chat failed.");
}

export async function chatJson<S extends z.ZodTypeAny>(
  options: ChatOptions,
  schema: S
): Promise<AiResult<z.output<S>>> {
  let prompt = options;
  let inputTokens = 0;
  let outputTokens = 0;
  let latencyMs = 0;
  let lastIssues: unknown = null;
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await chatText({ ...prompt, json: true });
    inputTokens += response.meta.inputTokens;
    outputTokens += response.meta.outputTokens;
    latencyMs += response.meta.latencyMs;
    try {
      const parsed = schema.safeParse(extractJson(response.data));
      if (parsed.success) {
        return {
          data: parsed.data,
          meta: { ...response.meta, inputTokens, outputTokens, latencyMs }
        };
      }
      lastIssues = parsed.error.issues;
    } catch (error) {
      if (!(error instanceof AiValidationError)) throw error;
      lastIssues = error.issues;
    }
    if (prompt.user === undefined) {
      // Vision requests put the prompt inside `messages`; add a follow-up
      // instruction so the retry is actually different.
      prompt = {
        ...prompt,
        messages: [...(prompt.messages || []), { role: "user" as const, content: JSON_RETRY_SUFFIX.trim() }]
      };
    } else {
      prompt = { ...prompt, user: `${prompt.user}${JSON_RETRY_SUFFIX}` };
    }
  }

  throw new AiValidationError("The AI returned data that did not match the required schema.", lastIssues);
}

export async function embedTexts(inputs: string[], timeoutMs?: number): Promise<AiResult<number[][]>> {
  const cfg = getAiConfig();
  const endpoint: EndpointOverride = {
    baseUrl: cfg.embeddingBaseUrl,
    apiKey: cfg.embeddingApiKey,
    keyOptional: cfg.keyOptional
  };
  if (!cfg.embeddingModel || !endpoint.baseUrl || (!endpoint.apiKey && !endpoint.keyOptional)) {
    throw new AiNotConfiguredError("AI embeddings are not configured.");
  }
  const started = Date.now();
  const body: Record<string, unknown> = { model: cfg.embeddingModel, input: inputs };
  if (cfg.embeddingDimensions > 0) body.dimensions = cfg.embeddingDimensions;
  let result: { response: Response; latencyMs: number };
  try {
    result = await rawPost("/embeddings", body, "AI embeddings", timeoutMs || cfg.timeoutMs, endpoint);
  } catch (error) {
    if (body.dimensions && error instanceof AiRequestError && error.status === 400) {
      delete body.dimensions;
      result = await rawPost("/embeddings", body, "AI embeddings", timeoutMs || cfg.timeoutMs, endpoint);
    } else {
      throw error;
    }
  }
  const payload = (await result.response.json()) as {
    data?: Array<{ embedding: number[]; index: number }>;
    usage?: { prompt_tokens?: number };
    error?: { message?: string };
  };
  const rows = (payload.data || []).sort((a, b) => a.index - b.index);
  if (rows.length !== inputs.length) {
    throw new AiRequestError(payload.error?.message || "The embedding provider returned an unexpected number of vectors.");
  }
  let data: number[][];
  try {
    data = rows.map((row) => fitEmbeddingDimensions(row.embedding, cfg.embeddingDimensions));
  } catch (error) {
    throw new AiRequestError(error instanceof Error ? error.message : "The embedding provider returned an unexpected vector shape.");
  }
  return {
    data,
    meta: {
      provider: cfg.provider,
      model: cfg.embeddingModel,
      inputTokens: payload.usage?.prompt_tokens || 0,
      outputTokens: 0,
      latencyMs: Date.now() - started
    }
  };
}

function audioFormat(mimeType: string, filename: string): string {
  const byMime: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/aac": "aac",
    "audio/aiff": "aiff"
  };
  if (byMime[mimeType]) return byMime[mimeType];
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ext && ext.length <= 5 ? ext : "mp3";
}

export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<AiResult<string>> {
  const cfg = getAiConfig();
  if (!cfg.transcriptionModel) throw new AiNotConfiguredError("AI transcription is not configured.");
  if (cfg.transcriptionMode === "chat") {
    const result = await chatText({
      system: "You are a precise transcription engine. Return only the verbatim transcript, with no commentary, labels or markdown.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this audio verbatim." },
            { type: "input_audio", input_audio: { data: buffer.toString("base64"), format: audioFormat(mimeType, filename) } }
          ]
        }
      ],
      model: cfg.transcriptionModel,
      temperature: 0,
      maxTokens: 4096,
      timeoutMs: Math.max(cfg.timeoutMs, 90_000),
      endpoint: {
        baseUrl: cfg.transcriptionBaseUrl,
        apiKey: cfg.transcriptionApiKey,
        keyOptional: cfg.keyOptional
      }
    });
    if (!result.data.trim()) throw new AiRequestError("Transcription returned no text.");
    return result;
  }
  if (!cfg.transcriptionBaseUrl || (!cfg.transcriptionApiKey && !cfg.keyOptional)) {
    throw new AiNotConfiguredError("AI transcription is not configured.");
  }
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
  form.append("model", cfg.transcriptionModel);
  form.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(cfg.timeoutMs, 90_000));
  const started = Date.now();
  try {
    const response = await fetch(`${cfg.transcriptionBaseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: cfg.transcriptionApiKey ? { authorization: `Bearer ${cfg.transcriptionApiKey}` } : undefined,
      body: form,
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AiRequestError(`Transcription failed (${response.status}): ${text.slice(0, 500)}`, response.status);
    }
    const payload = (await response.json()) as { text?: string };
    if (!payload.text) throw new AiRequestError("Transcription returned no text.");
    return {
      data: payload.text,
      meta: {
        provider: cfg.provider,
        model: cfg.transcriptionModel,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started
      }
    };
  } finally {
    clearTimeout(timer);
  }
}
