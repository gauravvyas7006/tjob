import "server-only";
import { and, eq } from "drizzle-orm";
import {
  canonicalSkill,
  extractSkills,
  type CaptureMethod,
  type JdExtraction,
  type JobSource,
} from "@tjob/shared";
import { db, jobs, jobSkills } from "@/db";
import { extractJd } from "./ai/extract-jd";
import { AiUnavailableError } from "./ai/budget";
import { sha256 } from "./crypto";

export type Job = typeof jobs.$inferSelect;

export interface JobInput {
  source: JobSource;
  externalId: string | null;
  url: string;
  title: string;
  company: string;
  location?: string;
  salaryText?: string;
  description: string;
  applyType?: string;
  capturedVia: CaptureMethod;
}

function descriptionHash(description: string): string | null {
  const norm = description.toLowerCase().replace(/\s+/g, " ").trim();
  return norm.length >= 80 ? sha256(norm) : null;
}

/** Find-or-create a job, de-duplicated by (source, externalId), then description hash, then URL. */
export async function upsertJob(userId: string, input: JobInput): Promise<Job> {
  const hash = descriptionHash(input.description);
  let existing: Job | undefined;

  if (input.externalId) {
    [existing] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.source, input.source), eq(jobs.externalId, input.externalId)))
      .limit(1);
  }
  if (!existing && hash) {
    [existing] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.descriptionHash, hash)))
      .limit(1);
  }
  if (!existing && input.url) {
    [existing] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.url, input.url)))
      .limit(1);
  }

  if (existing) {
    const longerDescription = input.description.length > existing.description.length;
    const [updated] = await db
      .update(jobs)
      .set({
        title: existing.title || input.title,
        company: existing.company || input.company,
        location: existing.location || input.location || "",
        salaryText: existing.salaryText || input.salaryText || "",
        url: existing.url || input.url,
        externalId: existing.externalId ?? input.externalId,
        applyType: input.applyType && input.applyType !== "unknown" ? input.applyType : existing.applyType,
        ...(longerDescription
          ? { description: input.description, descriptionHash: hash, extracted: null, extractedAt: null }
          : {}),
      })
      .where(eq(jobs.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(jobs)
    .values({
      userId,
      source: input.source,
      externalId: input.externalId,
      url: input.url,
      title: input.title,
      company: input.company,
      location: input.location ?? "",
      salaryText: input.salaryText ?? "",
      description: input.description,
      descriptionHash: hash,
      applyType: input.applyType ?? "unknown",
      capturedVia: input.capturedVia,
    })
    .returning();
  return created;
}

/** Dictionary-only extraction used when AI is unavailable (no key / budget reached). */
function localExtraction(job: Job): JdExtraction {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    roleCategory: "",
    seniority: "unknown",
    minYears: -1,
    maxYears: -1,
    requiredSkills: extractSkills(job.description),
    niceToHaveSkills: [],
    keywords: [],
    salaryMinLpa: -1,
    salaryMaxLpa: -1,
    salaryText: job.salaryText,
    workMode: "unknown",
    responsibilities: [],
  };
}

async function saveSkills(userId: string, jobId: string, ex: JdExtraction) {
  const rows = [
    ...ex.requiredSkills.map((s) => ({ skill: canonicalSkill(s), kind: "required" as const })),
    ...ex.niceToHaveSkills.map((s) => ({ skill: canonicalSkill(s), kind: "nice" as const })),
  ];
  const unique = [...new Map(rows.map((r) => [`${r.skill.toLowerCase()}|${r.kind}`, r])).values()];
  await db.delete(jobSkills).where(eq(jobSkills.jobId, jobId));
  if (unique.length) {
    await db
      .insert(jobSkills)
      .values(unique.map((r) => ({ jobId, userId, skill: r.skill, kind: r.kind })))
      .onConflictDoNothing();
  }
}

/**
 * Make sure a job has structured requirements. Uses AI once per job (extractedAt set); if AI isn't
 * available it stores a free dictionary extraction and leaves extractedAt null so it can be
 * upgraded later.
 */
export async function ensureJobExtracted(
  userId: string,
  job: Job,
  opts: { requireAi?: boolean } = {},
): Promise<JdExtraction | null> {
  if (job.extracted && job.extractedAt) return job.extracted;
  if (!job.description.trim()) return null;
  try {
    const ex = await extractJd(userId, job);
    await db
      .update(jobs)
      .set({
        extracted: ex,
        extractedAt: new Date(),
        title: job.title || ex.title,
        company: job.company || ex.company,
        location: job.location || ex.location,
      })
      .where(eq(jobs.id, job.id));
    await saveSkills(userId, job.id, ex);
    return ex;
  } catch (err) {
    if (opts.requireAi || !(err instanceof AiUnavailableError)) throw err;
    if (job.extracted) return job.extracted;
    const ex = localExtraction(job);
    await db.update(jobs).set({ extracted: ex }).where(eq(jobs.id, job.id));
    await saveSkills(userId, job.id, ex);
    return ex;
  }
}

export async function getJob(userId: string, jobId: string): Promise<Job | null> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.userId, userId), eq(jobs.id, jobId)))
    .limit(1);
  return job ?? null;
}
