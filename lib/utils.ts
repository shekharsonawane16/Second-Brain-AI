import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function greetingForHour(h: number): string {
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

const MOTIVATION = [
  "Let's focus on what matters today.",
  "Small steps every day lead to big results.",
  "Clarity today, calm tomorrow.",
  "Do the hardest thing first — the rest gets easier.",
  "Progress, not perfection.",
  "Your future self will thank you for today."
];

export function motivationalMessage(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return MOTIVATION[h % MOTIVATION.length];
}

export function formatDateLabel(iso: string | null, dateFormat = "dd/MM/yyyy"): string {
  if (!iso) return "—";
  const d = iso.length <= 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const yyyy = `${d.getFullYear()}`;
  if (dateFormat === "MM/dd/yyyy") return `${mm}/${dd}/${yyyy}`;
  if (dateFormat === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
  return `${dd}/${mm}/${yyyy}`;
}

export function downloadFile(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}
