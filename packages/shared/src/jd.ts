import { z } from "zod";

export const SENIORITY_LEVELS = ["intern", "junior", "mid", "senior", "lead", "manager", "unknown"] as const;
export const WORK_MODES = ["onsite", "hybrid", "remote", "unknown"] as const;

/** Structured data pulled out of a job description. Feeds tailoring, ATS scoring and Insights. */
export const jdExtractionSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  /** Short normalized role family, e.g. "Java Backend", "Node.js Backend", "Full Stack", "DevOps". */
  roleCategory: z.string(),
  seniority: z.enum(SENIORITY_LEVELS),
  /** -1 when the JD doesn't say. */
  minYears: z.number(),
  maxYears: z.number(),
  requiredSkills: z.array(z.string()),
  niceToHaveSkills: z.array(z.string()),
  /** Other ATS keywords: methodologies, domains, tools not already listed as skills. */
  keywords: z.array(z.string()),
  /** Annual salary in INR lakhs (LPA); -1 when not stated. */
  salaryMinLpa: z.number(),
  salaryMaxLpa: z.number(),
  salaryText: z.string(),
  workMode: z.enum(WORK_MODES),
  responsibilities: z.array(z.string()),
});

export type JdExtraction = z.infer<typeof jdExtractionSchema>;
