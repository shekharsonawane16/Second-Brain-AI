const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

function addDays(base: string, days: number): Date {
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() + days);
  return date;
}

function fromMonthDay(day: number, month: number, today: string): Date | null {
  const [y] = today.split("-").map(Number);
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  const candidate = new Date(y, month, day, 12);
  if (candidate.getMonth() !== month) return null;
  if (iso(candidate) < today) candidate.setFullYear(y + 1);
  return candidate;
}

export interface ParsedDate {
  title: string;
  date: string | null;
  expression: string;
}

/**
 * Extract a trailing natural-language date. Parsing is deliberately
 * conservative and always requires the user to confirm before it is applied.
 */
export function parseNaturalDate(title: string, today: string): ParsedDate {
  const original = title.trim();
  const patterns: Array<{ re: RegExp; resolve: (m: RegExpMatchArray) => Date | null }> = [
    { re: /\s+(?:due\s+)?(today)$/i, resolve: () => addDays(today, 0) },
    { re: /\s+(?:due\s+)?(tomorrow)$/i, resolve: () => addDays(today, 1) },
    { re: /\s+(?:due\s+)?(day\s+after\s+tomorrow)$/i, resolve: () => addDays(today, 2) },
    { re: /\s+(?:due\s+)?(next\s+week)$/i, resolve: () => addDays(today, 7) },
    { re: /\s+(?:in|after)\s+(\d{1,3})\s+days?$/i, resolve: (m) => addDays(today, Number(m[1])) },
    { re: /\s+(?:in|after)\s+(\d{1,2})\s+weeks?$/i, resolve: (m) => addDays(today, Number(m[1]) * 7) },
    {
      re: /\s+(?:by|on|due)?\s*(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i,
      resolve: (m) => {
        const target = DAYS.indexOf(m[2].toLowerCase());
        const [y, mo, d] = today.split("-").map(Number);
        const now = new Date(y, mo - 1, d, 12);
        let diff = (target - now.getDay() + 7) % 7;
        if (diff === 0 || m[1]) diff += 7;
        return addDays(today, diff);
      }
    },
    {
      re: /\s+(?:by|on|due)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*$/i,
      resolve: (m) => fromMonthDay(Number(m[1]), MONTHS.indexOf(m[2].toLowerCase()), today)
    },
    {
      re: /\s+(?:by|on|due)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?$/i,
      resolve: (m) => fromMonthDay(Number(m[2]), MONTHS.indexOf(m[1].toLowerCase()), today)
    },
    {
      re: /\s+(?:by|on|due)?\s*(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/,
      resolve: (m) => {
        const day = Number(m[1]);
        const month = Number(m[2]) - 1;
        let date = fromMonthDay(day, month, today);
        if (!date) return null;
        if (m[3]) {
          const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
          const explicit = new Date(year, month, day, 12);
          if (explicit.getMonth() === month) date = explicit;
        }
        return date;
      }
    }
  ];

  for (const { re, resolve } of patterns) {
    const match = original.match(re);
    if (!match) continue;
    const date = resolve(match);
    if (!date) continue;
    return {
      title: original.slice(0, match.index).trim(),
      date: iso(date),
      expression: match[0].trim()
    };
  }

  return { title: original, date: null, expression: "" };
}
