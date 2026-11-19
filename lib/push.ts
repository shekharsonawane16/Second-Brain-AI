import { getSupabaseBrowser } from "./supabase";

export type PushState = "unsupported" | "denied" | "off" | "on" | "needs-install" | "error";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

function isIosNotInstalled(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (isIosNotInstalled()) return "needs-install";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) return "on";
  } catch {
    /* ignore */
  }
  return "off";
}

export async function enablePush(): Promise<{ state: PushState; error?: string }> {
  if (!pushSupported()) return { state: "unsupported", error: "This browser does not support push notifications." };
  if (isIosNotInstalled()) {
    return { state: "needs-install", error: "On iPhone, first add Second Brain AI to your Home Screen, then enable notifications." };
  }
  if (!VAPID_PUBLIC) return { state: "error", error: "Push is not configured (missing VAPID public key)." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      state: permission === "denied" ? "denied" : "off",
      error:
        permission === "denied"
          ? "Notifications are blocked for this site. Click the lock/settings icon at the left of the address bar → Notifications → Allow, then reload the page."
          : "The permission prompt was dismissed or hidden. Click Enable again and choose Allow when the browser asks."
    };
  }

  const reg = await getRegistration();
  if (!reg) return { state: "error", error: "Service worker is not available." };
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    } catch (e) {
      return { state: "error", error: e instanceof Error ? e.message : "Could not subscribe to push." };
    }
  }

  const sb = getSupabaseBrowser();
  if (!sb) return { state: "error", error: "Cloud mode is not configured." };
  const { data } = await sb.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { state: "error", error: "Sign in again to enable notifications." };

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { state: "error", error: "This browser returned an incomplete subscription. Try another browser." };
  }
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      last_seen: new Date().toISOString()
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    const missingTable = error.code === "PGRST205" || error.code === "42P01";
    return {
      state: "error",
      error: missingTable ? "Push is not set up in the database yet — run the push SQL in Supabase, then reload." : error.message
    };
  }

  return { state: "on" };
}

export async function disablePush(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseBrowser();
  try {
    const reg = await getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (sb) await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not disable push." };
  }
}

export async function sendTestPush(): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const sb = getSupabaseBrowser();
  if (!sb) return { ok: false, error: "Cloud mode is not configured." };
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Sign in again to test notifications." };
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; sent?: number };
    if (!res.ok || !json.ok) return { ok: false, error: json.error || `Request failed (${res.status}).` };
    if (!json.sent) return { ok: false, error: "No device is subscribed yet — enable notifications first." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
