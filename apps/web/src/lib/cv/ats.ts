import {
  cvToPlainText,
  extractSkills,
  keywordCoverage,
  textHasSkill,
  type Cv,
  type JdExtraction,
  type KeywordScore,
} from "@tjob/shared";

export function atsScore(cv: Cv, jd: JdExtraction): KeywordScore {
  return keywordCoverage(cvToPlainText(cv), jd.requiredSkills, [...jd.niceToHaveSkills, ...jd.keywords]);
}

/**
 * Skills the tailored CV mentions that the master CV and extra facts never do. Should be empty;
 * anything here is flagged for the user to remove (the model must not invent skills).
 */
export function unsupportedSkills(master: Cv, extraFacts: string, tailored: Cv): string[] {
  const facts = cvToPlainText(master) + "\n" + extraFacts;
  const fromText = extractSkills(cvToPlainText(tailored));
  const fromSkillList = tailored.skills.flatMap((g) => g.items);
  const candidates = [...new Set([...fromText, ...fromSkillList])];
  return candidates.filter((s) => !textHasSkill(facts, s));
}
