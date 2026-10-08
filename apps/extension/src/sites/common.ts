/** Helpers shared by site adapters. */

export function firstText(selectors: string[], root: ParentNode = document): string {
  for (const sel of selectors) {
    const el = root.querySelector<HTMLElement>(sel);
    const t = el?.innerText?.replace(/\s+/g, " ").trim();
    if (t) return t;
  }
  return "";
}

export function firstBlock(selectors: string[], root: ParentNode = document): string {
  for (const sel of selectors) {
    const el = root.querySelector<HTMLElement>(sel);
    const t = el?.innerText?.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (t && t.length > 80) return t;
  }
  return "";
}

interface JobPostingLd {
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string } } | { address?: { addressLocality?: string } }[];
  baseSalary?: { value?: { minValue?: number; maxValue?: number; unitText?: string }; currency?: string };
}

/** Structured JobPosting data many job pages embed for search engines (most stable source). */
export function jobPostingLd(): JobPostingLd | null {
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent ?? "");
      const items = Array.isArray(data) ? data : data["@graph"] ?? [data];
      const job = items.find((x: { "@type"?: string | string[] }) =>
        [x?.["@type"]].flat().includes("JobPosting"),
      );
      if (job) return job as JobPostingLd;
    } catch {
      /* ignore malformed blocks */
    }
  }
  return null;
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  doc.querySelectorAll("p, li, div, h1, h2, h3, h4").forEach((el) => el.append("\n"));
  return (doc.body.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function ldCompany(ld: JobPostingLd | null): string {
  const org = ld?.hiringOrganization;
  return (typeof org === "string" ? org : org?.name) ?? "";
}

export function ldLocation(ld: JobPostingLd | null): string {
  const loc = ld?.jobLocation;
  const first = Array.isArray(loc) ? loc[0] : loc;
  return first?.address?.addressLocality ?? "";
}

export function ldSalary(ld: JobPostingLd | null): string {
  const v = ld?.baseSalary?.value;
  if (!v?.minValue) return "";
  return `${ld?.baseSalary?.currency ?? ""} ${v.minValue}${v.maxValue ? `–${v.maxValue}` : ""} ${v.unitText ?? ""}`.trim();
}

/** Text of the dialogs currently open (for "application sent" detection). */
export function openDialogText(): string {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')]
    .map((d) => d.innerText)
    .join("\n");
}
