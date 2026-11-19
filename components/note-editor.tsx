"use client";
import { useRef, useState } from "react";
import {
  Bold, Code2, Eye, Heading2, Italic, Link2, List, ListChecks, ListOrdered, Pencil, Quote
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

export function NoteEditor({ value, onChange, rows = 18, placeholder = "Start writing. Markdown shortcuts work: # heading, **bold**, - list, - [ ] checklist." }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  const replaceSelection = (before: string, after = "", fallback = "text", prefixLine = false) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    let next: string;
    let cursor: number;
    if (prefixLine) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      next = `${value.slice(0, lineStart)}${before}${value.slice(lineStart)}`;
      cursor = end + before.length;
      onChange(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
      return;
    }
    next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    cursor = start + before.length + selected.length;
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  };

  const tools = [
    { label: "Bold", icon: Bold, run: () => replaceSelection("**", "**", "bold text") },
    { label: "Italic", icon: Italic, run: () => replaceSelection("*", "*", "italic text") },
    { label: "Heading", icon: Heading2, run: () => replaceSelection("## ", "", "Heading", true) },
    { label: "Bullet list", icon: List, run: () => replaceSelection("- ", "", "List item", true) },
    { label: "Numbered list", icon: ListOrdered, run: () => replaceSelection("1. ", "", "List item", true) },
    { label: "Checklist", icon: ListChecks, run: () => replaceSelection("- [ ] ", "", "Checklist item", true) },
    { label: "Quote", icon: Quote, run: () => replaceSelection("> ", "", "Quote", true) },
    { label: "Inline code", icon: Code2, run: () => replaceSelection("`", "`", "code") },
    { label: "Link", icon: Link2, run: () => replaceSelection("[", "](https://)", "link text") }
  ];

  return (
    <div className="overflow-hidden rounded-xl border bg-background/40">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
        {tools.map(({ label, icon: Icon, run }) => (
          <button key={label} type="button" onClick={run} title={label} aria-label={label} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <Icon size={15} />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-0.5 rounded-md bg-card p-0.5">
          <button type="button" onClick={() => setTab("write")} className={cn("flex items-center gap-1 rounded px-2 py-1 text-[11px]", tab === "write" ? "bg-muted text-foreground" : "text-muted-foreground")}>
            <Pencil size={11} /> Write
          </button>
          <button type="button" onClick={() => setTab("preview")} className={cn("flex items-center gap-1 rounded px-2 py-1 text-[11px]", tab === "preview" ? "bg-muted text-foreground" : "text-muted-foreground")}>
            <Eye size={11} /> Preview
          </button>
        </div>
      </div>
      {tab === "write" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="scroll-thin w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <div
          className="md-preview scroll-thin min-h-[18rem] px-4 py-3 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
        />
      )}
    </div>
  );
}
