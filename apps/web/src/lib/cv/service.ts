import "server-only";
import { and, asc, count, desc, eq, max } from "drizzle-orm";
import { applyTailorPatch, cvToPlainText, type Cv } from "@tjob/shared";
import { applications, cvVersions, db, jobs, masterCv } from "@/db";
import { tailorCv } from "@/lib/ai/tailor-cv";
import { applicationForJob, changeStatus, addEvent } from "@/lib/applications";
import { ensureJobExtracted, getJob } from "@/lib/jobs";
import { atsScore, unsupportedSkills } from "./ats";
import { learningSkills, type AtsReport } from "./ats-check";
import { atsAutoFix } from "./ats-fix";
import { atsTest } from "./ats-test";

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
 * merge onto the master CV, apply the automatic ATS fixes, test the PDF, save a version and link
 * it to the job's application.
 *
 * `learning` lists the job's missing skills under "Currently learning"; when not given, it follows
 * the job's previous version, so a follow-up keeps the user's choice.
 */
export async function tailorForJob(
  userId: string,
  jobId: string,
  opts: { focusNote?: string; captureMethod?: "extension" | "manual"; learning?: boolean } = {},
): Promise<CvVersion> {
  const master = await getMasterCv(userId);
  if (!master) throw new CvError("Upload your CV on the CV page first.");
  const job = await getJob(userId, jobId);
  if (!job) throw new CvError("Job not found.");
  if (!job.description.trim()) throw new CvError("This job has no description to tailor against.");

  const jd = await ensureJobExtracted(userId, job, { requireAi: true });
  if (!jd) throw new CvError("Couldn't read the job description.");

  let learning = opts.learning;
  if (learning === undefined) {
    const [previous] = await db
      .select({ data: cvVersions.data })
      .from(cvVersions)
      .where(and(eq(cvVersions.userId, userId), eq(cvVersions.jobId, job.id)))
      .orderBy(desc(cvVersions.createdAt))
      .limit(1);
    learning = previous ? learningSkills(previous.data).length > 0 : false;
  }

  const patch = await tailorCv(userId, {
    master: master.data,
    extraFacts: master.extraFacts,
    jd,
    description: job.description,
    focusNote: opts.focusNote,
  });
  const title = [jd.title || job.title, job.company || jd.company].filter(Boolean).join(" · ") || "Tailored CV";
  const fixed = await atsAutoFix(applyTailorPatch(master.data, patch), jd, title, {
    learning,
    facts: `${cvToPlainText(master.data)}\n${master.extraFacts}`,
  });
  const tailored = fixed.cv;
  const before = atsScore(master.data, jd);
  const after = atsScore(tailored, jd);
  const [report, masterReport] = await Promise.all([
    atsTest(tailored, title, jd, job.description),
    atsTest(master.data, title, jd, job.description),
  ]);

  const [version] = await db
    .insert(cvVersions)
    .values({
      userId,
      jobId: job.id,
      title,
      data: tailored,
      changes: [...patch.changes, ...fixed.notes],
      gaps: patch.gaps,
      unsupported: unsupportedSkills(master.data, master.extraFacts, tailored),
      atsBefore: before.score,
      atsAfter: after.score,
      matchedKeywords: after.matched,
      missingKeywords: after.missing,
      model: "claude-sonnet-5-5",
      focusNote: opts.focusNote?.trim().slice(0, 500) ?? "",
      atsReport: { ...report, beforeScore: masterReport.score },
    })
    .returning();

  const app = await applicationForJob(userId, job, opts.captureMethod ?? "manual");
  await db.update(applications).set({ cvVersionId: version.id }).where(eq(applications.id, app.id));
  await addEvent(app.id, "cv_attached", `Tailored CV created (ATS ${before.score}% → ${after.score}%)`);
  if (app.status === "saved") await changeStatus(app, "cv_ready", { auto: true });

  return version;
}

/** Jobs the user has tailored a CV for, most recent first: the Tailor chat's conversation list. */
export async function tailorThreads(userId: string) {
  const lastAt = max(cvVersions.createdAt);
  return db
    .select({ jobId: jobs.id, title: jobs.title, company: jobs.company, lastAt, versions: count(cvVersions.id) })
    .from(cvVersions)
    .innerJoin(jobs, eq(jobs.id, cvVersions.jobId))
    .where(eq(cvVersions.userId, userId))
    .groupBy(jobs.id)
    .orderBy(desc(lastAt))
    .limit(30);
}

/** One job's conversation: its description and every CV version tailored for it, oldest first. */
export async function tailorThread(userId: string, jobId: string) {
  const job = await getJob(userId, jobId);
  if (!job) return null;
  const versions = await db
    .select()
    .from(cvVersions)
    .where(and(eq(cvVersions.userId, userId), eq(cvVersions.jobId, jobId)))
    .orderBy(asc(cvVersions.createdAt));
  return { job, versions };
}

/**
 * The version's ATS test, running it now (and saving it) for versions made before the test
 * existed. null when the version has no job description to test against.
 */
export async function ensureAtsReport(userId: string, version: CvVersion): Promise<AtsReport | null> {
  if (version.atsReport) return version.atsReport;
  if (!version.jobId) return null;
  const [job, master] = await Promise.all([getJob(userId, version.jobId), getMasterCv(userId)]);
  if (!job?.extracted) return null;
  const [report, masterReport] = await Promise.all([
    atsTest(version.data, version.title, job.extracted, job.description),
    master ? atsTest(master.data, version.title, job.extracted, job.description) : null,
  ]);
  const atsReport: AtsReport = { ...report, beforeScore: masterReport?.score ?? null };
  await db.update(cvVersions).set({ atsReport }).where(eq(cvVersions.id, version.id));
  return atsReport;
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
      const report = await atsTest(data, version.title, job.extracted, job.description);
      scores = {
        atsAfter: after.score,
        matchedKeywords: after.matched,
        missingKeywords: after.missing,
        atsReport: { ...report, beforeScore: version.atsReport?.beforeScore ?? null },
      };
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

/** The CV behind a download link: a tailored version by id, or the master CV for "master". */
export async function cvForDownload(userId: string, id: string): Promise<{ cv: Cv; title: string } | null> {
  if (id === "master") {
    const master = await getMasterCv(userId);
    return master ? { cv: master.data, title: master.data.headline || "CV" } : null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const version = await getCvVersion(userId, id);
  return version ? { cv: version.data, title: version.title } : null;
}

export function cvFileName(cv: Cv, title: string, ext: "pdf" | "docx" = "pdf"): string {
  const name = cv.contact.name || "CV";
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60);
  const parts = [name, ...title.split("·").map((s) => s.trim())].map(clean).filter(Boolean);
  return `${parts.join("_")}.${ext}`;
}
