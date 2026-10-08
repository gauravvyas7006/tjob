import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  GHOSTED_AFTER_DAYS,
  STATUS_LABELS,
  canAutoTransition,
  normalizeCompany,
  type ApplicationStatus,
  type CaptureMethod,
  type JobSource,
} from "@tjob/shared";
import { applicationEvents, applications, db } from "@/db";
import type { Job } from "./jobs";

export type Application = typeof applications.$inferSelect;

export async function getApplication(userId: string, id: string): Promise<Application | null> {
  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createApplication(
  userId: string,
  input: {
    source: JobSource;
    externalId: string | null;
    company: string;
    title: string;
    location?: string;
    jobUrl?: string;
    jobId?: string | null;
    status: ApplicationStatus;
    appliedAt?: Date | null;
    captureMethod: CaptureMethod;
    detail?: string;
  },
): Promise<Application> {
  const now = new Date();
  const [row] = await db
    .insert(applications)
    .values({
      userId,
      jobId: input.jobId ?? null,
      source: input.source,
      externalId: input.externalId,
      company: input.company,
      companyKey: normalizeCompany(input.company),
      title: input.title,
      location: input.location ?? "",
      jobUrl: input.jobUrl ?? "",
      status: input.status,
      appliedAt: input.appliedAt ?? (input.status === "applied" ? now : null),
      lastActivityAt: input.appliedAt ?? now,
      captureMethod: input.captureMethod,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    // Same (source, externalId) already tracked.
    const [existing] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.userId, userId),
          eq(applications.source, input.source),
          eq(applications.externalId, input.externalId ?? ""),
        ),
      )
      .limit(1);
    return existing;
  }

  await db.insert(applicationEvents).values({
    applicationId: row.id,
    type: "created",
    toStatus: row.status,
    detail: input.detail ?? `Added via ${input.captureMethod}`,
  });
  return row;
}

/** The application for a job, created as "saved" if it doesn't exist yet. */
export async function applicationForJob(
  userId: string,
  job: Job,
  captureMethod: CaptureMethod,
): Promise<Application> {
  const [byJob] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), eq(applications.jobId, job.id)))
    .limit(1);
  if (byJob) return byJob;

  if (job.externalId) {
    const [byExt] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.userId, userId),
          eq(applications.source, job.source),
          eq(applications.externalId, job.externalId),
        ),
      )
      .limit(1);
    if (byExt) {
      await db.update(applications).set({ jobId: job.id }).where(eq(applications.id, byExt.id));
      return { ...byExt, jobId: job.id };
    }
  }

  return createApplication(userId, {
    source: job.source,
    externalId: job.externalId,
    company: job.company,
    title: job.title,
    location: job.location,
    jobUrl: job.url,
    jobId: job.id,
    status: "saved",
    captureMethod,
  });
}

/**
 * Change status. Automatic signals (emails, extension) follow `canAutoTransition`; manual changes
 * always apply. Returns whether the status changed.
 */
export async function changeStatus(
  app: Application,
  to: ApplicationStatus,
  opts: { auto: boolean; at?: Date; emailId?: string | null; detail?: string },
): Promise<boolean> {
  const at = opts.at ?? new Date();
  if (app.status === to) return false;
  if (opts.auto && !canAutoTransition(app.status, to)) return false;

  await db
    .update(applications)
    .set({
      status: to,
      lastActivityAt: at > app.lastActivityAt ? at : app.lastActivityAt,
      ...(to === "applied" && !app.appliedAt ? { appliedAt: at } : {}),
    })
    .where(eq(applications.id, app.id));

  await db.insert(applicationEvents).values({
    applicationId: app.id,
    type: "status_change",
    fromStatus: app.status,
    toStatus: to,
    emailId: opts.emailId ?? null,
    detail: opts.detail ?? `${STATUS_LABELS[app.status]} → ${STATUS_LABELS[to]}`,
  });
  return true;
}

export async function touchActivity(appId: string, at: Date) {
  await db
    .update(applications)
    .set({ lastActivityAt: sql`greatest(${applications.lastActivityAt}, ${at.toISOString()}::timestamptz)` })
    .where(eq(applications.id, appId));
}

export async function addEvent(
  applicationId: string,
  type: (typeof applicationEvents.$inferInsert)["type"],
  detail: string,
  emailId?: string | null,
) {
  await db.insert(applicationEvents).values({ applicationId, type, detail, emailId: emailId ?? null });
}

/** Applications with no activity for GHOSTED_AFTER_DAYS move to "ghosted". */
export async function markGhosted(userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - GHOSTED_AFTER_DAYS * 24 * 3600 * 1000);
  const stale = await db
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        inArray(applications.status, ["applied", "viewed"]),
        lt(applications.lastActivityAt, cutoff),
      ),
    );
  if (!stale.length) return 0;
  await db
    .update(applications)
    .set({ status: "ghosted" })
    .where(inArray(applications.id, stale.map((s) => s.id)));
  await db.insert(applicationEvents).values(
    stale.map((s) => ({
      applicationId: s.id,
      type: "status_change" as const,
      fromStatus: s.status,
      toStatus: "ghosted" as const,
      detail: `No response for ${GHOSTED_AFTER_DAYS} days`,
    })),
  );
  return stale.length;
}

export async function recentApplications(userId: string, limit = 50) {
  return db
    .select()
    .from(applications)
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.lastActivityAt))
    .limit(limit);
}
