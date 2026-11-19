import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!url || !anon) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ ok: false, error: "Push is not configured on the server (missing VAPID keys)." }, { status: 500 });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:notifications@taskflow.app", vapidPublic, vapidPrivate);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });

  // RLS guarantees only this user's subscriptions are returned
  const { data: subs, error } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!subs || !subs.length) return NextResponse.json({ ok: true, sent: 0 });

  const payload = JSON.stringify({
    title: "TaskFlow notifications are on",
    body: "You'll get your pending tasks at 6:00 AM, 12:00 PM and 6:00 PM.",
    url: "/my-day",
    tag: "tf-test"
  });

  let sent = 0;
  const dead: string[] = [];
  const reasons: string[] = [];
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 300 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        const msg = (e as Error).message || "unknown";
        if (status === 404 || status === 410) dead.push(s.id);
        console.warn("test push failed", status, msg);
        reasons.push(`${status || "ERR"}: ${msg.slice(0, 120)}`);
      }
    })
  );

  if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);

  return NextResponse.json({ ok: true, sent, failed: reasons.length, reasons, removed: dead.length });
}
