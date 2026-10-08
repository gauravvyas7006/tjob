import { z } from "zod";
import { APPLICATION_STATUSES, JOB_SOURCES } from "./constants";

// Contracts between the Chrome extension and the tjob web API (/api/ext/*).

export const APPLY_TYPES = ["easy_apply", "external", "naukri", "unknown"] as const;

export const extJobInputSchema = z.object({
  source: z.enum(JOB_SOURCES),
  externalId: z.string().max(200).nullable(),
  url: z.string().max(2000),
  title: z.string().max(300),
  company: z.string().max(300),
  location: z.string().max(300).default(""),
  salaryText: z.string().max(300).default(""),
  description: z.string().max(60000),
  applyType: z.enum(APPLY_TYPES).default("unknown"),
});
export type ExtJobInput = z.infer<typeof extJobInputSchema>;

export const extLookupResponseSchema = z.object({
  found: z.boolean(),
  jobId: z.string().nullable(),
  applicationId: z.string().nullable(),
  status: z.enum(APPLICATION_STATUSES).nullable(),
  appliedAt: z.string().nullable(),
  cvVersionId: z.string().nullable(),
});
export type ExtLookupResponse = z.infer<typeof extLookupResponseSchema>;

export const extSaveResponseSchema = z.object({
  jobId: z.string(),
  applicationId: z.string(),
  status: z.enum(APPLICATION_STATUSES),
});
export type ExtSaveResponse = z.infer<typeof extSaveResponseSchema>;

export const extTailorResponseSchema = z.object({
  cvVersionId: z.string(),
  /** ATS test score out of 100 (keyword match % from older servers). */
  atsBefore: z.number(),
  atsAfter: z.number(),
  /** "Strong chance", "Good chance"… Empty from older servers, which only sent keyword match %. */
  atsBand: z.string().default(""),
  gaps: z.array(z.string()),
  pdfUrl: z.string(),
  editUrl: z.string(),
});
export type ExtTailorResponse = z.infer<typeof extTailorResponseSchema>;

export const extAppliedInputSchema = z.object({
  jobId: z.string(),
  cvVersionId: z.string().nullable().default(null),
});

export const FIELD_TYPES = ["text", "textarea", "number", "select", "radio", "checkbox"] as const;

export const extAutofillInputSchema = z.object({
  jobId: z.string().nullable().default(null),
  questions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().max(1000),
        type: z.enum(FIELD_TYPES),
        options: z.array(z.string().max(300)).max(100).default([]),
      }),
    )
    .max(40),
});
export type ExtAutofillInput = z.infer<typeof extAutofillInputSchema>;

export const extAutofillResponseSchema = z.object({
  answers: z.array(
    z.object({
      id: z.string(),
      value: z.string(),
      source: z.enum(["saved", "profile", "ai", "none"]),
    }),
  ),
});
export type ExtAutofillResponse = z.infer<typeof extAutofillResponseSchema>;

export const extSaveAnswersInputSchema = z.object({
  answers: z
    .array(z.object({ question: z.string().max(1000), value: z.string().max(4000) }))
    .max(60),
});

export const extImportInputSchema = z.object({
  source: z.enum(JOB_SOURCES),
  items: z
    .array(
      z.object({
        externalId: z.string().max(200).nullable(),
        url: z.string().max(2000),
        title: z.string().max(300),
        company: z.string().max(300),
        location: z.string().max(300).default(""),
        appliedAt: z.string().nullable().default(null),
        statusText: z.string().max(200).default(""),
      }),
    )
    .max(500),
});
export type ExtImportInput = z.infer<typeof extImportInputSchema>;

export const extProfileResponseSchema = z.object({
  name: z.string(),
  skills: z.array(z.string()),
  appUrl: z.string(),
});
export type ExtProfileResponse = z.infer<typeof extProfileResponseSchema>;
