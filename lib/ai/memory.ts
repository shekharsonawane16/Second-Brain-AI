import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts, type AiMeta } from "./provider";
import { isMissingTable } from "./server";
import type { MemoryMatch } from "./types";
import { nowISO, uid } from "@/lib/utils";

export interface IndexInput {
  kind: "note" | "task" | "inbox" | "document" | "link" | "conversation" | "fact";
  source_id?: string | null;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export function splitIntoChunks(text: string, size = 1100, overlap = 150): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (!normalized) return [];
  if (normalized.length <= size) return [normalized];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length && chunks.length < 40) {
    let end = Math.min(normalized.length, start + size);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf("\n", end),
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf(" ", end)
      );
      if (boundary > start + size * 0.55) end = boundary + 1;
    }
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

export async function indexMemory(
  sb: SupabaseClient,
  userId: string,
  input: IndexInput
): Promise<{ memoryId: string; chunks: number; meta: AiMeta | null }> {
  const content = input.content.trim().slice(0, 100_000);
  if (!content) throw new Error("Nothing to index.");
  const chunks = splitIntoChunks(content);
  if (!chunks.length) throw new Error("Nothing to index.");

  const embedded = await embedTexts(chunks);

  let existingId: string | null = null;
  if (input.source_id) {
    const existing = await sb
      .from("ai_memories")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", input.kind)
      .eq("source_id", input.source_id)
      .maybeSingle();
    if (existing.error && !isMissingTable(existing.error)) throw new Error(existing.error.message);
    existingId = (existing.data as { id?: string } | null)?.id || null;
  }

  const memoryId = existingId || uid("memory");
  const { error: memoryError } = await sb.from("ai_memories").upsert({
    id: memoryId,
    user_id: userId,
    kind: input.kind,
    source_id: input.source_id || null,
    title: input.title.trim().slice(0, 200) || "Untitled memory",
    content,
    metadata: input.metadata || {},
    updated_at: nowISO(),
    ...(existingId ? {} : { created_at: nowISO() })
  });
  if (memoryError) throw new Error(memoryError.message);

  const { error: deleteError } = await sb.from("ai_memory_chunks").delete().eq("memory_id", memoryId).eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  const rows = chunks.map((chunk, index) => ({
    id: uid("chunk"),
    user_id: userId,
    memory_id: memoryId,
    chunk_index: index,
    content: chunk,
    embedding: embedded.data[index],
    created_at: nowISO()
  }));
  const { error: insertError } = await sb.from("ai_memory_chunks").insert(rows);
  if (insertError) throw new Error(insertError.message);

  return { memoryId, chunks: chunks.length, meta: embedded.meta };
}

export async function semanticSearch(
  sb: SupabaseClient,
  userId: string,
  query: string,
  limit = 8
): Promise<{ matches: MemoryMatch[]; meta: AiMeta }> {
  const trimmed = query.trim().slice(0, 1000);
  if (!trimmed) return { matches: [], meta: { provider: "", model: "", inputTokens: 0, outputTokens: 0, latencyMs: 0 } };
  const embedded = await embedTexts([trimmed]);
  const { data, error } = await sb.rpc("match_ai_memory_chunks", {
    query_embedding: embedded.data[0],
    match_user_id: userId,
    match_count: Math.min(Math.max(limit, 1), 20)
  });
  if (error) {
    if (isMissingTable(error) || /function .* does not exist/i.test(error.message)) {
      throw new Error("Run the Prompt 3 AI migration to enable semantic memory search.");
    }
    throw new Error(error.message);
  }
  const rows = (data || []) as Array<{ chunk_id: string; memory_id: string; content: string; similarity: number }>;
  if (!rows.length) return { matches: [], meta: embedded.meta };

  const ids = [...new Set(rows.map((row) => row.memory_id))];
  const { data: memories, error: memoryError } = await sb
    .from("ai_memories")
    .select("id, title, kind, source_id")
    .eq("user_id", userId)
    .in("id", ids);
  if (memoryError) throw new Error(memoryError.message);
  const byId = new Map(
    ((memories || []) as Array<{ id: string; title: string; kind: string; source_id: string | null }>).map((m) => [m.id, m])
  );
  return {
    matches: rows
      .map((row) => {
        const memory = byId.get(row.memory_id);
        return memory
          ? {
              chunk_id: row.chunk_id,
              memory_id: row.memory_id,
              content: row.content,
              similarity: Number(row.similarity),
              title: memory.title,
              kind: memory.kind,
              source_id: memory.source_id
            }
          : null;
      })
      .filter((row): row is MemoryMatch => Boolean(row)),
    meta: embedded.meta
  };
}
