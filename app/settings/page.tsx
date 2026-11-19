"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { downloadFile, toCSV } from "@/lib/utils";
import { BellRing, BrainCircuit, Loader2, Smartphone } from "lucide-react";
import { enablePush, disablePush, getPushState, sendTestPush, type PushState } from "@/lib/push";
import { AiStatusBanner } from "@/components/ai-status-banner";
import { fetchAiStatus } from "@/lib/ai/client";
import type { AiStatus } from "@/lib/ai/types";

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];

const PUSH_SLOTS = [
  { value: "06:00", label: "6:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "18:00", label: "6:00 PM" }
];

function PushSection() {
  const { notifPrefs, updateNotifPrefs, pushToast, settings } = useStore();
  const [state, setState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { getPushState().then(setState); }, []);

  const onEnable = async () => {
    setBusy(true);
    const res = await enablePush();
    setBusy(false);
    setState(res.state);
    if (res.error) {
      pushToast({ kind: "error", title: "Notifications", body: res.error });
      return;
    }
    pushToast({ kind: "success", title: "Push notifications enabled", body: "You'll be reminded at your chosen times." });
    setTesting(true);
    const t = await sendTestPush();
    setTesting(false);
    if (t.ok && t.warning) pushToast({ kind: "error", title: "Sent, but some devices failed", body: t.warning });
    else if (t.ok) pushToast({ kind: "success", title: "Test notification sent", body: "Check your notification tray." });
    else pushToast({ kind: "error", title: "Test failed", body: t.error });
  };

  const onDisable = async () => {
    setBusy(true);
    const res = await disablePush();
    setBusy(false);
    if (res.ok) {
      setState("off");
      pushToast({ kind: "info", title: "Push notifications turned off for this device" });
    } else {
      pushToast({ kind: "error", title: "Could not disable", body: res.error });
    }
  };

  const onTest = async () => {
    setTesting(true);
    const t = await sendTestPush();
    setTesting(false);
    if (t.ok && t.warning) pushToast({ kind: "error", title: "Sent, but some devices failed", body: t.warning });
    else if (t.ok) pushToast({ kind: "success", title: "Test notification sent", body: "Check your notification tray." });
    else pushToast({ kind: "error", title: "Test failed", body: t.error });
  };

  const on = state === "on";

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><BellRing size={16} className="text-indigo-400" /> Push notifications</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Get today&apos;s pending tasks on your phone and laptop — even when Second Brain AI is closed.
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${on ? "bg-emerald-500/15 text-emerald-400" : state === "denied" ? "bg-red-500/15 text-red-400" : "bg-muted text-muted-foreground"}`}>
          {state === "on" ? "On" : state === "denied" ? "Blocked" : state === "unsupported" ? "Unsupported" : state === "needs-install" ? "Install first" : "Off"}
        </span>
      </div>

      <div className="rounded-lg border p-2.5 text-xs text-muted-foreground">
        {state === "needs-install" ? (
          <span className="flex items-start gap-2"><Smartphone size={14} className="mt-0.5 shrink-0" /> On iPhone, add Second Brain AI to your Home Screen first (Share → Add to Home Screen), then enable notifications here.</span>
        ) : state === "denied" ? (
          <div className="space-y-1.5">
            <p>Notifications are blocked for this site. To fix it:</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Click the <b>lock / tune icon</b> at the left of the address bar.</li>
              <li>Set <b>Notifications</b> to <b>Allow</b> (Chrome: Site settings → Notifications).</li>
              <li>On Windows also check Settings → System → Notifications is turned on.</li>
              <li>Reload this page.</li>
            </ol>
            <button className="btn-ghost text-xs" onClick={() => window.location.reload()}>Reload page</button>
          </div>
        ) : state === "unsupported" ? (
          <span>This browser does not support web push. Use Chrome on Android or Safari on iOS 16.4+ (installed app).</span>
        ) : on ? (
          <span>This device is subscribed. Notifications are delivered by the Second Brain AI scheduler.</span>
        ) : (
          <span>Allow notifications when asked. On Android/desktop Chrome, Windows and macOS it appears as a normal system notification; on iPhone it requires the installed app.</span>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium">Notify me at</p>
        <div className="flex flex-wrap gap-1.5">
          {PUSH_SLOTS.map((s) => {
            const active = notifPrefs.push_slots.includes(s.value);
            return (
              <button
                key={s.value}
                onClick={() => updateNotifPrefs({
                  push_slots: active ? notifPrefs.push_slots.filter((x) => x !== s.value) : [...notifPrefs.push_slots, s.value].sort()
                })}
                className={`rounded-lg border px-2.5 py-1 text-xs ${active ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-300" : "text-muted-foreground hover:bg-muted"}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Times use your timezone ({settings.timezone}).</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {on ? (
          <>
            <button className="btn-ghost text-xs" onClick={onDisable} disabled={busy}>{busy ? "Working…" : "Turn off on this device"}</button>
            <button className="btn-ghost flex items-center gap-1 text-xs" onClick={onTest} disabled={testing}>
              {testing && <Loader2 size={12} className="animate-spin" />} Send test notification
            </button>
          </>
        ) : (
          <button className="btn-primary flex items-center gap-1.5 text-xs" onClick={onEnable} disabled={busy || state === "unsupported" || state === "needs-install"}>
            {busy && <Loader2 size={13} className="animate-spin" />} Enable push notifications
          </button>
        )}
      </div>
    </section>
  );
}

function AiSettingsSection() {
  const { settings, updateSettings } = useStore();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await fetchAiStatus());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not check AI status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><BrainCircuit size={16} className="text-indigo-400" /> AI intelligence</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          AI runs on the server. Your provider key is never sent to this browser. Extraction, chat and embeddings use only your own workspace data.
        </p>
      </div>

      <AiStatusBanner status={status} error={error} loading={loading} onRefresh={load} />

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">AI response language
          <select
            value={settings.ai_language}
            onChange={(event) => updateSettings({ ai_language: event.target.value as typeof settings.ai_language })}
            className="input mt-1"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="mr">मराठी (Marathi)</option>
          </select>
          <span className="mt-1 block text-[10px] text-muted-foreground">Used for extraction summaries, assistant answers and breakdowns.</span>
        </label>
        <div className="text-xs">
          <span>Memory indexing</span>
          <label className="mt-2 flex items-start gap-2 rounded-lg border p-2.5">
            <input
              type="checkbox"
              checked={settings.ai_auto_index}
              onChange={(event) => updateSettings({ ai_auto_index: event.target.checked })}
              className="mt-0.5 h-4 w-4 accent-indigo-500"
            />
            <span>
              <span className="block font-medium">Index approved items automatically</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">Creates semantic memory for approved inbox captures and AI-created tasks/notes.</span>
            </span>
          </label>
        </div>
      </div>

      <p className="rounded-lg border p-2.5 text-[10px] text-muted-foreground">
        Provider setup is controlled by server environment variables such as <code>AI_API_KEY</code>, <code>AI_BASE_URL</code>, <code>AI_MODEL</code> and <code>AI_EMBEDDING_MODEL</code>. See <code>.env.example</code> and the README.
      </p>
    </section>
  );
}

export default function SettingsPage() {
  const {
    user, settings, updateSettings, notifPrefs, updateNotifPrefs,
    requestBrowserPermission, exportJSON, importTasks, tasks, signOut, pushToast
  } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div><h1 className="text-xl font-bold">Settings</h1>
      <p className="text-sm text-muted-foreground">Profile, appearance, timezone, reminders and data controls.</p></div>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">Display name<input value={settings.display_name} onChange={(e) => updateSettings({ display_name: e.target.value })} className="input mt-1" placeholder={user?.display_name} /></label>
          <label className="text-xs">Email<input value={user?.email || ""} disabled className="input mt-1 opacity-60" /></label>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Appearance & locale</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">Theme
            <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as typeof settings.theme })} className="input mt-1">
              <option value="dark">Dark (default)</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="text-xs">Timezone (deadlines use this calendar date)
            <select value={settings.timezone} onChange={(e) => updateSettings({ timezone: e.target.value })} className="input mt-1">
              {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label className="text-xs">Date format
            <select value={settings.date_format} onChange={(e) => updateSettings({ date_format: e.target.value as typeof settings.date_format })} className="input mt-1">
              <option value="dd/MM/yyyy">DD/MM/YYYY</option>
              <option value="MM/dd/yyyy">MM/DD/YYYY</option>
              <option value="yyyy-MM-dd">YYYY-MM-DD</option>
            </select>
          </label>
          <label className="text-xs">Default sort
            <select value={settings.default_sort} onChange={(e) => updateSettings({ default_sort: e.target.value as typeof settings.default_sort })} className="input mt-1">
              <option value="priority">Priority</option>
              <option value="deadline">Earliest deadline</option>
              <option value="created">Recently created</option>
              <option value="updated">Recently updated</option>
              <option value="alpha">Alphabetical</option>
            </select>
          </label>
          <label className="text-xs">Daily focus limit
            <input type="number" min={1} max={20} value={settings.daily_focus_limit} onChange={(e) => updateSettings({ daily_focus_limit: Number(e.target.value) || 5 })} className="input mt-1" />
          </label>
        </div>
      </section>

      <AiSettingsSection />

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Reminders</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifPrefs.enabled} onChange={(e) => updateNotifPrefs({ enabled: e.target.checked })} className="h-4 w-4 accent-indigo-500" />
          Enable in-app reminders
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notifPrefs.overdue_alerts} onChange={(e) => updateNotifPrefs({ overdue_alerts: e.target.checked })} className="h-4 w-4 accent-indigo-500" />
          Alert when tasks become overdue
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span>Remind me</span>
          {[0, 1, 3, 7].map((d) => (
            <label key={d} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
              <input
                type="checkbox"
                checked={notifPrefs.days_before.includes(d)}
                onChange={(e) => {
                  const cur = notifPrefs.days_before;
                  updateNotifPrefs({ days_before: e.target.checked ? [...cur, d] : cur.filter((x) => x !== d) });
                }}
                className="accent-indigo-500"
              />{d === 0 ? "due day" : `${d}d before`}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-xs" onClick={requestBrowserPermission}>Enable browser notifications</button>
          <span className="text-xs text-muted-foreground">Status: {typeof Notification !== "undefined" ? Notification.permission : "unsupported"}. In-app reminders only fire while Second Brain AI is open — use push notifications below for background delivery.</span>
        </div>
      </section>

      <PushSection />

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Backup, export & import</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost text-xs" onClick={() => downloadFile(`taskflow-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON())}>Export JSON backup</button>
          <button
            className="btn-ghost text-xs"
            onClick={() => {
              const cols = ["id", "title", "description", "deadline_date", "status", "priority", "created_at", "completed_at"];
              downloadFile(`taskflow-tasks-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(tasks.map((t) => ({ ...t } as Record<string, unknown>)), cols), "text/csv");
            }}
          >Export CSV</button>
          <button className="btn-ghost text-xs" onClick={() => fileRef.current?.click()}>Import CSV / JSON</button>
          <input
            ref={fileRef} type="file" accept=".csv,.json" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              try {
                let arr: unknown[] = [];
                if (f.name.endsWith(".json")) {
                  const j = JSON.parse(text);
                  arr = Array.isArray(j) ? j : (j.tasks || []);
                } else {
                  const lines = text.split("\n").filter(Boolean);
                  const headers = lines[0].split(",").map((h) => h.trim());
                  arr = lines.slice(1).map((ln) => {
                    const cells = ln.split(",");
                    const o: Record<string, string> = {};
                    headers.forEach((h, i) => (o[h] = (cells[i] || "").trim()));
                    return o;
                  });
                }
                const r = importTasks(arr);
                pushToast({ kind: "success", title: `Imported ${r.ok}`, body: `${r.skipped} skipped (invalid/duplicate).` });
              } catch { pushToast({ kind: "error", title: "Import failed", body: "Invalid file format." }); }
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">JSON backups include tasks, sections, checklist notes, smart notes, projects, the knowledge library and focus sessions. Store the JSON file safely — restore via Import. Long-term availability depends on your Supabase project status and backups (see README).</p>
      </section>

      <section className="card space-y-3 border-red-500/30 p-4">
        <h2 className="font-semibold text-red-400">Account</h2>
        <button className="btn-ghost text-xs" onClick={signOut}>Sign out (data is kept)</button>
        <div>
          <p className="text-xs text-muted-foreground">Delete account data in this browser. Type <code>DELETE</code> to confirm. Cloud data must be removed from Supabase dashboard.</p>
          <div className="mt-2 flex gap-2">
            <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="Type DELETE" className="input max-w-48" />
            <button
              disabled={confirmDelete !== "DELETE"}
              className="rounded-[10px] border border-red-500/40 px-4 py-2 text-sm text-red-400 disabled:opacity-40"
              onClick={() => {
                Object.keys(localStorage).filter((k) => k.startsWith("tf:")).forEach((k) => localStorage.removeItem(k));
                location.href = "/login";
              }}
            >Erase local data</button>
          </div>
        </div>
      </section>
    </div>
  );
}
