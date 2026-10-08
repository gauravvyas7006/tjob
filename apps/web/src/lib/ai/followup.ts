import "server-only";
import { z } from "zod";
import { callFast } from "./client";

const SYSTEM = `You write short, polite follow-up emails from a job candidate to a recruiter or hiring team in India.
- 80-140 words, professional and warm, no clichés, no exaggeration.
- Mention the role and company, restate interest, one line on relevant strength from the given summary, and a clear ask (update on status / next steps).
- Plain text. Sign off with the candidate's name.`;

const draftSchema = z.object({ subject: z.string(), body: z.string() });

export async function draftFollowUp(
  userId: string,
  input: {
    candidateName: string;
    candidateSummary: string;
    company: string;
    title: string;
    appliedOn: string;
    status: string;
    lastEmailSubject: string;
  },
) {
  return callFast({
    userId,
    feature: "followup_draft",
    system: SYSTEM,
    user: JSON.stringify(input),
    schema: draftSchema,
    maxTokens: 800,
  });
}
