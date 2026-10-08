import Papa from "papaparse";

export interface ImportedApplication {
  appliedAt: Date | null;
  company: string;
  title: string;
  url: string;
  externalId: string | null;
}

/** Parse LinkedIn dates like "10/5/24, 2:15 PM", "2024-10-05 14:15:00 UTC" or "Oct 5, 2024". */
export function parseLinkedInDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
  if (us) {
    const [, mo, d, y, h = "0", mi = "0", ap] = us;
    let hour = Number(h);
    if (ap?.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (ap?.toUpperCase() === "AM" && hour === 12) hour = 0;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(Date.UTC(year, Number(mo) - 1, Number(d), hour, Number(mi)));
  }
  const t = Date.parse(s.replace(" UTC", "Z").replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T"));
  return Number.isNaN(t) ? null : new Date(t);
}

function findColumn(headers: string[], ...needles: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const n of needles) {
    const i = lower.findIndex((h) => h.includes(n));
    if (i >= 0) return headers[i];
  }
  return undefined;
}

/**
 * LinkedIn data export → "Job Applications.csv" (or "Jobs/Job Applications_1.csv" when split).
 * Column names are matched loosely because LinkedIn changes them occasionally.
 */
export function parseLinkedInApplicationsCsv(text: string): { rows: ImportedApplication[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  const dateCol = findColumn(headers, "application date", "date");
  const companyCol = findColumn(headers, "company");
  const titleCol = findColumn(headers, "job title", "title", "position");
  const urlCol = findColumn(headers, "job url", "url", "link");

  const errors: string[] = [];
  if (!companyCol || !titleCol) {
    errors.push(`Couldn't find company/title columns. Found: ${headers.join(", ") || "(none)"}`);
    return { rows: [], errors };
  }

  const rows: ImportedApplication[] = [];
  for (const r of parsed.data) {
    const company = (r[companyCol] ?? "").trim();
    const title = (r[titleCol] ?? "").trim();
    if (!company && !title) continue;
    const url = urlCol ? (r[urlCol] ?? "").trim() : "";
    rows.push({
      appliedAt: dateCol ? parseLinkedInDate(r[dateCol] ?? "") : null,
      company,
      title,
      url,
      externalId: url.match(/jobs\/view\/(\d{6,})/)?.[1] ?? null,
    });
  }
  return { rows, errors };
}
