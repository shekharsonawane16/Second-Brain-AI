-- Prompt 3: AI Life Inbox, memory, assistant conversations and usage.
-- Run after the base schema and Prompt 2 workspace migration.

create extension if not exists "vector";

-- ── AI Life Inbox ─────────────────────────────────────────────
create table if not exists public.ai_inbox_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled capture',
  source_type text not null default 'text'
    check (source_type in ('text','url','pdf','image','document','audio','meeting')),
  original_name text,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  source_url text,
  original_text text default '',
  status text not null default 'queued'
    check (status in ('queued','processing','needs_review','approved','failed','archived')),
  language text default 'en',
  summary text default '',
  extracted jsonb,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  processed_at timestamptz
);
create index if not exists ai_inbox_user_idx on public.ai_inbox_items(user_id, created_at desc);
create index if not exists ai_inbox_status_idx on public.ai_inbox_items(user_id, status);

create table if not exists public.ai_processing_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  inbox_item_id text not null references public.ai_inbox_items(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed')),
  stage text not null default 'queued',
  attempts int not null default 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists ai_jobs_item_idx on public.ai_processing_jobs(inbox_item_id);
create index if not exists ai_jobs_user_idx on public.ai_processing_jobs(user_id, created_at desc);

-- ── Assistant conversations ───────────────────────────────────
create table if not exists public.ai_conversations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations(user_id, updated_at desc);

create table if not exists public.ai_messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  actions jsonb default '[]'::jsonb,
  citations jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
create index if not exists ai_messages_conversation_idx on public.ai_messages(conversation_id, created_at);

-- ── Personal memory + semantic search ─────────────────────────
create table if not exists public.ai_memories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'note'
    check (kind in ('note','task','inbox','document','link','conversation','fact')),
  source_id text,
  title text not null default '',
  content text not null default '',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ai_memories_user_idx on public.ai_memories(user_id, updated_at desc);
create unique index if not exists ai_memories_source_idx
  on public.ai_memories(user_id, kind, source_id) where source_id is not null;

create table if not exists public.ai_memory_chunks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id text not null references public.ai_memories(id) on delete cascade,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);
create index if not exists ai_chunks_memory_idx on public.ai_memory_chunks(memory_id);
create index if not exists ai_chunks_user_idx on public.ai_memory_chunks(user_id);
create index if not exists ai_chunks_embedding_idx on public.ai_memory_chunks
  using hnsw (embedding vector_cosine_ops);

create or replace function public.match_ai_memory_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 8
)
returns table (
  chunk_id text,
  memory_id text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id as chunk_id,
         c.memory_id,
         c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.ai_memory_chunks c
  where c.user_id = match_user_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

-- ── Knowledge connections ─────────────────────────────────────
create table if not exists public.ai_relationships (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  relationship text not null default 'related',
  reason text default '',
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'suggested'
    check (status in ('suggested','accepted','rejected')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, source_type, source_id, target_type, target_id)
);
create index if not exists ai_relationships_user_idx on public.ai_relationships(user_id, status);

-- ── Usage / rate limiting audit ───────────────────────────────
create table if not exists public.ai_usage_logs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  provider text,
  model text,
  input_tokens int default 0,
  output_tokens int default 0,
  latency_ms int default 0,
  status text not null default 'success' check (status in ('success','error','rate_limited')),
  error text,
  created_at timestamptz default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage_logs(user_id, created_at desc);

-- ── updated_at triggers ───────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_ai_inbox on public.ai_inbox_items;
create trigger trg_ai_inbox before update on public.ai_inbox_items
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_ai_memories on public.ai_memories;
create trigger trg_ai_memories before update on public.ai_memories
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_ai_conversations on public.ai_conversations;
create trigger trg_ai_conversations before update on public.ai_conversations
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_ai_relationships on public.ai_relationships;
create trigger trg_ai_relationships before update on public.ai_relationships
  for each row execute function public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
alter table public.ai_inbox_items enable row level security;
alter table public.ai_processing_jobs enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_memories enable row level security;
alter table public.ai_memory_chunks enable row level security;
alter table public.ai_relationships enable row level security;
alter table public.ai_usage_logs enable row level security;

drop policy if exists "own ai inbox" on public.ai_inbox_items;
create policy "own ai inbox" on public.ai_inbox_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai jobs" on public.ai_processing_jobs;
create policy "own ai jobs" on public.ai_processing_jobs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai conversations" on public.ai_conversations;
create policy "own ai conversations" on public.ai_conversations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai messages" on public.ai_messages;
create policy "own ai messages" on public.ai_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai memories" on public.ai_memories;
create policy "own ai memories" on public.ai_memories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai chunks" on public.ai_memory_chunks;
create policy "own ai chunks" on public.ai_memory_chunks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai relationships" on public.ai_relationships;
create policy "own ai relationships" on public.ai_relationships for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own ai usage read" on public.ai_usage_logs;
create policy "own ai usage read" on public.ai_usage_logs for select
  using (auth.uid() = user_id);
drop policy if exists "own ai usage insert" on public.ai_usage_logs;
create policy "own ai usage insert" on public.ai_usage_logs for insert
  with check (auth.uid() = user_id);

-- ── private uploads bucket (files remain scoped to the owner's folder) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-inbox',
  'ai-inbox',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/ogg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ai inbox own uploads" on storage.objects;
create policy "ai inbox own uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'ai-inbox' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ai inbox own reads" on storage.objects;
create policy "ai inbox own reads" on storage.objects for select to authenticated
  using (bucket_id = 'ai-inbox' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "ai inbox own deletes" on storage.objects;
create policy "ai inbox own deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'ai-inbox' and (storage.foldername(name))[1] = auth.uid()::text);
