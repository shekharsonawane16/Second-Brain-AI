"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Download, MoreVertical, Share, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/utils";

type BipEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __tfBip?: BipEvent;
  }
}

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(detectIos());
    setInstalled(detectStandalone());

    const sync = () => setCanInstall(Boolean(window.__tfBip));
    sync();

    const onBip = (e: Event) => {
      e.preventDefault();
      window.__tfBip = e as BipEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      window.__tfBip = undefined;
      setCanInstall(false);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("tf:installable", sync);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("tf:installable", sync);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const evt = window.__tfBip;
    if (!evt) return "unavailable";
    await evt.prompt();
    const choice = await evt.userChoice;
    window.__tfBip = undefined;
    setCanInstall(false);
    if (choice.outcome === "accepted") setInstalled(true);
    return choice.outcome;
  }, []);

  return { canInstall, installed, ios, promptInstall };
}

export function InstallAppButton({
  variant = "sidebar",
  className
}: {
  variant?: "sidebar" | "icon" | "login" | "menu";
  className?: string;
}) {
  const { canInstall, installed, ios, promptInstall } = useInstall();
  const [sheet, setSheet] = useState(false);
  const [copied, setCopied] = useState(false);

  if (installed) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const start = async () => {
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === "unavailable") setSheet(true);
      return;
    }
    setSheet(true);
  };

  const label = ios ? "Add to Home Screen" : "Download app";

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={start}
          className={cn("rounded-lg border p-2 hover:bg-muted md:hidden", className)}
          aria-label={label}
          title={label}
        >
          <Download size={17} />
        </button>
      ) : variant === "login" ? (
        <button type="button" onClick={start} className={cn("btn-ghost flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm", className)}>
          <Smartphone size={15} /> {label}
        </button>
      ) : variant === "menu" ? (
        <button type="button" onClick={start} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-muted", className)}>
          <Download size={15} className="text-muted-foreground" /> {label}
        </button>
      ) : (
        <button
          onClick={start}
          className={cn("mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-300 hover:bg-muted", className)}
        >
          <Download size={14} /> Download app
        </button>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setSheet(false)}>
          <div className="card w-full max-w-sm p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-xl" />
                <div>
                  <p className="text-sm font-bold">Get Second Brain AI on your phone</p>
                  <p className="text-[11px] text-muted-foreground">Installs like a real app — icon on your home screen, full screen, works offline.</p>
                </div>
              </div>
              <button onClick={() => setSheet(false)} aria-label="Close" className="rounded p-1 hover:bg-muted"><X size={16} /></button>
            </div>

            {canInstall ? (
              <button onClick={() => promptInstall().then((o) => o === "accepted" && setSheet(false))} className="btn-primary flex w-full items-center justify-center gap-2">
                <Download size={15} /> Install Second Brain AI
              </button>
            ) : ios ? (
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2 rounded-lg border p-2"><Share size={15} className="shrink-0 text-indigo-300" />Tap the <strong>Share</strong> button in Safari</li>
                <li className="flex items-center gap-2 rounded-lg border p-2"><Smartphone size={15} className="shrink-0 text-indigo-300" />Choose <strong>Add to Home Screen</strong></li>
                <li className="flex items-center gap-2 rounded-lg border p-2"><Check size={15} className="shrink-0 text-emerald-400" />Tap <strong>Add</strong> — Second Brain AI appears on your home screen</li>
              </ol>
            ) : (
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2 rounded-lg border p-2"><Smartphone size={15} className="shrink-0 text-indigo-300" />Open <strong>{typeof window !== "undefined" ? window.location.host : "this site"}</strong> on your phone</li>
                <li className="flex items-center gap-2 rounded-lg border p-2"><MoreVertical size={15} className="shrink-0 text-indigo-300" />Chrome menu <strong>⋮ → Install app</strong> (or <strong>Add to Home screen</strong>)</li>
                <li className="flex items-center gap-2 rounded-lg border p-2"><Check size={15} className="shrink-0 text-emerald-400" />Confirm — Second Brain AI opens full screen like an app</li>
              </ol>
            )}

            <button onClick={copyLink} className="btn-ghost mt-3 flex w-full items-center justify-center gap-2 rounded-lg border py-2 text-xs">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Share size={14} />}
              {copied ? "Link copied" : "Copy link to open on my phone"}
            </button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">Android, iPhone and desktop install supported. No app store needed.</p>
          </div>
        </div>
      )}
    </>
  );
}
