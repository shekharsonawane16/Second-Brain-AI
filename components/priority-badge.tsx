"use client";
import { AlertOctagon, ArrowUp, Minus } from "lucide-react";
import type { Priority } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAP: Record<Priority, { label: string; cls: string; Icon: typeof Minus }> = {
  critical: { label: "Critical", cls: "bg-red-500/12 text-red-400 border-red-500/30", Icon: AlertOctagon },
  high: { label: "High", cls: "bg-amber-500/12 text-amber-400 border-amber-500/30", Icon: ArrowUp },
  normal: { label: "Normal", cls: "bg-slate-500/12 text-slate-400 border-slate-500/30", Icon: Minus }
};

export function PriorityBadge({ priority, size = "sm" }: { priority: Priority; size?: "sm" | "xs" }) {
  const { label, cls, Icon } = MAP[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        cls,
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"
      )}
      title={`Priority: ${label}`}
    >
      <Icon size={size === "xs" ? 11 : 13} aria-hidden />
      {label}
    </span>
  );
}
