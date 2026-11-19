function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/** Small, dependency-free Markdown renderer for trusted, self-authored notes. */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let list: "ul" | "ol" | null = null;
  let listIndent = -1;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
      listIndent = -1;
    }
  };

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        closeList();
        out.push('<pre><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      closeList();
      out.push("<hr />");
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }

    const check = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (check) {
      if (list !== "ul") {
        closeList();
        out.push('<ul class="md-check">');
        list = "ul";
      }
      out.push(`<li class="md-check-item${check[1].toLowerCase() === "x" ? " is-done" : ""}"><span class="md-box">${check[1].toLowerCase() === "x" ? "✓" : ""}</span><span>${inline(check[2])}</span></li>`);
      continue;
    }

    const ul = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (ul) {
      const indent = ul[1].length;
      if (list !== "ul" || listIndent !== indent) {
        closeList();
        out.push(indent >= 2 ? '<ul class="md-nested">' : "<ul>");
        list = "ul";
        listIndent = indent;
      }
      out.push(`<li>${inline(ul[2])}</li>`);
      continue;
    }

    const ol = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (ol) {
      const indent = ol[1].length;
      if (list !== "ol" || listIndent !== indent) {
        closeList();
        const start = Number(ol[2]);
        out.push(`<ol${indent >= 2 ? ' class="md-nested"' : ""}${start !== 1 ? ` start="${start}"` : ""}>`);
        list = "ol";
        listIndent = indent;
      }
      out.push(`<li>${inline(ol[3])}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }

  if (inCode) out.push("</code></pre>");
  closeList();
  return out.join("\n");
}

export function markdownToPlainText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(source: string): number {
  const text = markdownToPlainText(source);
  return text ? text.split(/\s+/).length : 0;
}
