import {
  cvToPlainText,
  extractSkills,
  isKnownSkill,
  keywordCoverage,
  requirementVariants,
  textHasRequirement,
  type Cv,
  type JdExtraction,
  type KeywordScore,
} from "@tjob/shared";
import { LEARNING_CATEGORY } from "./ats-check";

export function atsScore(cv: Cv, jd: JdExtraction): KeywordScore {
  return keywordCoverage(cvToPlainText(cv), jd.requiredSkills, [...jd.niceToHaveSkills, ...jd.keywords]);
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * Whether two words are the same allowing for typos and other endings ("liumiting", "rotating"/
 * "rotation"). `strict` (technology names, where "React" must not pass for "reach") only allows
 * plurals and run-together words ("powerbash" contains "bash").
 */
function nearWord(want: string, have: string, strict: boolean): boolean {
  if (want === have) return true;
  if (want.length < 4) return have === `${want}s`;
  if (have.includes(want)) return true;
  if (strict) return false;
  const shared = [...want].findIndex((c, i) => c !== have[i]);
  const prefix = shared === -1 ? want.length : shared;
  const shorter = Math.min(want.length, have.length);
  // Same stem: "rotation"/"rotating", and long words typed wrongly after the stem ("encryments").
  if (prefix >= 6 || (prefix >= 5 && (prefix >= shorter * 0.6 || shorter >= 8))) return true;
  return editDistance(want, have) <= (want.length >= 7 ? 2 : 1);
}

/**
 * Whether the user's own text backs up a phrase, word by word, tolerating typos: their Extra facts
 * are often typed quickly ("rate liumiting", "web scrabing") and the AI writes them correctly.
 */
function factsMention(factWords: string[], phrase: string): boolean {
  const wanted = words(phrase);
  const strict = isKnownSkill(phrase);
  return wanted.length > 0 && wanted.every((w) => factWords.some((h) => nearWord(w, h, strict)));
}

/**
 * Skills the tailored CV mentions that the master CV and extra facts never do. Should be empty;
 * anything here is flagged for the user to remove (the model must not invent skills).
 */
export function unsupportedSkills(master: Cv, extraFacts: string, tailored: Cv): string[] {
  const facts = cvToPlainText(master) + "\n" + extraFacts;
  const factWords = [...new Set(words(facts))];
  // Skills listed as "Currently learning" are labelled as such, so they aren't claims of experience.
  const claimed = { ...tailored, skills: tailored.skills.filter((g) => g.category !== LEARNING_CATEGORY) };
  const fromText = extractSkills(cvToPlainText(claimed));
  const fromSkillList = claimed.skills.flatMap((g) => g.items);
  const candidates = [...new Set([...fromText, ...fromSkillList])];
  // Combined items like "RDBMS (PostgreSQL, MySQL)" are supported when their parts are.
  return candidates.filter(
    (s) => !textHasRequirement(facts, s) && !requirementVariants(s).some((v) => factsMention(factWords, v)),
  );
}
