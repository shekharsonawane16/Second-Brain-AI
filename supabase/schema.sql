-- ── TaskFlow Supabase schema ─────────────────────────────────
-- Run in: Supabase Dashboard → SQL Editor → New query → paste & Run.
-- Or: supabase db push with the migrations folder.
-- All tables are per-user (user_id = auth.uid()) with Row Level Security.

-- extensions
create extension if not exists "pgcrypto";

-- ── profiles (1 row per auth user) ──────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text default '',
  timezone text default 'Asia/Kolkata',
  theme text default 'dark' check (theme in ('dark','light','system')),
  date_format text default 'dd/MM/yyyy',
  week_start int default 1 check (week_start in (0,1)),
  default_sort text default 'priority',
  default_view text default 'list',
  daily_focus_limit int default 5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── categories ──────────────────────────────────────────────
create table if not exists public.categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text default 'folder',
  color text default '#6366F1',
  sort_order int default 0,
  archived boolean default false,
  created_at timestamptz default now()
);
create index if not exists categories_user_idx on public.categories(user_id);

-- ── tasks ───────────────────────────────────────────────────
create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text default '',
  category_id text references public.categories(id) on delete set null,
  subcategory text,
  deadline_date date,
  deadline_time time,
  start_date date,
  status text default 'todo' check (status in ('todo','in_progress','completed')),
  priority text default 'normal' check (priority in ('critical','high','normal')),
  tags text[] default '{}',
  estimated_minutes int,
  actual_minutes int,
  recurrence jsonb,
  notes_text text,
  archived boolean default false,
  trashed_at timestamptz,
  completed_at timestamptz,
  is_today_focus boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tasks_user_idx on public.tasks(user_id);
create index if not exists tasks_user_deadline_idx on public.tasks(user_id, deadline_date);
create index if not exists tasks_user_status_idx on public.tasks(user_id, status);
create index if not exists tasks_user_priority_idx on public.tasks(user_id, priority);
create index if not exists tasks_category_idx on public.tasks(category_id);

-- ── subtasks ────────────────────────────────────────────────
create table if not exists public.subtasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  title text not null,
  completed boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists subtasks_task_idx on public.subtasks(task_id);

-- ── task_notes ──────────────────────────────────────────────
create table if not exists public.task_notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create index if not exists notes_task_idx on public.task_notes(task_id);

-- ── notification_preferences ────────────────────────────────
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean default true,
  days_before int[] default '{0,1,3,7}',
  daily_summary boolean default true,
  overdue_alerts boolean default true,
  updated_at timestamptz default now()
);

-- push notification settings (added for scheduled web push)
alter table public.notification_preferences
  add column if not exists push_enabled boolean default true,
  add column if not exists push_slots text[] default '{06:00,12:00,18:00}';

-- web push subscriptions (one row per device/browser)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  last_seen timestamptz default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

-- ── notification_logs (idempotency: one row per day+task+kind) ─
create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text references public.tasks(id) on delete cascade,
  kind text not null,
  dedupe_key text not null,
  sent_at timestamptz default now(),
  unique(user_id, dedupe_key)
);
create index if not exists notif_user_idx on public.notification_logs(user_id);

-- ── updated_at trigger ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_profiles on public.profiles;
create trigger trg_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_tasks on public.tasks;
create trigger trg_tasks before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.task_notes enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_logs enable row level security;
alter table public.push_subscriptions enable row level security;

-- owner-only policies
drop policy if exists "own profiles" on public.profiles;
create policy "own profiles" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own subtasks" on public.subtasks;
create policy "own subtasks" on public.subtasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own notes" on public.task_notes;
create policy "own notes" on public.task_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own notif prefs" on public.notification_preferences;
create policy "own notif prefs" on public.notification_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own push subs" on public.push_subscriptions;
create policy "own push subs" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own notif logs" on public.notification_logs;
create policy "own notif logs" on public.notification_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── auto-create profile on signup ───────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email,'@',1),
      'there'
    )
  )
  on conflict (id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Prompt 2: projects, smart notes, knowledge links, focus sessions ───────
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text default '',
  category_id text references public.categories(id) on delete set null,
  color text default '#6366F1',
  status text default 'active' check (status in ('active','paused','completed','archived')),
  start_date date,
  target_date date,
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists projects_user_idx on public.projects(user_id);
create index if not exists projects_category_idx on public.projects(category_id);

create table if not exists public.notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled note',
  content text default '',
  note_type text default 'general' check (note_type in ('general','meeting','idea','research','journal','reference')),
  category_id text references public.categories(id) on delete set null,
  project_id text references public.projects(id) on delete set null,
  tags text[] default '{}',
  pinned boolean default false,
  favorite boolean default false,
  archived boolean default false,
  linked_task_id text references public.tasks(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists notes_user_idx on public.notes(user_id);
create index if not exists notes_category_idx on public.notes(category_id);
create index if not exists notes_project_idx on public.notes(project_id);
create index if not exists notes_updated_idx on public.notes(user_id, updated_at desc);

create table if not exists public.saved_links (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null default '',
  description text default '',
  category_id text references public.categories(id) on delete set null,
  project_id text references public.projects(id) on delete set null,
  tags text[] default '{}',
  favorite boolean default false,
  archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists saved_links_user_idx on public.saved_links(user_id);
create index if not exists saved_links_category_idx on public.saved_links(category_id);
create index if not exists saved_links_project_idx on public.saved_links(project_id);

create table if not exists public.focus_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text references public.tasks(id) on delete set null,
  project_id text references public.projects(id) on delete set null,
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  planned_seconds int not null default 0 check (planned_seconds >= 0),
  completed boolean default true,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_at timestamptz default now()
);
create index if not exists focus_sessions_user_idx on public.focus_sessions(user_id, started_at desc);
create index if not exists focus_sessions_task_idx on public.focus_sessions(task_id);

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo','in_progress','completed','on_hold','cancelled'));
alter table public.tasks add column if not exists project_id text;
alter table public.tasks add column if not exists source_note_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_project_id_fkey') then
    alter table public.tasks add constraint tasks_project_id_fkey foreign key (project_id)
      references public.projects(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_source_note_id_fkey') then
    alter table public.tasks add constraint tasks_source_note_id_fkey foreign key (source_note_id)
      references public.notes(id) on delete set null;
  end if;
end $$;
create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists tasks_note_idx on public.tasks(source_note_id);

drop trigger if exists trg_projects on public.projects;
create trigger trg_projects before update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_notes on public.notes;
create trigger trg_notes before update on public.notes
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_saved_links on public.saved_links;
create trigger trg_saved_links before update on public.saved_links
  for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;
alter table public.notes enable row level security;
alter table public.saved_links enable row level security;
alter table public.focus_sessions enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own smart notes" on public.notes;
create policy "own smart notes" on public.notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own saved links" on public.saved_links;
create policy "own saved links" on public.saved_links for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own focus sessions" on public.focus_sessions;
create policy "own focus sessions" on public.focus_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Prompt 3: AI Life Inbox, memory, assistant conversations and usage.
-- Keep in sync with supabase/migrations/20261110010000_prompt3_ai.sql
-- ============================================================

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
