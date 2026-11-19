-- Prompt 2: projects, smart notes, knowledge links, focus sessions,
-- task status expansion and record relationships.
-- Safe to run more than once. Run in Supabase Dashboard -> SQL Editor.

create extension if not exists "pgcrypto";

-- ── projects ───────────────────────────────────────────────────────────────
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

-- ── smart notes (long-form knowledge, separate from task_notes) ────────────
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

-- ── saved links / knowledge library ────────────────────────────────────────
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

-- ── focus sessions ─────────────────────────────────────────────────────────
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

-- ── task status + relationships ────────────────────────────────────────────
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo','in_progress','completed','on_hold','cancelled'));

alter table public.tasks add column if not exists project_id text;
alter table public.tasks add column if not exists source_note_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_project_id_fkey') then
    alter table public.tasks
      add constraint tasks_project_id_fkey foreign key (project_id)
      references public.projects(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_source_note_id_fkey') then
    alter table public.tasks
      add constraint tasks_source_note_id_fkey foreign key (source_note_id)
      references public.notes(id) on delete set null;
  end if;
end $$;
create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists tasks_note_idx on public.tasks(source_note_id);

-- ── updated_at triggers ────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_projects on public.projects;
create trigger trg_projects before update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_notes on public.notes;
create trigger trg_notes before update on public.notes
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_saved_links on public.saved_links;
create trigger trg_saved_links before update on public.saved_links
  for each row execute function public.touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
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
