const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp4a-latm": "audio/mp4",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "text/x-markdown": "text/markdown",
  "application/x-pdf": "application/pdf"
};

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg"
};

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

/**
 * Browsers sometimes report an empty or generic MIME type for valid uploads
 * (notably .m4a on Windows). The storage bucket validates MIME, so infer a
 * concrete type from the extension before uploading.
 */
export function inferMimeType(name: string, provided?: string | null): string {
  const clean = MIME_ALIASES[(provided || "").toLowerCase().trim()] || (provided || "").toLowerCase().trim();
  if (clean && clean !== "application/octet-stream" && clean !== "binary/octet-stream") return clean;
  return MIME_BY_EXTENSION[extensionOf(name)] || clean || "application/octet-stream";
}

export function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("image/");
}

export function isAudioMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("audio/");
}
