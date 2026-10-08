import "server-only";
import {
  canonicalSkill,
  cvToPlainText,
  dedupeSkills,
  isKnownSkill,
  requirementVariants,
  textHasRequirement,
  textHasSkill,
  type Cv,
  type JdExtraction,
  type TailorChange,
} from "@tjob/shared";
import { LEARNING_CATEGORY, titleCoverage } from "./ats-check";
import { pageCount } from "./ats-test";

/*
 * Fixes tailoring applies automatically after the AI rewrite, so a CV doesn't fail ATS checks it
 * can pass honestly: the headline names the job's title, it fits on two pages, and (when the user
 * asks) skills they're studying are listed as such. Past job titles and experience are never changed.
 */

/** A job title without location, work mode or requisition codes: "Java Developer - Bengaluru (Hybrid)" → "Java Developer". */
export function cleanJobTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*[)\]]/g, "")
    .replace(/\s+[-–|,]\s+(bangalore|bengaluru|hyderabad|pune|mumbai|chennai|delhi|new delhi|noida|gurgaon|gurugram|kolkata|remote|hybrid|india)\b.*$/i, "")
    .replace(/\b(?:R|JR|REQ)[-_]?\d{4,}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The headline led by the job's title, keeping the skills after "|" (or naming the top skills),
 * when the headline and job titles don't already match it. null when no change is needed.
 */
export function headlineForJob(cv: Cv, jobTitle: string): string | null {
  const title = cleanJobTitle(jobTitle);
  const share = titleCoverage(cv, title);
  if (!title || share === null || share >= 0.6) return null;
  const skills =
    cv.headline.split("|").slice(1).join("|").trim() ||
    cv.skills
      .filter((g) => g.category !== LEARNING_CATEGORY)
      .flatMap((g) => g.items)
      .slice(0, 4)
      .join(", ");
  return skills ? `${title} | ${skills}` : title;
}

/** Required skills, then other keywords, that the CV doesn't mention anywhere. */
export function missingFromCv(cv: Cv, jd: JdExtraction): string[] {
  const text = cvToPlainText(cv);
  return dedupeSkills([...jd.requiredSkills, ...jd.niceToHaveSkills]).filter((s) => !textHasRequirement(text, s));
}

/**
 * The narrowest name for a requirement that the candidate's text states: the JD's own words when
 * they appear there ("Agile" from "Agile/Scrum" when the facts say "agile", so Scrum isn't
 * claimed), else a dictionary name matched through a spelling the facts use ("unit tests" →
 * "Unit Testing"). "" when the facts don't state it.
 */
function statedName(requirement: string, facts: string): string {
  const single = requirementVariants(requirement).filter((v) => !/[/,]|\s(and|or)\s/i.test(v));
  const literal = single.find((v) =>
    new RegExp(`(?<![a-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i").test(facts),
  );
  if (literal) return literal;
  const viaAlias = single.find((v) => textHasSkill(facts, v));
  const canonical = viaAlias ? canonicalSkill(viaAlias) : "";
  return /[/,]/.test(canonical) ? "" : canonical;
}

/** Skills group for job keywords the candidate's own material states but the rewrite left out. */
export const STATED_CATEGORY = "Also experienced with";

/**
 * The job's skills and keywords that the candidate's own text (master CV + Extra facts) states but
 * the tailored CV leaves out, added under the name that matched: "Docker/Containerization" with
 * facts saying "containers" adds "Containerization", never "Docker".
 */
export function withStatedKeywords(cv: Cv, jd: JdExtraction, facts: string): { cv: Cv; added: string[] } {
  const base = { ...cv, skills: cv.skills.filter((g) => g.category !== STATED_CATEGORY) };
  const text = cvToPlainText(base);
  const added: string[] = [];
  for (const req of dedupeSkills([...jd.requiredSkills, ...jd.niceToHaveSkills, ...jd.keywords])) {
    if (textHasRequirement(text, req)) continue;
    const name = statedName(req, facts);
    if (name && !added.some((a) => a.toLowerCase() === name.toLowerCase()) && !textHasRequirement(text, name)) added.push(name);
  }
  if (!added.length) return { cv: base, added };
  const learningAt = base.skills.findIndex((g) => g.category === LEARNING_CATEGORY);
  const skills = [...base.skills];
  skills.splice(learningAt < 0 ? skills.length : learningAt, 0, { category: STATED_CATEGORY, items: added.slice(0, 12) });
  return { cv: { ...base, skills }, added: added.slice(0, 12) };
}

/** A requirement as a short skill name: "Python 3.7+" → "Python", "Flask API" → "Flask". */
function skillName(requirement: string): string {
  const variants = requirementVariants(requirement);
  return canonicalSkill(variants[variants.length - 1] ?? requirement);
}

/**
 * Lists the job's missing technologies under "Currently learning" (replacing any earlier list).
 * Practices like "API development" or "unit testing" aren't listed: the candidate may well do them
 * already, and tailoring describes them from real work instead.
 */
export function withLearningSkills(cv: Cv, jd: JdExtraction): { cv: Cv; added: string[] } {
  const base = { ...cv, skills: cv.skills.filter((g) => g.category !== LEARNING_CATEGORY) };
  const added = [...new Set(missingFromCv(base, jd).map(skillName))].filter(isKnownSkill).slice(0, 12);
  if (!added.length) return { cv: base, added };
  return { cv: { ...base, skills: [...base.skills, { category: LEARNING_CATEGORY, items: added }] }, added };
}

/**
 * Drops the least relevant content (tailoring orders bullets and projects most relevant first)
 * until the PDF fits on `maxPages`: extra projects, then project bullets, then bullets from the
 * oldest roles. Keeps at least 4 bullets for the latest role and 2 for the others.
 */
export async function fitToPages(cv: Cv, title: string, maxPages = 2): Promise<{ cv: Cv; removed: number; pages: number }> {
  let current: Cv = structuredClone(cv);
  let pages = await pageCount(current, title);
  let removed = 0;
  const trimOnce = (c: Cv): boolean => {
    if (c.projects.length > 2) {
      c.projects.pop();
      return true;
    }
    const project = [...c.projects].reverse().find((p) => p.bullets.length > 1);
    if (project) {
      project.bullets.pop();
      return true;
    }
    for (let i = c.experience.length - 1; i >= 0; i--) {
      const min = i === 0 ? 4 : 2;
      if (c.experience[i].bullets.length > min) {
        c.experience[i].bullets.pop();
        return true;
      }
    }
    return false;
  };
  for (let round = 0; round < 15 && pages > maxPages; round++) {
    // Two at a time while more than a page over, one at a time near the limit.
    const steps = pages - maxPages > 1 ? 4 : 2;
    let changed = false;
    for (let s = 0; s < steps && trimOnce(current); s++) {
      removed++;
      changed = true;
    }
    if (!changed) break;
    pages = await pageCount(current, title);
  }
  if (!removed) current = cv;
  return { cv: current, removed, pages };
}

/** Applies every automatic fix and returns notes for "What I changed". */
export async function atsAutoFix(
  cv: Cv,
  jd: JdExtraction,
  title: string,
  opts: { learning: boolean; facts?: string },
): Promise<{ cv: Cv; notes: TailorChange[]; learning: string[] }> {
  let out = cv;
  const notes: TailorChange[] = [];
  const headline = headlineForJob(out, jd.title);
  if (headline) {
    out = { ...out, headline };
    notes.push({ section: "Headline", reason: `Starts with the job's title, "${cleanJobTitle(jd.title)}", which recruiters search for.` });
  }
  if (opts.facts) {
    const stated = withStatedKeywords(out, jd, opts.facts);
    out = stated.cv;
    if (stated.added.length) {
      notes.push({
        section: "Skills",
        reason: `Added the job's words for things your CV or Extra facts already state: ${stated.added.join(", ")}.`,
      });
    }
  }
  let learning: string[] = [];
  if (opts.learning) {
    const res = withLearningSkills(out, jd);
    out = res.cv;
    learning = res.added;
    if (learning.length) {
      notes.push({ section: "Skills", reason: `Listed under ${LEARNING_CATEGORY}: ${learning.join(", ")}.` });
    }
  }
  const fit = await fitToPages(out, title);
  if (fit.removed) {
    out = fit.cv;
    notes.push({
      section: "Length",
      reason: `Removed ${fit.removed} lower-priority ${fit.removed === 1 ? "item" : "items"} so the CV fits on ${fit.pages} ${fit.pages === 1 ? "page" : "pages"}.`,
    });
  }
  return { cv: out, notes, learning };
}
