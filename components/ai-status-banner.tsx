"use client";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { AiStatus } from "@/lib/ai/types";

export function AiStatusBanner({
  status,
  error,
  loading,
  onRefresh
}: {
  status: AiStatus | null;
  error: string | null;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  if (loading) {
    return (
      <div className="card flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Checking AI configuration...
      </div>
    );
  }
  if (error) {
    return (
      <div className="card flex items-start gap-2 border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-300">AI is unavailable</p>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="btn-icon !p-1.5" aria-label="Retry AI status">
            <RefreshCw size={13} />
          </button>
        )}
      </div>
    );
  }
  if (!status) return null;
  if (!status.configured) {
    return (
      <div className="card flex items-start gap-2 border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
        <div>
          <p className="font-semibold text-amber-300">Connect an AI provider</p>
          <p className="mt-0.5 text-muted-foreground">
            Add server-side <code>AI_API_KEY</code>, <code>AI_BASE_URL</code> and <code>AI_MODEL</code>.
            {status.missing.length ? ` Missing: ${status.missing.join(", ")}.` : ""} Captures are saved, but extraction stays queued until this is configured.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="card flex items-center gap-2 border-emerald-500/25 bg-emerald-500/5 p-2.5 text-[11px] text-muted-foreground">
      <CheckCircle2 size={14} className="text-emerald-400" />
      <span>
        AI ready · {status.provider} · <b className="text-foreground">{status.model}</b>
      </span>
      <span className="ml-auto flex items-center gap-2">
        {status.vision && <span>Vision</span>}
        {status.transcription && <span>Audio</span>}
        {status.embeddings && <span>Memory</span>}
        {onRefresh && (
          <button onClick={onRefresh} className="text-indigo-400 hover:underline" aria-label="Refresh AI status">
            Refresh
          </button>
        )}
      </span>
    </div>
  );
}
