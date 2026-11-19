import { NextRequest, NextResponse } from "next/server";
import { conversationTitle, generateAssistantReply, loadWorkspaceContext, type WorkspaceContext } from "@/lib/ai/assistant";
import { semanticSearch } from "@/lib/ai/memory";
import { aiErrorResponse, enforceRateLimit, isMissingTable, logAiUsage, requireAiUser } from "@/lib/ai/server";
import type { MemoryMatch } from "@/lib/ai/types";
import { defaultLanguage } from "@/lib/ai/config";
import { nowISO, uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return "Asia/Kolkata";
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAiUser(req);
  if (!auth.ok) return auth.response;
  const { sb, user } = auth.ctx;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const question = String(body.message || "").trim();
  if (!question) return NextResponse.json({ ok: false, error: "Ask a question first." }, { status: 400 });
  if (question.length > 8000) return NextResponse.json({ ok: false, error: "That question is too long (8,000 character maximum)." }, { status: 400 });
  const language = ["en", "hi", "mr"].includes(String(body.language)) ? String(body.language) : defaultLanguage();
  const timezone = validTimezone(String(body.timezone || "Asia/Kolkata"));

  try {
    await enforceRateLimit(sb, user.id);
  } catch (error) {
    return aiErrorResponse(error);
  }

  let conversationId = body.conversation_id ? String(body.conversation_id) : "";
  let conversation: { id: string; title: string; created_at: string; updated_at: string } | null = null;
  let createdNewConversation = false;

  if (conversationId) {
    const existing = await sb
      .from("ai_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing.error) return aiErrorResponse(existing.error);
    if (!existing.data) return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });
    conversation = existing.data;
  } else {
    conversationId = uid("chat");
    createdNewConversation = true;
    const created = await sb
      .from("ai_conversations")
      .insert({
        id: conversationId,
        user_id: user.id,
        title: conversationTitle(question),
        created_at: nowISO(),
        updated_at: nowISO()
      })
      .select("*")
      .single();
    if (created.error) return aiErrorResponse(created.error);
    conversation = created.data;
  }

  const userMessage = {
    id: uid("msg"),
    user_id: user.id,
    conversation_id: conversationId,
    role: "user",
    content: question,
    actions: [],
    citations: [],
    created_at: nowISO()
  };

  // Load history before inserting this turn, otherwise the current question is
  // sent twice: once as history and once as the new prompt.
  const historyResult = await sb
    .from("ai_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(10);
  const history = ((historyResult.data || []) as Array<{ role: "user" | "assistant"; content: string }>)
    .slice()
    .reverse();

  const { error: userInsertError } = await sb.from("ai_messages").insert(userMessage);
  if (userInsertError) {
    if (createdNewConversation) {
      await sb.from("ai_conversations").delete().eq("id", conversationId).eq("user_id", user.id);
    }
    return aiErrorResponse(userInsertError);
  }

  try {
    const baseContext = await loadWorkspaceContext(sb, user.id);
    let memories: MemoryMatch[] = [];
    let memoryWarning: string | undefined;
    try {
      const search = await semanticSearch(sb, user.id, question, 8);
      memories = search.matches;
    } catch {
      memoryWarning = "Semantic search was unavailable, so only recent memory entries were considered.";
      const recent = await sb
        .from("ai_memories")
        .select("id, title, kind, source_id, content")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(8);
      if (!recent.error) {
        memories = ((recent.data || []) as Array<{ id: string; title: string; kind: string; source_id: string | null; content: string }>).map(
          (memory) => ({
            chunk_id: memory.id,
            memory_id: memory.id,
            content: memory.content.slice(0, 1000),
            similarity: 0,
            title: memory.title,
            kind: memory.kind,
            source_id: memory.source_id
          })
        );
      }
    }

    const context: WorkspaceContext = { ...baseContext, memories, memoryWarning };
    const result = await generateAssistantReply({ question, language, timezone, context, history });

    const assistantMessage = {
      id: uid("msg"),
      user_id: user.id,
      conversation_id: conversationId,
      role: "assistant",
      content: result.reply.answer,
      actions: result.reply.suggested_actions,
      citations: result.reply.citations,
      created_at: nowISO()
    };
    const { error: assistantInsertError } = await sb.from("ai_messages").insert(assistantMessage);
    if (assistantInsertError) throw new Error(assistantInsertError.message);

    const updatedTitle =
      conversation?.title === "New conversation" || conversation?.title === conversationTitle(question)
        ? conversationTitle(question)
        : conversation?.title || conversationTitle(question);
    const { data: updatedConversation } = await sb
      .from("ai_conversations")
      .update({ title: updatedTitle, updated_at: nowISO() })
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    await logAiUsage(sb, user.id, "assistant_chat", result.meta, "success");
    return NextResponse.json({
      ok: true,
      conversation: updatedConversation || conversation,
      user_message: userMessage,
      assistant_message: assistantMessage
    });
  } catch (error) {
    // A failed turn should not leave an orphan question in the conversation.
    await sb.from("ai_messages").delete().eq("id", userMessage.id).eq("user_id", user.id);
    if (createdNewConversation) {
      await sb.from("ai_conversations").delete().eq("id", conversationId).eq("user_id", user.id);
    }
    await logAiUsage(sb, user.id, "assistant_chat", null, "error", error instanceof Error ? error.message : "failed");
    if (isMissingTable(error as { code?: string; message?: string })) {
      return NextResponse.json({ ok: false, error: "Run the Prompt 3 AI migration to use the assistant.", code: "AI_TABLES_MISSING" }, { status: 503 });
    }
    return aiErrorResponse(error);
  }
}
