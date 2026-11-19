import { getAiConfig } from "./config";
import { AiNotConfiguredError, AiRequestError, chatText } from "./provider";

interface NativeResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

const PDF_PROMPT =
  "Transcribe every readable character from this PDF exactly as it appears. Preserve headings, table rows, numbered lists, dates, names, amounts and line breaks. Do not summarise, translate or add commentary. If a page cannot be read, write [Unreadable page N] on its own line.";
const IMAGE_PROMPT =
  "Transcribe every readable character in this image exactly as it appears. Preserve headings, table rows, numbered lists, dates, names, amounts and line breaks. Do not summarise, translate or add commentary. If part of the image cannot be read, write [Unreadable].";

function nativeUrl(model: string): string {
  const cfg = getAiConfig();
  return `${cfg.nativeBaseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
}

function textFromNative(payload: NativeResponse): string {
  return (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function ocrPdf(buffer: Buffer): Promise<string> {
  const cfg = getAiConfig();
  if (cfg.provider !== "gemini") {
    throw new AiNotConfiguredError("Scanned PDF OCR requires the Gemini provider.");
  }
  if (!cfg.apiKey) throw new AiNotConfiguredError("PDF OCR requires AI_API_KEY.");
  if (buffer.byteLength > 18 * 1024 * 1024) {
    throw new AiRequestError("This scanned PDF is too large for OCR. Split it into smaller files (18 MB maximum).", 400, "AI_PDF_OCR_SIZE");
  }

  const models = [cfg.ocrModel, ...cfg.fallbackModels].filter(
    (model, index, list) => model && list.indexOf(model) === index
  );
  const deadline = Date.now() + 55_000;
  let lastError: Error | null = null;

  for (let index = 0; index < models.length; index++) {
    const remaining = deadline - Date.now();
    if (remaining < 4_000) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(45_000, remaining));
    try {
      const response = await fetch(nativeUrl(models[index]), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: "application/pdf", data: buffer.toString("base64") } },
                { text: PDF_PROMPT }
              ]
            }
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 8192 }
        }),
        signal: controller.signal,
        cache: "no-store"
      });
      clearTimeout(timer);

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 400);
        lastError = new AiRequestError(
          `PDF OCR failed (${response.status}): ${detail || response.statusText}`,
          response.status,
          "AI_PDF_OCR"
        );
        const retryable = [404, 429, 500, 502, 503, 504].includes(response.status);
        if (!retryable || index === models.length - 1) throw lastError;
        continue;
      }

      const text = textFromNative((await response.json()) as NativeResponse);
      if (!text) {
        lastError = new AiRequestError("Gemini returned no text for this PDF.", 502, "AI_PDF_OCR_EMPTY");
        if (index === models.length - 1) throw lastError;
        continue;
      }
      return text;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof AiRequestError) throw error;
      lastError = new AiRequestError(
        error instanceof Error && error.name === "AbortError"
          ? "PDF OCR timed out."
          : error instanceof Error
            ? error.message
            : "PDF OCR failed.",
        504,
        "AI_PDF_OCR"
      );
      if (index === models.length - 1) throw lastError;
    }
  }

  throw lastError || new AiRequestError("PDF OCR failed.", 502, "AI_PDF_OCR");
}

export async function ocrImage(dataUrl: string): Promise<string> {
  const cfg = getAiConfig();
  const result = await chatText({
    system: "You transcribe text from images. Return only the transcribed text, preserving line breaks.",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: IMAGE_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }
    ],
    model: cfg.ocrModel,
    temperature: 0,
    maxTokens: 4096
  });
  return result.data.trim();
}
