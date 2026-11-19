# Second Brain AI — Your Life. Your Knowledge. Your Intelligence.

Second Brain AI is a personal productivity and intelligent knowledge platform: Next.js 14 + TypeScript + Tailwind + Supabase (PostgreSQL + Auth), with an automatic deadline-driven priority engine, dashboard, calendar, notifications, analytics, offline PWA, trash recovery, and a genuine AI Second Brain (Life Inbox, assistant, semantic memory and confirmed task breakdown).

## Quick start (local, 3 minutes)

```powershell
# Second Brain AI — Your Life. Your Knowledge. Your Intelligence.
& "C:\Program Files\nodejs\npm.cmd" install

# Second Brain AI — Your Life. Your Knowledge. Your Intelligence.
Copy-Item .env.example .env.local
# Second Brain AI — Your Life. Your Knowledge. Your Intelligence.

# Second Brain AI — Your Life. Your Knowledge. Your Intelligence.
& "C:\Program Files\nodejs\npm.cmd" run dev
# Second Brain AI — Your Life. Your Knowledge. Your Intelligence.
```

```powershell
# Second Brain AI — Your Life. Your Knowledge. Your Intelligence.
& "C:\Program Files\nodejs\npm.cmd" test

# Second Brain AI — Your Life. Your Knowledge. Your Intelligence.
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run start
```

## Modes (honest, per spec §12)

| Mode | When | Storage |
|---|---|---|
| **Local mode** | No Supabase keys in `.env.local` | Browser `localStorage` only, per signed-in demo identity. Top bar shows an amber **“Local mode”** banner. Good for trying the UI, **not** multi-device. |
| **Cloud mode** | Valid `NEXT_PUBLIC_SUPABASE_URL` + anon key | **Supabase PostgreSQL + Auth**. Tasks sync across devices, RLS-enforced. Banner disappears. |

The app **never claims** cloud persistence in local mode. It always labels the mode.

## Supabase setup (cloud persistence, ~10 min)

1. Create project at https://supabase.com → **Settings → API** → copy URL + `anon` key into `.env.local`.
2. **SQL Editor → New query** → paste `supabase/schema.sql` → **Run**. This creates `profiles, categories, tasks, subtasks, task_notes, notification_preferences, notification_logs`, indexes, RLS policies and the auto-profile trigger.
3. **Authentication → Providers**: Email is on by default. Optionally enable **Google**:
   - Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web application).
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Paste the Client ID + Client Secret into Supabase → Authentication → Providers → Google → Save.
4. **Authentication → URL Configuration**: Site URL = production URL; Redirect URLs must include
   `http://localhost:3000/login`, `http://localhost:3000/**`, `https://<your-app>.vercel.app/login`, `https://<your-app>.vercel.app/**`.
5. Restart dev server, sign up at `/login` (email or **Continue with Google**), add a task, refresh, sign in on another device — data persists.

### AI Second Brain setup

1. **Database**: run `supabase/migrations/20261110000000_prompt2_workspace.sql` first, then `supabase/migrations/20261110010000_prompt3_ai.sql` in the Supabase SQL Editor. For a fresh project, `supabase/schema.sql` now contains the complete Prompt 1 + 2 + 3 schema. Prompt 3 enables the `vector` extension, AI tables, `match_ai_memory_chunks` and the private `ai-inbox` storage bucket.
2. **Server environment** (Vercel Project → Settings → Environment Variables, or `.env.local`):
   - Required: `AI_API_KEY` (use a free Gemini or Groq key if you do not want to pay OpenAI).
   - Free Gemini example: `AI_PROVIDER=gemini`, `AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `AI_NATIVE_BASE_URL=https://generativelanguage.googleapis.com/v1beta`, `AI_MODEL=gemini-3.5-flash`, `AI_VISION_MODEL=gemini-3.5-flash`, `AI_OCR_MODEL=gemini-3.5-flash`, `AI_TRANSCRIPTION_MODE=chat`, `AI_TRANSCRIPTION_MODEL=gemini-3.5-flash`, `AI_EMBEDDING_MODEL=gemini-embedding-001`, `AI_EMBEDDING_DIMENSIONS=1536`, `AI_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.8-flash,gemini-3.5-flash-lite`.
   - Free Groq example: `AI_PROVIDER=groq`, `AI_BASE_URL=https://api.groq.com/openai/v1`, `AI_MODEL=qwen/qwen3.8-27b`, `AI_VISION_MODEL=qwen/qwen3.8-27b`, `AI_TRANSCRIPTION_MODEL=whisper-large-v3-turbo`, `AI_EMBEDDINGS_DISABLED=1` (Groq has no embeddings).
   - OpenAI example: `AI_PROVIDER=openai-compatible`, `AI_BASE_URL=https://api.openai.com/v1`, `AI_MODEL=gpt-4o-mini`, `AI_EMBEDDING_MODEL=text-embedding-3-small`.
   - Optional: `AI_TRANSCRIPTION_BASE_URL`/`AI_TRANSCRIPTION_API_KEY`, `AI_EMBEDDING_BASE_URL`/`AI_EMBEDDING_API_KEY` to mix providers, plus timeout/retry/rate-limit/upload settings.
   - Embeddings are truncated and renormalized to `AI_EMBEDDING_DIMENSIONS` (1536 by default) so Gemini's 3072-dimension vectors fit the pgvector column.
   - **Never** prefix AI keys with `NEXT_PUBLIC_`; they are server-only.
3. **Capabilities**: PDF/DOCX/text extraction is local on the server. Scanned PDFs fall back to Gemini native PDF OCR, images use the vision model, audio uses the transcription model (API endpoint or Gemini chat audio mode), and memory search uses embeddings. If a capability/model is unavailable, the UI states that honestly instead of faking a result.
4. **Limits**: uploads are 25 MB, direct browser-to-Supabase upload avoids Vercel request-body limits, and rate limits default to 12 requests/minute and 300/day per user.
5. **Security**: every AI table and storage path is owner-scoped by RLS. Prompt-injection content is treated as untrusted, AI cannot invent deadlines or execute actions, and created items require explicit review/confirmation.

### Backup & restore

- **In-app**: Settings → *Export JSON backup* (full) / *Export CSV* / *Import CSV·JSON* (validates + skips duplicates by title+deadline).
- **Supabase**: Dashboard → Database → Backups (daily on paid plans; manual `pg_dump` anytime):
  `pg_dump "postgresql://postgres:[pw]@[ref].supabase.co:5432/postgres" -t public.tasks -t public.categories -t public.subtasks -t public.task_notes > taskflow-backup.sql`
- **Restore**: SQL Editor → paste backup, or in-app Import.
- Long-term availability depends on your Supabase project status + backups. Never rely on a single copy.

## Priority engine (spec §5, single source of truth: `lib/priority.ts`)

Calendar days = `deadline_date − today_in_user_timezone` (`Asia/Kolkata` default, changeable in Settings).

| Days remaining | Priority |
|---|---|
| Overdue / today / 1–4 | **Critical** |
| 5–10 | **High** |
| >10 / none | **Normal** |

- Recalculated on create, on deadline edit, on app load, and every 30s + on tab-focus (midnight rollover, case 10).
- Same function powers dashboard, lists, search, calendar, analytics, notifications.
- Labels: “Overdue by 2 days”, “Due today”, “Due tomorrow”, “Due in 6 days”, “No deadline”.
- Color is **never the only signal** — icon + text label always accompany it.

## Features checklist

- [x] Overview dashboard (greeting, 6 live KPIs, Today’s Focus urgency-sorted, 7-day list, 14-day chart, per-section progress)
- [x] My Day (overdue + due-today + focus picks + Focus mode one-task view + daily limit)
- [x] Upcoming (chronological 30-day groups), Critical (overdue+≤4d), High (5–10d), All (filter/sort/list+compact), Completed (date filters), Trash (restore / permanent with confirm)
- [x] Sections CRUD + archive + safe delete (move-to or trash, never silent)
- [x] Task CRUD + status + subtasks/checklist + notes + tags + start date + time + estimates + focus flag + archive + duplicate
- [x] Global search palette (Ctrl/⌘+K or `/`), Quick Add (N), Esc closes
- [x] Month calendar (deadline dots/cards, click-date to create, click-task to open, legend with labels)
- [x] Reminders: in-app center + optional Browser Notifications (permission-gated), configurable days-before, idempotent per day+task+kind, honest “no background when closed” note
- [x] Analytics (created vs done, rate, 8-week bars, priority pie, pending-by-section, avg completion, empty states)
- [x] AI Life Inbox: text, URL, PDF, DOCX, text file, image and audio capture with private storage, real processing states, editable extraction review and explicit approval before creating tasks/notes
- [x] Multilingual validated extraction (English, Hindi, Marathi) with source-backed deadlines only; app priority engine remains authoritative
- [x] Persisted AI Assistant with workspace context, citations, conversation history, and confirmed create-task/create-note/update-task actions
- [x] AI Memory: chunked embeddings, semantic search, source links, manual memories, deletion, and accepted/suggested AI connections
- [x] Task-detail AI breakdown with editable suggestions and explicit confirmation before adding subtasks
- [x] Settings (name, theme dark default + light, timezone, date format, sort, focus limit, reminders, AI language/auto-index/status, export/import, sign-out, erase-local with DELETE confirm)
- [x] Auth: Supabase Auth in cloud mode; clearly-labeled local demo identity otherwise
- [x] RLS owner-only policies on every table; anon key only in frontend (never service-role)
- [x] No silent deletion: completed/overdue/archived/trashed are retained until explicit permanent delete
- [ ] Server-side scheduler for closed-browser push (requires Vercel Cron / Supabase pg_cron — documented, not faked)
- [ ] Recurring engine UI (data model `recurrence` exists; next occurrence auto-created on completion; full cron UI is a follow-up)

## Mobile app (installable PWA)

The site is a full PWA — no app store required.

- `public/manifest.webmanifest` — name, icons (any + maskable), shortcuts, standalone display.
- `public/sw.js` — app-shell caching, cache-first static assets, offline fallback (`public/offline.html`). Never caches Supabase/auth traffic.
- `components/install-app.tsx` — captures `beforeinstallprompt`, triggers the native install prompt, and falls back to platform instructions (Safari share sheet on iOS, Chrome menu on Android/desktop).
- Install entry points: mobile topbar download icon, mobile drawer, desktop sidebar, and the login page.

**Install on a phone:** open the deployed URL → tap **Download app** → Android Chrome shows the native install dialog; iPhone Safari → Share → **Add to Home Screen**. The app then opens full-screen with its own icon and works offline.

Brand assets live in `public/icons/` (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`, favicons) plus `app/icon.png` and `app/apple-icon.png`; social preview is `public/og.png`.

## Deployment (Vercel + Supabase)

1. Push to GitHub (no `.env*` — `.gitignore` covers it).
2. Vercel → New Project → import repo → add env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL=https://your-app.vercel.app`, plus server-only `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` and `AI_EMBEDDING_MODEL` (see AI setup above).
3. Deploy → open `https://your-app.vercel.app/login` → sign in → tasks sync everywhere.
4. Supabase → Auth → URL Config → add the Vercel URL.

## Project structure

```
app/                routes (page.tsx per view) + layout + globals.css
  my-day/ upcoming/ critical/ high/ all/ completed/
  categories/ categories/[id]/ calendar/ analytics/ settings/ trash/ login/
  inbox/ assistant/ memory/              Prompt 3 AI surfaces
  api/ai/                                 status, inbox, process, chat, memory, relationships, breakdown
components/         app-shell, task-row, task-list, quick-add, task-detail,
                    priority-badge, empty-state, ai-status-banner
lib/                types, priority (engine), store (data+auth+notifs),
                    supabase, validation (zod), utils
lib/ai/             config, provider, server, files, mime, extraction, memory,
                    assistant, temporal, schemas, client, types
supabase/schema.sql full Postgres schema + Prompt 2/3 extensions + RLS + triggers
supabase/migrations/ Prompt 2 workspace and Prompt 3 AI migrations
scripts/run-priority-tests.js  priority/label acceptance tests
scripts/run-ai-tests.mjs       AI schema, safety and MIME tests
```

## Testing (§17)

- `npm test` — 10 priority cases + 4 label cases (yesterday→critical/overdue … 11d→normal, no-deadline→normal, edit recalculation, midnight rollover logic) plus 18 AI validation cases.
- `npm run test:ai` — extraction/deadline safety, assistant actions, task breakdown limits, temporal-cue guard and upload MIME inference.
- Manual: create/edit/complete/archive/delete/restore, sections CRUD + move-on-delete, refresh persistence, sign-out/in, second device (cloud mode), filters/sorts, timezone change (Settings → try Asia/Kolkata vs UTC near midnight), calendar click-flows, import/export round-trip.
- Prompt 3 manual flow: run both migrations, configure AI env, capture each source type, confirm deadlines are source-backed, approve selected tasks/notes, verify memory search, apply an assistant action only after confirmation, accept/reject a connection, and generate a task breakdown without auto-saving it.
- AI health check: authenticated `GET /api/ai/status` must report `configured: true`; missing tables return the honest “Run the Prompt 3 AI migration” message instead of fake data.
