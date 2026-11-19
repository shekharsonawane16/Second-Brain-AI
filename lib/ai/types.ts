export type AiLanguage = "en" | "hi" | "mr";
export type InboxSourceType = "text" | "url" | "pdf" | "image" | "document" | "audio" | "meeting";
export type InboxStatus = "queued" | "processing" | "needs_review" | "approved" | "failed" | "archived";
export type DeadlineConfidence = "high" | "medium" | "low" | "none";

export interface InboxItem {
  id: string;
  title: string;
  source_type: InboxSourceType;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  source_url: string | null;
  original_text: string;
  status: InboxStatus;
  language: string;
  summary: string;
  extracted: InboxExtraction | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export interface ExtractedTask {
  title: string;
  description: string;
  deadline_date: string | null;
  deadline_time: string | null;
  deadline_source_text: string | null;
  deadline_confidence: DeadlineConfidence;
  priority_hint: "critical" | "high" | "normal";
  category_hint: string | null;
  project_hint: string | null;
  tags: string[];
  estimated_minutes: number | null;
}

export interface ExtractedNote {
  title: string;
  content: string;
  note_type: "general" | "meeting" | "idea" | "research" | "journal" | "reference";
  tags: string[];
}

export interface ExtractedConnection {
  target_type: "note" | "task" | "link";
  target_id: string;
  reason: string;
  confidence: number;
}

export interface InboxExtraction {
  language: string;
  summary: string;
  suggested_title: string;
  ocr_text?: string;
  tasks: ExtractedTask[];
  notes: ExtractedNote[];
  key_facts: string[];
  people: string[];
  connections: ExtractedConnection[];
  warnings: string[];
}

export interface AiCitation {
  type: "task" | "note" | "link" | "inbox" | "memory";
  id: string;
  title: string;
  excerpt?: string;
}

export type AssistantAction =
  | {
      type: "create_task";
      label: string;
      payload: {
        title: string;
        description?: string;
        deadline_date?: string | null;
        deadline_time?: string | null;
        category_hint?: string | null;
        project_hint?: string | null;
        tags?: string[];
        estimated_minutes?: number | null;
      };
    }
  | {
      type: "create_note";
      label: string;
      payload: {
        title: string;
        content: string;
        note_type?: "general" | "meeting" | "idea" | "research" | "journal" | "reference";
        tags?: string[];
      };
    }
  | {
      type: "update_task";
      label: string;
      payload: {
        task_id: string;
        title?: string;
        description?: string;
        status?: "todo" | "in_progress" | "on_hold" | "completed" | "cancelled";
        deadline_date?: string | null;
        deadline_time?: string | null;
      };
    };

export interface AssistantReply {
  answer: string;
  citations: AiCitation[];
  suggested_actions: AssistantAction[];
  language: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  actions: AssistantAction[];
  citations: AiCitation[];
  created_at: string;
}

export interface MemoryItem {
  id: string;
  kind: string;
  source_id: string | null;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MemoryMatch {
  chunk_id: string;
  memory_id: string;
  content: string;
  similarity: number;
  title: string;
  kind: string;
  source_id: string | null;
}

export interface Relationship {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship: string;
  reason: string;
  confidence: number | null;
  status: "suggested" | "accepted" | "rejected";
  created_at: string;
  source_title?: string;
  target_title?: string;
  target_href?: string;
}

export interface TaskBreakdown {
  subtasks: Array<{ title: string; estimated_minutes: number | null; rationale: string }>;
  note: string;
}

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string | null;
  vision: boolean;
  transcription: boolean;
  embeddings: boolean;
  language: AiLanguage;
  missing: string[];
}
