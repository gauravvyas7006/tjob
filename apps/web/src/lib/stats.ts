import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { ApplicationStatus, JobSource } from "@tjob/shared";
import { applicationEvents, applications, db, mailAccounts } from "@/db";

const APPLIED_STATUSES = sql`(${applications.status} not in ('saved','cv_ready'))`;

/** Statuses an application "reached" at some point (current status or any event). */
function everReached(statuses: ApplicationStatus[]) {
  const list = sql.join(statuses.map((s) => sql`${s}`), sql`, `);
  return sql`(${applications.status} in (${list}) or exists (
    select 1 from ${applicationEvents} e
    where e.application_id = ${applications.id} and e.to_status in (${list})))`;
}

export interface OverviewStats {
  applied: number;
  thisWeek: number;
  lastWeek: number;
  responded: number;
  responseRate: number;
  interviews: number;
  offers: number;
  rejected: number;
  active: number;
  saved: number;
}

export async function overviewStats(userId: string): Promise<OverviewStats> {
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const twoWeeksAgo = new Date(Date.now() - 14 * 864e5);
  const [row] = await db
    .select({
      applied: sql<number>`count(*) filter (where ${APPLIED_STATUSES})::int`,
      thisWeek: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${weekAgo.toISOString()}::timestamptz)::int`,
      lastWeek: sql<number>`count(*) filter (where ${applications.appliedAt} >= ${twoWeeksAgo.toISOString()}::timestamptz and ${applications.appliedAt} < ${weekAgo.toISOString()}::timestamptz)::int`,
      responded: sql<number>`count(*) filter (where ${everReached(["viewed", "assessment", "interview", "offer", "rejected"])})::int`,
      interviews: sql<number>`count(*) filter (where ${everReached(["interview", "offer"])})::int`,
      offers: sql<number>`count(*) filter (where ${applications.status} = 'offer')::int`,
      rejected: sql<number>`count(*) filter (where ${applications.status} = 'rejected')::int`,
      active: sql<number>`count(*) filter (where ${applications.status} in ('applied','viewed','assessment','interview'))::int`,
      saved: sql<number>`count(*) filter (where ${applications.status} in ('saved','cv_ready'))::int`,
    })
    .from(applications)
    .where(eq(applications.userId, userId));
  const r = row ?? { applied: 0, thisWeek: 0, lastWeek: 0, responded: 0, interviews: 0, offers: 0, rejected: 0, active: 0, saved: 0 };
  return { ...r, responseRate: r.applied ? r.responded / r.applied : 0 };
}

export interface WeeklyPoint {
  week: string;
  linkedin: number;
  naukri: number;
  other: number;
}

/** Applications per ISO week (Mon) for the last `weeks` weeks, by source. */
export async function weeklyApplications(userId: string, weeks = 12): Promise<WeeklyPoint[]> {
  const since = new Date(Date.now() - weeks * 7 * 864e5);
  const rows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${applications.appliedAt} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`,
      source: applications.source,
      n: sql<number>`count(*)::int`,
    })
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.appliedAt, since)))
    .groupBy(sql`1`, applications.source);

  const byWeek = new Map<string, WeeklyPoint>();
  // Fill every week so gaps show as zero rather than disappearing.
  const start = new Date(since);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  for (let d = new Date(start); d <= new Date(); d.setUTCDate(d.getUTCDate() + 7)) {
    const key = d.toISOString().slice(0, 10);
    byWeek.set(key, { week: key, linkedin: 0, naukri: 0, other: 0 });
  }
  for (const r of rows) {
    const p = byWeek.get(r.week) ?? { week: r.week, linkedin: 0, naukri: 0, other: 0 };
    p[r.source as JobSource] += r.n;
    byWeek.set(r.week, p);
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-weeks);
}

export async function statusCounts(userId: string) {
  return db
    .select({ status: applications.status, n: sql<number>`count(*)::int` })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status);
}

export async function sourceCounts(userId: string) {
  return db
    .select({ source: applications.source, n: sql<number>`count(*)::int` })
    .from(applications)
    .where(and(eq(applications.userId, userId), APPLIED_STATUSES))
    .groupBy(applications.source);
}

export async function recentActivity(userId: string, limit = 12) {
  return db
    .select({
      id: applicationEvents.id,
      type: applicationEvents.type,
      toStatus: applicationEvents.toStatus,
      detail: applicationEvents.detail,
      createdAt: applicationEvents.createdAt,
      applicationId: applications.id,
      company: applications.company,
      title: applications.title,
    })
    .from(applicationEvents)
    .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
    .where(eq(applications.userId, userId))
    .orderBy(desc(applicationEvents.createdAt))
    .limit(limit);
}

export async function mailSyncState(userId: string) {
  const [acc] = await db
    .select({
      lastSyncedAt: mailAccounts.lastSyncedAt,
      lastSyncError: mailAccounts.lastSyncError,
      backfillDone: mailAccounts.backfillDone,
      emailAddress: mailAccounts.emailAddress,
    })
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId));
  return acc ?? null;
}
