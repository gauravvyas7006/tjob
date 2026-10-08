import "server-only";
import { z } from "zod";
import { truncate, type Cv } from "@tjob/shared";
import { callFast } from "./client";

/*
 * Help for a gap in a tailored CV ("Docker", "Python 3.7+"). Both return a draft the candidate
 * edits and confirms before it's saved to Extra facts; nothing here changes the CV by itself.
 */

const SUGGEST_SYSTEM = `You help a job seeker check whether a job requirement they seem to be missing actually fits their real experience.

You get their CV, their extra facts, and one requirement from a job description.
1. Find the role or project in the CV where this requirement most plausibly was part of the work, judging from the tech, tasks and setup described there.
2. Write ONE sentence they could add to their CV if it is true: past tense, starts with an action verb, at most 30 words, naming the real role or project and the requirement.
3. In "condition", say plainly what must be true for that sentence to be honest (e.g. "Only add this if you wrote the Dockerfile or ran the API in containers yourself").

Rules:
- Never invent employers, projects, numbers, team sizes or results. Use only what the CV and extra facts say, plus the requirement itself.
- If nothing in the CV plausibly relates (for example the requirement is a different field entirely), set related to false, leave draft empty, and use "condition" to say what kind of experience would be needed.
- basedOn: the role ("Software Engineer at MARS") or project name you used, or "" when not related.`;

const suggestionSchema = z.object({
  related: z.boolean(),
  draft: z.string(),
  condition: z.string(),
  basedOn: z.string(),
});
export type FactSuggestion = z.infer<typeof suggestionSchema>;

function cvBrief(cv: Cv): string {
  return JSON.stringify({
    headline: cv.headline,
    skills: cv.skills,
    experience: cv.experience.map((e) => ({ role: e.role, company: e.company, tech: e.tech, bullets: e.bullets })),
    projects: cv.projects.map((p) => ({ name: p.name, description: p.description, tech: p.tech, bullets: p.bullets })),
  });
}

/** "Suggest from my projects": where the missing requirement might honestly fit. */
export async function suggestFact(
  userId: string,
  input: { cv: Cv; extraFacts: string; requirement: string; gapNote: string },
): Promise<FactSuggestion> {
  return callFast({
    userId,
    feature: "fact_suggest",
    system: SUGGEST_SYSTEM,
    user: [
      "CV:",
      truncate(cvBrief(input.cv), 9000),
      "",
      "EXTRA FACTS:",
      truncate(input.extraFacts.trim() || "(none)", 3000),
      "",
      `REQUIREMENT: ${input.requirement}`,
      input.gapNote ? `WHY IT LOOKS MISSING: ${input.gapNote}` : "",
    ].join("\n"),
    schema: suggestionSchema,
    maxTokens: 600,
  });
}

const POLISH_SYSTEM = `You turn a job seeker's rough note about their experience into clean CV wording.

- Fix spelling, grammar and word choice. Write 1-2 sentences, past tense, each starting with a strong action verb, no first-person pronouns.
- Keep every fact in the note and add none: no new tools, technologies, numbers, results or employers. If the note is vague, stay vague rather than inventing detail.
- Use standard names for technologies (e.g. "docker" -> "Docker", "node" -> "Node.js", "aws" -> "AWS").
- Plain text only.`;

/** "Write it myself": rewrites the candidate's rough note without adding anything. */
export async function polishFact(userId: string, input: { text: string; requirement: string }): Promise<string> {
  const out = await callFast({
    userId,
    feature: "fact_polish",
    system: POLISH_SYSTEM,
    user: [`The note is about this job requirement: ${input.requirement}`, "", "NOTE:", truncate(input.text, 1500)].join("\n"),
    schema: z.object({ text: z.string() }),
    maxTokens: 400,
  });
  return out.text.trim();
}
