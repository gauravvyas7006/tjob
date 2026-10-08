import type { JobSource } from "@tjob/shared";

export interface AlertJob {
  source: JobSource;
  externalId: string;
  url: string;
  title: string;
  company: string;
}

const NOISE = /^(\d+\+? new jobs?|your job alert|view job|apply now|easy apply|see (all|more) jobs|new$|promoted|actively recruiting|be an early applicant|\d+ (applicants?|connections?)|https?:\/\/|unsubscribe|manage|jobs? (for you|matching)|you're receiving|linkedin|naukri)/i;

/**
 * Pull job listings out of a LinkedIn / Naukri job-alert email: every job link, with the title
 * and company taken from the text just above it. Best-effort — alerts that can't be parsed
 * simply produce no leads.
 */
export function extractAlertJobs(text: string, source: JobSource): AlertJob[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = new Map<string, AlertJob>();
  lines.forEach((line, i) => {
    const li = line.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d{6,})/i);
    const nk = line.match(/naukri\.com\/job-listings-[\w-]*?-(\d{9,})/i);
    const id = source === "linkedin" ? li?.[1] : source === "naukri" ? nk?.[1] : undefined;
    if (!id || out.has(id)) return;
    // Walk upwards from the link, skipping noise, collecting the closest meaningful lines.
    const near: string[] = [];
    for (let j = i - 1; j >= 0 && near.length < 2 && j >= i - 6; j--) {
      const prev = lines[j];
      if (/jobs\/view\/\d|job-listings-/i.test(prev)) break;
      if (!NOISE.test(prev) && prev.length < 120) near.push(prev);
    }
    const inline = line.replace(/https?:\/\/\S+/g, "").replace(/[:\-–|]+\s*$/, "").trim();
    const hasInlineTitle = Boolean(inline) && !NOISE.test(inline);
    // "Company · Location" lines sit right under the title in alert emails.
    const looksLikeCompany = (l: string | undefined) => Boolean(l && /\s[·•|]\s/.test(l));
    let title = "";
    let company = "";
    if (hasInlineTitle) {
      title = inline;
      company = near[0] ?? "";
    } else if (looksLikeCompany(near[0])) {
      company = near[0] ?? "";
      title = near[1] ?? "";
    } else {
      title = near[0] ?? "";
    }
    out.set(id, {
      source,
      externalId: id,
      url: source === "linkedin" ? `https://www.linkedin.com/jobs/view/${id}/` : (line.match(/https?:\/\/\S+/)?.[0] ?? ""),
      title: title.slice(0, 200),
      company: company.split(/\s[·•|]\s/)[0]?.slice(0, 200) ?? "",
    });
  });
  return [...out.values()].filter((j) => j.title);
}
