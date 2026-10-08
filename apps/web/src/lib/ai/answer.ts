import "server-only";
import { z } from "zod";
import { truncate, type Cv } from "@tjob/shared";
import { callFast } from "./client";

const SYSTEM = `You fill in job application form questions for a candidate, using only their profile and CV.

- Answer briefly in the form's expected format. Numbers as digits only (e.g. years of experience "4").
- For select/radio questions, the value must be exactly one of the given options.
- For yes/no about skills or experience, answer truthfully from the CV; if the CV doesn't show it, answer "No" (or the closest truthful option).
- For checkbox questions, value is "true" or "false".
- If the answer can't be determined from the profile/CV (e.g. a personal preference not given), return "" so the candidate fills it in.
- Never invent facts.`;

const answersSchema = z.object({
  answers: z.array(z.object({ id: z.string(), value: z.string() })),
});

export interface QuestionForAi {
  id: string;
  label: string;
  type: string;
  options: string[];
}

export async function draftAnswers(
  userId: string,
  input: {
    profile: Record<string, string>;
    cv: Cv | null;
    job: { title: string; company: string } | null;
    questions: QuestionForAi[];
  },
): Promise<Map<string, string>> {
  const cvBrief = input.cv
    ? JSON.stringify({
        headline: input.cv.headline,
        summary: input.cv.summary,
        skills: input.cv.skills,
        experience: input.cv.experience.map((e) => ({
          company: e.company,
          role: e.role,
          startDate: e.startDate,
          endDate: e.endDate,
          tech: e.tech,
          bullets: e.bullets.slice(0, 4),
        })),
        education: input.cv.education,
      })
    : "(no CV uploaded)";

  const out = await callFast({
    userId,
    feature: "autofill_answer",
    system: SYSTEM,
    user: [
      "PROFILE:",
      JSON.stringify(input.profile),
      "",
      "CV:",
      truncate(cvBrief, 8000),
      "",
      input.job ? `JOB: ${input.job.title} at ${input.job.company}` : "",
      "QUESTIONS:",
      JSON.stringify(input.questions),
    ].join("\n"),
    schema: answersSchema,
    maxTokens: 1500,
  });
  return new Map(out.answers.map((a) => [a.id, a.value]));
}
