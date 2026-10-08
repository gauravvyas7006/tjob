import type { Cv } from "@tjob/shared";

// Turns CV text into the shapes job application forms ask for (year only, MM/YYYY, first/last name…).

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "May 2023", "05/2023", "2023-05" or "2023" → { year, month } (month "" when not given). */
export function parseCvDate(text: string): { year: string; month: string } | null {
  const s = text.trim();
  const year = s.match(/\b(19|20)\d{2}\b/)?.[0];
  if (!year) return null;
  const named = s.match(/\b([a-z]{3})[a-z]*\.?\b/i)?.[1]?.toLowerCase();
  let month = named ? MONTHS.indexOf(named) + 1 : 0;
  if (!month) {
    const numeric = s.match(/^(\d{1,2})[/.-](?:19|20)\d{2}$/)?.[1] ?? s.match(/^(?:19|20)\d{2}[/.-](\d{1,2})$/)?.[1];
    month = numeric ? Number(numeric) : 0;
  }
  return { year, month: month >= 1 && month <= 12 ? String(month).padStart(2, "0") : "" };
}

export function yearOf(text: string): string {
  return parseCvDate(text)?.year ?? "";
}

/** "Dec 2024" → "12/2024"; "" when the month isn't known. */
export function monthYear(text: string): string {
  const d = parseCvDate(text);
  return d?.month ? `${d.month}/${d.year}` : "";
}

export function isCurrent(endDate: string): boolean {
  return /\b(present|current|now|ongoing|till date|to date)\b/i.test(endDate);
}

export function splitName(full: string): { first: string; middle: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? "", middle: "", last: "" };
  return { first: parts[0], middle: parts.slice(1, -1).join(" "), last: parts[parts.length - 1] };
}

/** "GAURAV VYAS" → "Gaurav Vyas"; names that already have lowercase letters are left alone. */
export function tidyName(name: string): string {
  if (/[a-z]/.test(name)) return name.trim();
  return name.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Phone number without the country code, digits only (Indian "+91 63760 74920" → "6376074920"). */
export function localPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function bulletBlock(bullets: string[]): string {
  return bullets
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `• ${b}`)
    .join("\n");
}

export function allSkills(cv: Cv): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of cv.skills.flatMap((g) => g.items)) {
    const key = item.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item.trim());
    }
  }
  return out.join(", ");
}

/** "Master's degree, Computer Science, University of East London (2021–2023)". */
export function educationLine(e: Cv["education"][number]): string {
  const years = [yearOf(e.startDate), yearOf(e.endDate)].filter(Boolean).join("–");
  const what = [e.degree, e.field, e.institution].filter(Boolean).join(", ");
  return years ? `${what} (${years})` : what;
}

export function findLink(cv: Cv, pattern: RegExp): string {
  return cv.contact.links.find((l) => l.url && (pattern.test(l.label) || pattern.test(l.url)))?.url ?? "";
}
