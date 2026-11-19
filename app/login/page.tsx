"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Brain, CalendarClock, CloudOff, LineChart, Loader2, ShieldCheck, Zap } from "lucide-react";
import { useStore } from "@/lib/store";
import { InstallAppButton } from "@/components/install-app";
import { isSupabaseConfigured } from "@/lib/supabase";
import { BRAND } from "@/lib/brand";

const FEATURES = [
  { icon: Zap, title: "Deadline intelligence", body: "Priorities recalculate automatically as deadlines approach." },
  { icon: CalendarClock, title: "Calendar & reminders", body: "See your week, get push reminders at 6 AM, 12 PM and 6 PM." },
  { icon: LineChart, title: "Honest analytics", body: "Completion trends and workload insights from your real data." },
  { icon: CloudOff, title: "Works offline", body: "Installable app with offline access and cross-device sync." }
];

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, user, authLoading } = useStore();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [authLoading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError("Enter a valid email address."); return; }
    if (isSupabaseConfigured && password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setBusy(true);
    const res = mode === "in"
      ? await signIn(email.trim(), password || "taskflow-demo")
      : await signUp(email.trim(), password || "taskflow-demo", name.trim() || undefined);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.notice) { setNotice(res.notice); return; }
    router.replace("/");
  }

  async function onGoogle() {
    setError("");
    setNotice("");
    setGoogleBusy(true);
    const res = await signInWithGoogle();
    setGoogleBusy(false);
    if (res.error) { setError(res.error); return; }
    // success → browser redirects to Google, then back here
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />

      <div className="relative grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <section className="hidden lg:block">
          <div className="flex items-center gap-3">
            <img src="/brain.png" alt="" width={44} height={44} className="rounded-xl" style={{ height: 44, width: 44 }} />
            <div>
              <p className="text-sm font-bold tracking-tight">{BRAND.name}</p>
              <p className="text-[11px] text-muted-foreground">{BRAND.tagline}</p>
            </div>
          </div>

          <h1 className="mt-8 text-4xl font-bold leading-[1.15] tracking-tight">
            One calm place for<br />
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">everything you need to remember.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Capture what matters, organise your responsibilities and let deadlines decide what deserves attention next.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="surface rounded-xl p-3.5">
                <f.icon size={16} className="text-indigo-400" />
                <p className="mt-2 text-[13px] font-semibold">{f.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck size={13} className="text-emerald-400" />
            Your data is private to your account. Sync is encrypted in transit.
          </div>
        </section>

        {/* Auth card */}
        <div className="card w-full p-6 shadow-soft sm:p-7">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <img src="/brain.png" alt="" width={40} height={40} className="rounded-xl" style={{ height: 40, width: 40 }} />
            <div>
              <p className="text-sm font-bold">{BRAND.name}</p>
              <p className="text-[10px] text-muted-foreground">{BRAND.tagline}</p>
            </div>
          </div>

          <div className="mb-1 flex items-center gap-2">
            <Brain size={17} className="text-indigo-400" />
            <h2 className="text-lg font-bold tracking-tight">{mode === "in" ? "Welcome back" : "Create your space"}</h2>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {isSupabaseConfigured
              ? "Sign in to sync tasks across your devices."
              : "Local demo mode — data stays in this browser. Add Supabase keys in .env.local for cloud sync."}
          </p>

          <button
            type="button"
            onClick={onGoogle}
            disabled={googleBusy || !isSupabaseConfigured}
            title={isSupabaseConfigured ? "Continue with Google" : "Google sign-in needs Supabase keys"}
            className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition hover:border-indigo-400/60 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
            )}
            {googleBusy ? "Opening Google…" : "Continue with Google"}
          </button>

          <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {(["in", "up"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(""); setNotice(""); }} className={`flex-1 rounded-md py-1.5 font-medium transition ${mode === m ? "bg-card shadow" : "text-muted-foreground hover:text-foreground"}`}>
                {m === "in" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            {mode === "up" && (
              <label className="block text-xs font-medium">Display name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="input mt-1" autoComplete="name" />
              </label>
            )}
            <label className="block text-xs font-medium">Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" className="input mt-1" autoComplete="email" />
            </label>
            <label className="block text-xs font-medium">Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSupabaseConfigured ? "At least 6 characters" : "optional in local mode"}
                type="password"
                className="input mt-1"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
              />
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}
            {notice && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300">{notice}</div>
            )}

            <button disabled={busy} className="btn-primary flex w-full items-center justify-center gap-2">
              {busy && <Loader2 size={15} className="animate-spin" />}
              {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-3"><InstallAppButton variant="login" /></div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {isSupabaseConfigured
              ? "Secured by Supabase Auth. If sign-up asks you to confirm your email, do that before signing in."
              : "Local mode stores data in this browser only. Nothing is uploaded."}
          </p>
        </div>
      </div>
    </div>
  );
}
