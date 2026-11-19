import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pref = {
  user_id: string;
  push_enabled: boolean | null;
  push_slots: string[] | null;
  daily_summary: boolean | null;
};
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type TaskRow = {
  user_id: string;
  title: string;
  deadline_date: string | null;
  priority: "critical" | "high" | "normal";
  is_today_focus: boolean;
  status: string;
  archived: boolean;
  trashed_at: string | null;
};

const WINDOW_MIN = 30;

function localNow(tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const date = `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
  const hour = get("hour") % 24;
  return { date, hourly: hour * 60 + get("minute") };
}

function toMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function slotGreeting(slot: string): string {
  const h = Number(slot.slice(0, 2));
  if (h < 9) return "Good morning";
  if (h < 16) return "Midday check-in";
  return "Evening wrap-up";
}

function buildMessage(slot: string, tasks: TaskRow[], today: string) {
  const pending = tasks.filter(
    (t) =>
      !t.trashed_at &&
      !t.archived &&
      t.status !== "completed" &&
      ((t.deadline_date && t.deadline_date <= today) || t.is_today_focus)
  );
  const overdue = pending.filter((t) => t.deadline_date && t.deadline_date < today).length;
  const dueToday = pending.filter((t) => t.deadline_date === today).length;
  const rank = { critical: 0, high: 1, normal: 2 } as const;
  pending.sort((a, b) => {
    const ad = a.deadline_date || "9999-12-31";
    const bd = b.deadline_date || "9999-12-31";
    return ad === bd ? rank[a.priority] - rank[b.priority] : ad < bd ? -1 : 1;
  });

  const title = pending.length
    ? `${slotGreeting(slot)} — ${pending.length} task${pending.length === 1 ? "" : "s"} today`
    : `${slotGreeting(slot)} — all clear`;

  let body: string;
  if (!pending.length) {
    body = "No pending tasks today. Enjoy the clear schedule.";
  } else {
    const bits: string[] = [];
    if (overdue) bits.push(`${overdue} overdue`);
    if (dueToday) bits.push(`${dueToday} due today`);
    if (!overdue && !dueToday) bits.push(`${pending.length} on your list`);
    const next = pending.slice(0, 3).map((t) => t.title).join(", ");
    body = `${bits.join(" · ")}. Next: ${next}${pending.length > 3 ? `, +${pending.length - 3} more` : ""}`;
  }
  return { title, body };
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  const auth = req.headers.get("authorization");
  const authorized = Boolean(secret) && (provided === secret || auth === `Bearer ${secret}`);
  if (!authorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 500 });
  }
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ ok: false, error: "Missing VAPID keys on the server." }, { status: 500 });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:notifications@taskflow.app", vapidPublic, vapidPrivate);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const forcedSlot = req.nextUrl.searchParams.get("slot");

  const { data: prefRows, error: prefErr } = await db
    .from("notification_preferences")
    .select("user_id, push_enabled, push_slots, daily_summary")
    .eq("push_enabled", true);
  if (prefErr) return NextResponse.json({ ok: false, error: prefErr.message }, { status: 500 });
  const prefs = (prefRows || []) as Pref[];
  if (!prefs.length) return NextResponse.json({ ok: true, sent: 0, users: 0, note: "no push-enabled users" });

  const { data: profileRows } = await db.from("profiles").select("id, timezone").in("id", prefs.map((p) => p.user_id));
  const tzByUser = new Map<string, string>();
  for (const p of profileRows || []) tzByUser.set(p.id as string, (p.timezone as string) || "Asia/Kolkata");

  // which users are due right now?
  const due = new Map<string, { slot: string; date: string }>();
  for (const p of prefs) {
    const tz = tzByUser.get(p.user_id) || "Asia/Kolkata";
    const now = localNow(tz);
    const slots = (p.push_slots && p.push_slots.length ? p.push_slots : ["06:00", "12:00", "18:00"]).filter(Boolean);
    const match = forcedSlot
      ? slots.includes(forcedSlot) ? forcedSlot : null
      : slots.find((s) => Math.abs(now.hourly - toMinutes(s)) <= WINDOW_MIN) || null;
    if (match) due.set(p.user_id, { slot: match, date: now.date });
  }
  if (!due.size) return NextResponse.json({ ok: true, sent: 0, users: 0, note: "not a notification slot" });

  const userIds = [...due.keys()];

  // claim each slot once per day (idempotent even if the cron double-fires)
  const claims: { user_id: string; kind: string; dedupe_key: string }[] = [];
  for (const [uid, { slot, date }] of due) claims.push({ user_id: uid, kind: "push_summary", dedupe_key: `push:${date}:${slot}` });

  const { data: claimed, error: claimErr } = await db
    .from("notification_logs")
    .upsert(claims, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("user_id, dedupe_key");
  if (claimErr) return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 });
  const claimedUsers = new Set((claimed || []).map((r) => (r as { user_id: string }).user_id));
  if (!claimedUsers.size) return NextResponse.json({ ok: true, sent: 0, users: 0, note: "already sent" });

  const active = [...due.entries()].filter(([uid]) => claimedUsers.has(uid));

  const { data: taskRows } = await db
    .from("tasks")
    .select("user_id, title, deadline_date, priority, is_today_focus, status, archived, trashed_at")
    .in("user_id", active.map(([uid]) => uid));
  const tasks = (taskRows || []) as TaskRow[];

  const { data: subRows } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", active.map(([uid]) => uid));
  const subsByUser = new Map<string, Sub[]>();
  for (const s of (subRows || []) as Sub[]) {
    const list = subsByUser.get(s.user_id) || [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  let sent = 0;
  let removed = 0;
  const deadIds: string[] = [];

  for (const [uid, { slot, date }] of active) {
    const subs = subsByUser.get(uid) || [];
    if (!subs.length) continue;
    const { title, body } = buildMessage(slot, tasks.filter((t) => t.user_id === uid), date);
    const payload = JSON.stringify({
      title,
      body,
      url: "/my-day",
      tag: `tf-${slot}`,
      icon: "/icons/icon-192.png"
    });
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) deadIds.push(s.id);
          else console.warn("push failed", status, (e as Error).message);
        }
      })
    );
  }

  if (deadIds.length) {
    await db.from("push_subscriptions").delete().in("id", deadIds);
    removed = deadIds.length;
  }

  return NextResponse.json({ ok: true, users: active.length, sent, removed });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
