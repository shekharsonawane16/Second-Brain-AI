"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { BarChart3 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

export default function AnalyticsPage() {
  const { tasks, categories } = useStore();
  const [range, setRange] = useState("30");
  const live = useMemo(() => tasks.filter((t) => !t.trashed_at && !t.archived), [tasks]);

  const stats = useMemo(() => {
    const cutoff = new Date(Date.now() - Number(range) * 86400000).toISOString();
    const inRange = live.filter((t) => (t.created_at || "") >= cutoff);
    const created = inRange.length;
    const done = inRange.filter((t) => t.status === "completed").length;
    const rate = created ? Math.round((done / created) * 100) : 0;
    const byCat = categories.filter((c) => !c.archived).map((c) => {
      const ct = live.filter((t) => t.category_id === c.id && t.status !== "completed");
      return { name: c.name, pending: ct.length, color: c.color };
    }).filter((x) => x.pending > 0);
    const pri = [
      { name: "Critical", value: live.filter((t) => t.status !== "completed" && t.priority === "critical").length, color: "#EF4444" },
      { name: "High", value: live.filter((t) => t.status !== "completed" && t.priority === "high").length, color: "#F59E0B" },
      { name: "Normal", value: live.filter((t) => t.status !== "completed" && t.priority === "normal").length, color: "#64748B" }
    ];
    // weekly productivity (last 8 weeks)
    const weeks: { week: string; created: number; done: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date(Date.now() - (i + 1) * 7 * 86400000).toISOString();
      const end = new Date(Date.now() - i * 7 * 86400000).toISOString();
      weeks.push({
        week: `W-${7 - i}`,
        created: live.filter((t) => t.created_at >= start && t.created_at < end).length,
        done: live.filter((t) => (t.completed_at || "") >= start && (t.completed_at || "") < end).length
      });
    }
    // avg completion time (days) where data exists
    const withBoth = live.filter((t) => t.status === "completed" && t.completed_at && t.created_at);
    const avgDays = withBoth.length
      ? (withBoth.reduce((s, t) => s + (new Date(t.completed_at as string).getTime() - new Date(t.created_at).getTime()) / 86400000, 0) / withBoth.length)
      : null;
    return { created, done, rate, byCat, pri, weeks, avgDays, n: withBoth.length };
  }, [live, categories, range]);

  const hasData = live.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Neutral, helpful stats from your real data.</p></div>
        <select value={range} onChange={(e) => setRange(e.target.value)} className="input max-w-[160px]" aria-label="Date range">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="3650">All time</option>
        </select>
      </div>

      {!hasData ? (
        <EmptyState icon={BarChart3} title="Not enough data yet" body="Complete a few tasks and analytics will appear here. No charts are invented." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[["Created", stats.created], ["Completed", stats.done], ["Completion rate", `${stats.rate}%`], ["Avg. completion", stats.avgDays === null ? "—" : `${stats.avgDays.toFixed(1)} days`]].map(([k, v]) => (
              <div key={k} className="card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Created vs completed · last 8 weeks</h2>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.weeks}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232E52" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#8b93a7" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#8b93a7" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#151D32", border: "1px solid #2a3560", borderRadius: 10, fontSize: 12 }} />
                    <Legend />
                    <Bar dataKey="created" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="done" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Priority distribution (active)</h2>
              {stats.pri.every((p) => p.value === 0) ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No active tasks to distribute.</p>
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats.pri} dataKey="value" nameKey="name" outerRadius={90} label>
                        {stats.pri.map((p) => <Cell key={p.name} fill={p.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#151D32", border: "1px solid #2a3560", borderRadius: 10, fontSize: 12 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Pending by section</h2>
            {stats.byCat.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No pending tasks. Everything is done or trashed.</p>
            ) : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byCat} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#232E52" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#8b93a7" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#c6cde0" }} />
                    <Tooltip contentStyle={{ background: "#151D32", border: "1px solid #2a3560", borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="pending" fill="#6366F1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {stats.avgDays !== null && <p className="mt-2 text-[11px] text-muted-foreground">Average completion time from {stats.n} completed task(s). Tasks without timestamps are excluded.</p>}
          </div>
        </>
      )}
    </div>
  );
}
