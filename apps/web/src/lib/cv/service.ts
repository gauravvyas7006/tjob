import "server-only";
import { and, eq } from "drizzle-orm";
import { applyTailorPatch, type Cv } from "@tjob/shared";
import { applications, cvVersions, db, masterCv } from "@/db";
import { tailorCv } from "@/lib/ai/tailor-cv";
import { applicationForJob, changeStatus, addEvent } from "@/lib/applications";
import { ensureJobExtracted, getJob } from "@/lib/jobs";
import { atsScore, unsupportedSkills } from "./ats";

export type CvVersion = typeof cvVersions.$inferSelect;
export type MasterCv = typeof masterCv.$inferSelect;

export class CvError extends Error {}

export async function getMasterCv(userId: string): Promise<MasterCv | null> {
  const [row] = await db.select().from(masterCv).where(eq(masterCv.userId, userId)).limit(1);
  return row ?? null;
}

export async function getCvVersion(userId: string, id: string): Promise<CvVersion | null> {
  const [row] = await db
    .select()
    .from(cvVersions)
    .where(and(eq(cvVersions.userId, userId), eq(cvVersions.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Full tailoring flow for one job: extract requirements (once), rewrite the CV with Sonnet,
 * merge onto the master CV, score it, save a version and link it to the job's application.
 */
export async function tailorForJob(
  userId: string,
  jobId: string,
  opts: { focusNote?: string; captureMethod?: "extension" | "manual" } = {},
): Promise<CvVersion> {
  const master = await getMasterCv(userId);
  if (!master) throw new CvError("Upload your CV on the CV page first.");
  const job = await getJob(userId, jobId);
  if (!job) throw new CvError("Job not found.");
  if (!job.description.trim()) throw new CvError("This job has no description to tailor against.");

  const jd = await ensureJobExtracted(userId, job, { requireAi: true });
  if (!jd) throw new CvError("Couldn't read the job description.");

  const patch = await tailorCv(userId, {
    master: master.data,
    extraFacts: master.extraFacts,
    jd,
    description: job.description,
    focusNote: opts.focusNote,
  });
  const tailored = applyTailorPatch(master.data, patch);
  const before = atsScore(master.data, jd);
  const after = atsScore(tailored, jd);

  const [version] = await db
    .insert(cvVersions)
    .values({
      userId,
      jobId: job.id,
      title: [jd.title || job.title, job.company || jd.company].filter(Boolean).join(" · ") || "Tailored CV",
      data: tailored,
      changes: patch.changes,
      gaps: patch.gaps,
      unsupported: unsupportedSkills(master.data, master.extraFacts, tailored),
      atsBefore: before.score,
      atsAfter: after.score,
      matchedKeywords: after.matched,
      missingKeywords: after.missing,
      model: "claude-sonnet-5-5",
    })
    .returning();

  const app = await applicationForJob(userId, job, opts.captureMethod ?? "manual");
  await db.update(applications).set({ cvVersionId: version.id }).where(eq(applications.id, app.id));
  await addEvent(app.id, "cv_attached", `Tailored CV created (ATS ${before.score}% → ${after.score}%)`);
  if (app.status === "saved") await changeStatus(app, "cv_ready", { auto: true });

  return version;
}

/** Save user edits to a tailored CV and re-score it. */
export async function updateCvVersion(userId: string, id: string, data: Cv): Promise<void> {
  const version = await getCvVersion(userId, id);
  if (!version) throw new CvError("CV version not found.");
  const master = await getMasterCv(userId);
  let scores = {};
  if (version.jobId) {
    const job = await getJob(userId, version.jobId);
    if (job?.extracted) {
      const after = atsScore(data, job.extracted);
      scores = { atsAfter: after.score, matchedKeywords: after.matched, missingKeywords: after.missing };
    }
  }
  await db
    .update(cvVersions)
    .set({
      data,
      ...scores,
      unsupported: master ? unsupportedSkills(master.data, master.extraFacts, data) : [],
    })
    .where(eq(cvVersions.id, id));
}

export function cvFileName(cv: Cv, title: string): string {
  const name = cv.contact.name || "CV";
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60);
  const parts = [name, ...title.split("·").map((s) => s.trim())].map(clean).filter(Boolean);
  return parts.join("_") + ".pdf";
}
