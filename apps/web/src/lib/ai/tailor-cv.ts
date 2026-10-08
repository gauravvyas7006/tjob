import "server-only";
import { tailorPatchSchema, truncate, type Cv, type JdExtraction, type TailorPatch } from "@tjob/shared";
import { callWriter } from "./client";

// Stable across all calls: first in the prompt so the cached prefix is reused.
const INSTRUCTIONS = `You are an expert technical resume writer for the Indian IT job market. You tailor a candidate's master CV to one job description so it passes ATS keyword screening and reads well to a recruiter.

TRUTHFULNESS (most important):
- Use only facts present in MASTER_CV and EXTRA_FACTS. Never add employers, titles, dates, degrees, certifications, metrics, team sizes, clients or technologies that are not there.
- You may rephrase, reorder, merge, split and emphasize existing facts, and describe them in the JD's vocabulary when it is the same thing (e.g. "built endpoints for the mobile app" -> "designed REST APIs consumed by the mobile app").
- Mention a technology only if it appears in MASTER_CV or EXTRA_FACTS. Keep every existing number exactly as written; never create new numbers.
- If the JD asks for something the candidate doesn't show, do NOT add it. List it under gaps instead.

ATS MATCH (the goal is to get through automated screening and recruiter keyword searches):
- EXTRA_FACTS are true details the candidate added, often for this job's gaps: work each relevant one into the matching role or project bullets and into skills.
- Use the JD's exact words for things the candidate has. When the CV shows a specific instance of a JD's general term, name both, e.g. "RDBMS (MySQL, PostgreSQL)", "CI/CD (GitHub Actions)", "unit testing (Jest)", "containerisation (Docker)".
- Put the JD's most important matching keywords in the summary, the first skills group and the first bullets of the most recent role.
- The CV must fit on 2 pages: at most 6 bullets for the most recent role, 4 for the next, 3 for older roles, and at most 3 projects with 2 bullets each.

WHAT TO RETURN (only the parts that change; everything else is kept from the master CV):
- headline: the JD's job title, then " | " and 3-5 of the candidate's real skills that the JD asks for (e.g. "Backend Developer | Node.js, REST APIs, PostgreSQL, CI/CD"). The headline names the role being applied for; never change the job titles in experience.
- summary: 2-3 sentences, max 60 words, leading with the strengths this JD cares about. State years of experience only if derivable from the dates.
- skills: up to 6 groups, JD-relevant groups and items first; only skills from MASTER_CV/EXTRA_FACTS; keep breadth, drop only clearly irrelevant items.
- experience: one entry per experience id in MASTER_CV (same ids), within the bullet limits above. Most JD-relevant bullets first. Start with a strong action verb, max 30 words, past tense for past roles, include JD keywords naturally where truthful, show impact where the master CV has it.
- projectOrder: ids of the most relevant projects (up to 3), most relevant first. projects: rewritten bullets for those projects (same rules as experience).
- changes: 3-8 short notes on what you changed and why (for the candidate to review). Refer to roles by company name, never by id.
- gaps: each important JD requirement the CV and EXTRA_FACTS don't support, with a one-line note on how the candidate could address it honestly (e.g. "If you used Kafka at MARS, add it to Extra facts and re-tailor").

Plain text only: no markdown, no emojis, no first-person pronouns in bullets.`;

export async function tailorCv(
  userId: string,
  input: {
    master: Cv;
    extraFacts: string;
    jd: JdExtraction;
    description: string;
    focusNote?: string;
  },
): Promise<TailorPatch> {
  const candidate = [
    "MASTER_CV (JSON):",
    JSON.stringify(input.master),
    "",
    "EXTRA_FACTS (true details from the candidate, may be used):",
    input.extraFacts.trim() || "(none)",
  ].join("\n");

  const job = [
    `JOB: ${input.jd.title} at ${input.jd.company} (${input.jd.roleCategory}, ${input.jd.seniority})`,
    `Required skills: ${input.jd.requiredSkills.join(", ") || "(not listed)"}`,
    `Nice to have: ${input.jd.niceToHaveSkills.join(", ") || "(none)"}`,
    `Other keywords: ${input.jd.keywords.join(", ") || "(none)"}`,
    "",
    "JOB DESCRIPTION:",
    truncate(input.description, 8000),
    input.focusNote?.trim() ? `\nCANDIDATE'S NOTE FOR THIS JOB: ${input.focusNote.trim()}` : "",
    "\nTailor the CV for this job.",
  ].join("\n");

  return callWriter({
    userId,
    feature: "tailor_cv",
    system: [
      { type: "text", text: INSTRUCTIONS },
      // Same for every job until the master CV changes -> cache hit on repeat tailoring.
      { type: "text", text: candidate, cache_control: { type: "ephemeral" } },
    ],
    content: [{ type: "text", text: job }],
    schema: tailorPatchSchema,
    maxTokens: 12000,
  });
}
