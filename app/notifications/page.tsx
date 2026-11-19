"use client";
import { useMemo, useState } from "react";
import { AlertOctagon, Bell, BellOff, CheckCheck, Clock3, Sunrise } from "lucide-react";
import { useStore } from "@/lib/store";
import type { NotificationItem } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

const KIND_META: Record<NotificationItem["kind"], { icon: typeof Bell; cls: string; label: string }> = {
  overdue: { icon: AlertOctagon, cls: "bg-red-500/15 text-red-400", label: "Overdue" },
  due_soon: { icon: Clock3, cls: "bg-amber-500/15 text-amber-400", label: "Due soon" },
  daily_summary: { icon: Sunrise, cls: "bg-indigo-500/15 text-indigo-400", label: "Daily summary" },
  info: { icon: Bell, cls: "bg-slate-500/15 text-slate-400", label: "Info" }
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function dayBucket(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return "Earlier";
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markNotifRead, markAllNotifRead, setDetailTaskId, tasks } = useStore();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const list = useMemo(() => {
    const arr = [...notifications].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return filter === "unread" ? arr.filter((n) => !n.read) : arr;
  }, [notifications, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const n of list) {
      const k = dayBucket(n.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return [...map.entries()];
  }, [list]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Bell}
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread reminder${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
        actions={
          <>
            <button className="btn-ghost" onClick={markAllNotifRead} disabled={unreadCount === 0}>
              <CheckCheck size={15} /> Mark all read
            </button>
          </>
        }
      />

      <div className="flex items-center gap-1.5">
        {(["all", "unread"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("chip", filter === f && "chip-active")}>
            {f === "all" ? `All (${notifications.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
          body="Deadline reminders and daily summaries appear here. Enable push notifications in Settings for background delivery."
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([label, items]) => (
            <section key={label}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
              <div className="space-y-2">
                {items.map((n) => {
                  const meta = KIND_META[n.kind];
                  const task = n.task_id ? tasks.find((t) => t.id === n.task_id) : null;
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        markNotifRead(n.id);
                        if (n.task_id) {
                          const still = tasks.find((t) => t.id === n.task_id && !t.trashed_at);
                          if (still) setDetailTaskId(n.task_id);
                        }
                      }}
                      className={cn("card card-hover flex w-full items-start gap-3 p-3.5 text-left", !n.read && "border-indigo-500/40 bg-indigo-500/[0.04]")}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.cls)}>
                        <meta.icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("truncate text-sm", n.read ? "font-medium" : "font-semibold")}>{n.title}</span>
                          {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.body}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="rounded-full border px-1.5 py-0.5 font-medium">{meta.label}</span>
                          {task && <span className="truncate">· {task.title}</span>}
                          <span>· {timeAgo(n.created_at)}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
