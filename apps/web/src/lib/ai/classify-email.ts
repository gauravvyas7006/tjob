import "server-only";
import { z } from "zod";
import { EMAIL_CATEGORIES, truncate } from "@tjob/shared";
import { callFast } from "./client";
import { MODELS } from "./pricing";

export const emailClassificationSchema = z.object({
  isJobRelated: z.boolean(),
  category: z.enum(EMAIL_CATEGORIES),
  /** Hiring company (not the job board or recruiting agency, unless that's all there is). */
  company: z.string(),
  jobTitle: z.string(),
  confidence: z.number(),
  /** One line, max 20 words, for the inbox. */
  summary: z.string(),
});
export type EmailClassification = z.infer<typeof emailClassificationSchema>;

export const CLASSIFY_SYSTEM = `You sort a job seeker's emails about their job applications.

Categories:
- application_confirmation: the candidate's application was received/sent.
- application_viewed: a recruiter/company viewed the application or downloaded the CV, or it was shortlisted.
- recruiter_reply: a person from a company/agency writes about a role (not an interview invite yet).
- assessment: online test, coding challenge, assignment.
- interview: interview invitation or scheduling.
- offer: job offer or offer letter.
- rejection: not moving forward / position filled / regret.
- job_alert: job recommendations, newsletters, marketing from job sites.
- other: anything else (set isJobRelated=false if not about the candidate's job search).

company: the hiring company; "" if unknown. jobTitle: the role; "" if unknown.
confidence: 0 to 1. summary: one line, max 20 words.`;

export interface EmailForAi {
  from: string;
  subject: string;
  date: string;
  body: string;
}

export function classifyUserPrompt(e: EmailForAi): string {
  return [`From: ${e.from}`, `Date: ${e.date}`, `Subject: ${e.subject}`, "", truncate(e.body, 3000)].join("\n");
}

export async function classifyEmail(userId: string, e: EmailForAi): Promise<EmailClassification> {
  return callFast({
    userId,
    feature: "classify_email",
    system: CLASSIFY_SYSTEM,
    user: classifyUserPrompt(e),
    schema: emailClassificationSchema,
    maxTokens: 512,
  });
}

export const CLASSIFY_MODEL = MODELS.fast;
