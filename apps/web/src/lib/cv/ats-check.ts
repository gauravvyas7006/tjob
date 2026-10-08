import {
  cvToPlainText,
  dedupeSkills,
  keywordCoverage,
  textHasRequirement,
  type Cv,
  type JdExtraction,
} from "@tjob/shared";

/*
 * ATS test: what applicant tracking systems commonly check, applied to the text read back out of
 * the PDF (not the CV data), so it also catches anything that doesn't survive in the file.
 * Free and rule-based: no AI call.
 */

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckGroup = "read" | "match" | "content";
export type AtsBand = "strong" | "good" | "borderline" | "low";

export interface AtsCheckItem {
  id: string;
  group: CheckGroup;
  label: string;
  status: CheckStatus;
  detail: string;
  /** What to do about a warn/fail. */
  fix: string;
  /** Share of the score this check carries. */
  weight: number;
  /** 0–1 earned; keyword checks earn their coverage, others 1 / 0.5 / 0. */
  points: number;
}

export interface AtsReport {
  /** 0–100 */
  score: number;
  band: AtsBand;
  /** Set when a knockout check (years, required skills) holds the band down. */
  capped: string;
  /** The master CV's score for the same job, for comparison. */
  beforeScore: number | null;
  pages: number;
  items: AtsCheckItem[];
  checkedAt: string;
}

export const ATS_BAND_LABELS: Record<AtsBand, string> = {
  strong: "Strong chance",
  good: "Good chance",
  borderline: "Borderline",
  low: "Low chance",
};

export const ATS_BAND_TEXT: Record<AtsBand, string> = {
  strong: "Very likely to pass automated screening and rank high in recruiter searches.",
  good: "Likely to pass automated screening. Fixing the warnings below makes it safer.",
  borderline: "May be filtered out. Fix the items marked below before applying.",
  low: "Likely to be filtered out for this job: too many of its requirements are missing.",
};

const POINTS: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 };

// ---------------------------------------------------------------------------------------------
// Dates and years of experience
// ---------------------------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A CV date as a month index (year * 12 + month), or "now" for Present. null if unreadable. */
export function parseCvDate(value: string, now = new Date()): number | null {
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (/^(present|current|now|till date|to date|ongoing|today)$/.test(s)) return now.getUTCFullYear() * 12 + now.getUTCMonth();
  const year = s.match(/\b(19|20)\d{2}\b/)?.[0];
  if (!year) return null;
  const named = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(s));
  const numeric = s.match(/\b(0?[1-9]|1[0-2])[/.-](19|20)\d{2}\b/)?.[1];
  const month = named >= 0 ? named : numeric ? Number(numeric) - 1 : 0;
  return Number(year) * 12 + month;
}

/** Total years across all roles, counting overlapping periods once. null when no role has dates. */
export function yearsOfExperience(cv: Cv, now = new Date()): number | null {
  const ranges = cv.experience
    .map((e) => [parseCvDate(e.startDate, now), parseCvDate(e.endDate || "present", now)] as const)
    .filter((r): r is readonly [number, number] => r[0] !== null && r[1] !== null && r[1] >= r[0])
    .sort((a, b) => a[0] - b[0]);
  if (!ranges.length) return null;
  let months = 0;
  let [start, end] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= end) end = Math.max(end, e);
    else {
      months += end - start + 1;
      [start, end] = [s, e];
    }
  }
  months += end - start + 1;
  return Math.round((months / 12) * 10) / 10;
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

const TITLE_NOISE = new Set([
  "senior", "sr", "junior", "jr", "lead", "principal", "staff", "associate", "head", "i", "ii", "iii", "iv",
  "and", "or", "the", "of", "for", "in", "with", "to", "a", "an", "at", "remote", "hybrid", "onsite",
]);

function titleWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(" ")
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length > 1 && !TITLE_NOISE.has(w));
}

/** Share (0–1) of the job title's words found in the CV's headline or job titles; null if the title has none. */
export function titleCoverage(cv: Cv, jobTitle: string): number | null {
  const wanted = titleWords(jobTitle);
  if (!wanted.length) return null;
  const yours = new Set(titleWords([cv.headline, ...cv.experience.map((e) => e.role)].join(" ")));
  return wanted.filter((w) => yours.has(w)).length / wanted.length;
}

/**
 * Skills group for job requirements the candidate is studying but hasn't used at work. ATS keyword
 * matching counts them; the heading tells a recruiter the truth.
 */
export const LEARNING_CATEGORY = "Currently learning";

export function learningSkills(cv: Cv): string[] {
  return cv.skills.filter((g) => g.category === LEARNING_CATEGORY).flatMap((g) => g.items);
}

const list = (items: string[], max = 6) =>
  items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", ");

export interface AtsInput {
  cv: Cv;
  jd: JdExtraction;
  /** The job description as posted, for requirements the extraction doesn't capture (degree). */
  description: string;
  /** Text read back out of the rendered PDF. */
  pdfText: string;
  pages: number;
  now?: Date;
}

export function atsCheck({ cv, jd, description, pdfText, pages, now = new Date() }: AtsInput): Omit<AtsReport, "beforeScore"> {
  const items: AtsCheckItem[] = [];
  const add = (item: Omit<AtsCheckItem, "points"> & { points?: number }) =>
    items.push({ ...item, points: item.points ?? POINTS[item.status] });
  const text = pdfText.replace(/\s+/g, " ");
  const lower = text.toLowerCase();

  // --- Can the ATS read it? ---
  const readable = text.length >= 300 && (!cv.contact.name || lower.includes(cv.contact.name.toLowerCase().split(" ")[0]));
  add({
    id: "text",
    group: "read",
    label: "Text can be read from the PDF",
    status: readable ? "pass" : "fail",
    detail: readable ? `${text.length.toLocaleString("en-IN")} characters read in order.` : "Little or no text could be read back.",
    fix: "Fill in your CV's sections, then download the PDF again.",
    weight: 10,
  });

  // ATS parsers take the first line as the name; two-column designs often put something else first.
  const firstName = cv.contact.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (firstName) {
    const firstLines = pdfText.trim().split(/\n/).slice(0, 2).join(" ").toLowerCase();
    const top = firstLines.includes(firstName);
    add({
      id: "name",
      group: "read",
      label: "Name at the top",
      status: top ? "pass" : "fail",
      detail: top ? "Your name is the first thing the ATS reads." : "Your name isn't at the start of the text the ATS reads.",
      fix: "Use a one-column CV with your name as the first line, like the PDF tjob makes.",
      weight: 3,
    });
  }

  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
  const hasPhone = (text.match(/(?:\+?\d[\d\s-]{8,}\d)/g) ?? []).some((m) => m.replace(/\D/g, "").length >= 10);
  add({
    id: "contact",
    group: "read",
    label: "Email and phone number",
    status: hasEmail && hasPhone ? "pass" : hasEmail || hasPhone ? "warn" : "fail",
    detail:
      hasEmail && hasPhone ? "Both found." : `Missing: ${[!hasEmail && "email", !hasPhone && "phone number"].filter(Boolean).join(" and ")}.`,
    fix: "Add them under Contact on the CV page. Recruiters can't reach you without them.",
    weight: 5,
  });

  const headings = ["experience", "skills", "education"].filter((h) => new RegExp(`\\b${h}\\b`, "i").test(text));
  add({
    id: "sections",
    group: "read",
    label: "Standard section headings",
    status: headings.length === 3 ? "pass" : headings.length === 2 ? "warn" : "fail",
    detail:
      headings.length === 3
        ? "Experience, Skills and Education are all there."
        : `Missing: ${["experience", "skills", "education"].filter((h) => !headings.includes(h)).join(", ")}.`,
    fix: "Fill in the missing section. ATS software files your details by these headings.",
    weight: 5,
  });

  const undated = cv.experience.filter((e) => parseCvDate(e.startDate, now) === null || (e.endDate && parseCvDate(e.endDate, now) === null));
  add({
    id: "dates",
    group: "read",
    label: "Dates on every job",
    status: cv.experience.length && !undated.length ? "pass" : "warn",
    detail: !cv.experience.length
      ? "No work experience listed."
      : undated.length
        ? `Unclear dates for ${list(undated.map((e) => e.company || e.role))}.`
        : "Every role has a start and end date the ATS can read.",
    fix: "Use dates like \"Jan 2021 – Present\" so the ATS can count your years of experience.",
    weight: 5,
  });

  add({
    id: "length",
    group: "read",
    label: "Length",
    status: pages <= 2 ? "pass" : pages === 3 ? "warn" : "fail",
    detail: `${pages} ${pages === 1 ? "page" : "pages"}.`,
    fix: "Keep it to 1–2 pages: cut older or less relevant bullets.",
    weight: 3,
  });

  // --- Does it match the job? ---
  const required = dedupeSkills(jd.requiredSkills);
  const optional = dedupeSkills([...jd.niceToHaveSkills, ...jd.keywords]).filter((s) => !required.includes(s));
  if (required.length) {
    const r = keywordCoverage(text, required);
    const learning = learningSkills(cv).join(", ");
    const work = cvToPlainText({ ...cv, skills: cv.skills.filter((g) => g.category !== LEARNING_CATEGORY) });
    const fromLearning = learning ? r.matched.filter((s) => textHasRequirement(learning, s) && !textHasRequirement(work, s)) : [];
    add({
      id: "required",
      group: "match",
      label: "Required skills",
      status: r.score >= 75 ? "pass" : r.score >= 50 ? "warn" : "fail",
      detail:
        `${r.matched.length} of ${required.length} found` +
        (fromLearning.length ? ` (${fromLearning.length} under ${LEARNING_CATEGORY}: expect interview questions on them)` : "") +
        `${r.missing.length ? `. Missing: ${list(r.missing)}` : ""}.`,
      fix: "Recruiters filter on these. Add any you really have to Extra facts, or tick “Currently learning” to list the ones you are studying, then press Tailor again.",
      weight: 35,
      points: r.score / 100,
    });
  }
  if (optional.length) {
    const o = keywordCoverage(text, [], optional);
    add({
      id: "keywords",
      group: "match",
      label: "Other keywords from the job",
      status: o.score >= 60 ? "pass" : o.score >= 30 ? "warn" : "fail",
      detail: `${o.matched.length} of ${optional.length} found${o.missing.length ? `. Missing: ${list(o.missing)}` : ""}.`,
      fix: "Use the job's own words for things you've done (e.g. \"CI/CD\", \"unit testing\") where they're true.",
      weight: 10,
      points: o.score / 100,
    });
  }

  const share = titleCoverage(cv, jd.title);
  if (share !== null) {
    add({
      id: "title",
      group: "match",
      label: "Job title",
      status: share >= 0.6 ? "pass" : share >= 0.3 ? "warn" : "fail",
      detail: share >= 0.6 ? `Your headline or roles match "${jd.title}".` : `"${jd.title}" isn't in your headline or job titles.`,
      fix: "Recruiters search by title. Press Tailor again: tjob now starts your headline with the job's title.",
      weight: 10,
    });
  }

  if (jd.minYears > 0) {
    const years = yearsOfExperience(cv, now);
    const status: CheckStatus = years === null ? "warn" : years >= jd.minYears ? "pass" : years >= jd.minYears - 1 ? "warn" : "fail";
    add({
      id: "years",
      group: "match",
      label: "Years of experience",
      status,
      detail:
        years === null
          ? `The job asks for ${jd.minYears}+ years; your CV's dates don't show how many you have.`
          : `The job asks for ${jd.minYears}${jd.maxYears > jd.minYears ? `–${jd.maxYears}` : "+"} years; your CV shows about ${years}.`,
      fix:
        years === null
          ? "Add start and end dates to each job."
          : "Many ATS setups reject applications below the minimum. Count internships or freelance work only if it was real development work.",
      weight: 10,
    });
  }

  if (/\b(bachelor'?s?|b\.?\s?tech|b\.?\s?e\.?|degree|graduate|graduation|master'?s?|m\.?\s?tech|mca|bca)\b/i.test(description)) {
    const hasDegree = cv.education.some((e) => e.degree.trim() || e.field.trim());
    add({
      id: "education",
      group: "match",
      label: "Degree",
      status: hasDegree ? "pass" : "fail",
      detail: hasDegree ? "The job mentions a degree and your CV lists one." : "The job mentions a degree but your CV lists none.",
      fix: "Add your degree under Education.",
      weight: 4,
    });
  }

  const city = jd.location.split(/[,/|]/)[0]?.trim();
  if (city && jd.workMode !== "remote" && !/remote|anywhere|multiple|india$/i.test(city)) {
    const aliases = /bengaluru|bangalore/i.test(city) ? /bengaluru|bangalore/i : new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const ok = aliases.test([cv.contact.location, cv.summary, cv.headline].join(" "));
    add({
      id: "location",
      group: "match",
      label: "Location",
      status: ok ? "pass" : "warn",
      detail: ok ? `Your CV mentions ${city}.` : `The job is in ${city}; your CV says ${cv.contact.location || "nothing about location"}.`,
      fix: `If you're willing to work there, put "${city} (open to relocate)" as your location.`,
      weight: 3,
    });
  }

  // --- Content ---
  add({
    id: "summary",
    group: "content",
    label: "Summary",
    status: cv.summary.trim() ? "pass" : "warn",
    detail: cv.summary.trim() ? "A summary leads the CV." : "No summary.",
    fix: "Add 2–3 lines on what you do and your main skills.",
    weight: 2,
  });

  const bullets = cv.experience.flatMap((e) => e.bullets).filter((b) => b.trim());
  const withNumbers = bullets.filter((b) => /\d/.test(b)).length;
  add({
    id: "impact",
    group: "content",
    label: "Results with numbers",
    status: bullets.length && withNumbers / bullets.length >= 0.3 ? "pass" : "warn",
    detail: `${withNumbers} of ${bullets.length} experience bullets include a number.`,
    fix: "Where you know it, add scale or results: users, requests per day, time saved, % faster. Only true numbers.",
    weight: 3,
  });

  const weak = bullets.filter((b) =>
    /^(responsible for|worked on|working on|helped|assisted( in| with)?|involved in|participated in|tasked with|duties included|handled)\b/i.test(b.trim()),
  );
  add({
    id: "verbs",
    group: "content",
    label: "Strong opening verbs",
    status: weak.length ? "warn" : "pass",
    detail: weak.length
      ? `${weak.length} ${weak.length === 1 ? "bullet starts" : "bullets start"} weakly, e.g. "${weak[0].split(/\s+/).slice(0, 4).join(" ")}…".`
      : "Bullets lead with what you did.",
    fix: "Start with what you did: \"Built\", \"Cut\", \"Automated\", \"Led\", not \"Responsible for\" or \"Worked on\".",
    weight: 2,
  });

  const hasLinkedIn = cv.contact.links.some((l) => /linkedin\.com\//i.test(l.url));
  add({
    id: "linkedin",
    group: "content",
    label: "LinkedIn profile",
    status: hasLinkedIn ? "pass" : "warn",
    detail: hasLinkedIn ? "Your LinkedIn URL is on the CV." : "No LinkedIn URL on the CV.",
    fix: "Add your LinkedIn profile URL under Contact on the CV page; most recruiters look you up there.",
    weight: 1,
  });

  const starts = cv.experience.map((e) => parseCvDate(e.startDate, now));
  const outOfOrder = starts.some((s, i) => i > 0 && s !== null && starts[i - 1] !== null && s > starts[i - 1]!);
  if (cv.experience.length > 1) {
    add({
      id: "order",
      group: "content",
      label: "Most recent job first",
      status: outOfOrder ? "warn" : "pass",
      detail: outOfOrder ? "Your jobs aren't in date order, newest first." : "Jobs are listed newest first.",
      fix: "Reorder Experience on the CV page so your current or latest job comes first.",
      weight: 2,
    });
  }

  const long = bullets.filter((b) => b.split(/\s+/).length > 35).length;
  add({
    id: "bullets",
    group: "content",
    label: "Short bullets",
    status: long ? "warn" : "pass",
    detail: long ? `${long} ${long === 1 ? "bullet is" : "bullets are"} over 35 words.` : "Every bullet is 35 words or fewer.",
    fix: "Split long bullets: one achievement each.",
    weight: 2,
  });

  const total = items.reduce((n, i) => n + i.weight, 0);
  const score = Math.round((items.reduce((n, i) => n + i.weight * i.points, 0) / total) * 100);
  let band: AtsBand = score >= 80 ? "strong" : score >= 65 ? "good" : score >= 50 ? "borderline" : "low";
  // Knockouts: recruiters filter on required skills and minimum years, whatever the rest looks like.
  const requiredCheck = items.find((i) => i.id === "required");
  const knockout = items.find((i) => (i.id === "years" || i.id === "required") && i.status === "fail");
  let capped = "";
  if (requiredCheck && requiredCheck.points < 0.35 && band !== "low") {
    band = "low";
    capped = "Held at Low: your CV shows fewer than a third of the job's required skills, and recruiters filter on these.";
  } else if (knockout && (band === "strong" || band === "good")) {
    band = "borderline";
    capped = `Held at Borderline: ${knockout.label.toLowerCase()} is a common automatic filter.`;
  }
  return { score, band, capped, pages, items, checkedAt: now.toISOString() };
}
