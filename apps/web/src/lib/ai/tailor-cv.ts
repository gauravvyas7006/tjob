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

WHAT TO RETURN (only the parts that change; everything else is kept from the master CV):
- headline: a target title aligned with the JD that is still truthful (e.g. "Backend Engineer | Java, Spring Boot, Microservices").
- summary: 2-3 sentences, max 60 words, leading with the strengths this JD cares about. State years of experience only if derivable from the dates.
- skills: up to 6 groups, JD-relevant groups and items first; only skills from MASTER_CV/EXTRA_FACTS; keep breadth, drop only clearly irrelevant items.
- experience: one entry per experience id in MASTER_CV (same ids). 3-6 bullets each (up to 7 for the most recent role). Most JD-relevant bullets first. Start with a strong action verb, max 30 words, past tense for past roles, include JD keywords naturally where truthful, show impact where the master CV has it.
- projectOrder: ids of projects to include, most relevant first (drop clearly irrelevant ones only if there are more than 4). projects: rewritten bullets for those projects (same rules as experience).
- changes: 3-8 short notes on what you changed and why (for the candidate to review).
- gaps: each important JD requirement the CV doesn't support, with a one-line note on how the candidate could address it honestly (e.g. "If you used Kafka on MARS, add it to Extra facts and re-tailor").

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
