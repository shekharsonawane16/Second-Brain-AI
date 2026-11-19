"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={onCancel}>
      <div className="card scale-in w-full max-w-sm p-5 shadow-soft" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone === "danger" ? "bg-red-500/15 text-red-400" : "bg-indigo-500/15 text-indigo-400"}`}>
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
            {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button autoFocus className={tone === "danger" ? "btn-danger" : "btn-primary"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
