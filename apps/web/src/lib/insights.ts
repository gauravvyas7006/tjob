import "server-only";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { canonicalSkill, cvToPlainText, extractSkills, textHasSkill } from "@tjob/shared";
import { db, jobs, jobSkills } from "@/db";
import { getMasterCv } from "./cv/service";

export interface SkillDemand {
  skill: string;
  jobs: number;
  required: number;
  share: number;
  inCv: boolean;
}

const EXPERIENCE_BUCKETS = ["0–1", "2–3", "4–5", "6–8", "9+", "Not stated"] as const;

export async function marketInsights(userId: string) {
  const since = new Date(Date.now() - 12 * 7 * 864e5);
  const [[totals], top, roles, exp, salary, modes, master] = await Promise.all([
    db
      .select({
        jds: sql<number>`count(*)::int`,
        recent: sql<number>`count(*) filter (where ${jobs.createdAt} >= ${since.toISOString()}::timestamptz)::int`,
      })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), isNotNull(jobs.extracted))),
    db
      .select({
        skill: jobSkills.skill,
        jobs: sql<number>`count(distinct ${jobSkills.jobId})::int`,
        required: sql<number>`count(*) filter (where ${jobSkills.kind} = 'required')::int`,
      })
      .from(jobSkills)
      .where(eq(jobSkills.userId, userId))
      .groupBy(jobSkills.skill)
      .orderBy(sql`2 desc`, sql`3 desc`)
      .limit(25),
    db
      .select({ role: sql<string>`${jobs.extracted}->>'roleCategory'`, n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), sql`coalesce(${jobs.extracted}->>'roleCategory', '') <> ''`))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),
    db
      .select({
        bucket: sql<string>`case
          when (${jobs.extracted}->>'minYears')::numeric < 0 then 'Not stated'
          when (${jobs.extracted}->>'minYears')::numeric <= 1 then '0–1'
          when (${jobs.extracted}->>'minYears')::numeric <= 3 then '2–3'
          when (${jobs.extracted}->>'minYears')::numeric <= 5 then '4–5'
          when (${jobs.extracted}->>'minYears')::numeric <= 8 then '6–8'
          else '9+' end`,
        n: sql<number>`count(*)::int`,
      })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), isNotNull(jobs.extracted)))
      .groupBy(sql`1`),
    db
      .select({
        role: sql<string>`coalesce(nullif(${jobs.extracted}->>'roleCategory', ''), 'Unclassified')`,
        n: sql<number>`count(*)::int`,
        min: sql<number>`min(nullif((${jobs.extracted}->>'salaryMinLpa')::numeric, -1))::float`,
        max: sql<number>`max(nullif((${jobs.extracted}->>'salaryMaxLpa')::numeric, -1))::float`,
        median: sql<number>`percentile_cont(0.5) within group (order by (
          (nullif((${jobs.extracted}->>'salaryMinLpa')::numeric, -1) + coalesce(nullif((${jobs.extracted}->>'salaryMaxLpa')::numeric, -1), nullif((${jobs.extracted}->>'salaryMinLpa')::numeric, -1))) / 2))::float`,
      })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), sql`(${jobs.extracted}->>'salaryMinLpa')::numeric > 0`))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),
    db
      .select({ mode: sql<string>`${jobs.extracted}->>'workMode'`, n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), isNotNull(jobs.extracted)))
      .groupBy(sql`1`),
    getMasterCv(userId),
  ]);

  const cvText = master ? cvToPlainText(master.data) + "\n" + master.extraFacts : "";
  const jds = totals?.jds ?? 0;
  const topSkills: SkillDemand[] = top.map((t) => ({
    ...t,
    share: jds ? t.jobs / jds : 0,
    inCv: cvText ? textHasSkill(cvText, t.skill) : false,
  }));

  // Weekly trend for the 4 most-demanded skills (4 lines keep every pair distinguishable).
  const trendSkills = topSkills.slice(0, 4).map((s) => s.skill);
  const trendRows = trendSkills.length
    ? await db
        .select({
          week: sql<string>`to_char(date_trunc('week', ${jobs.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`,
          skill: jobSkills.skill,
          n: sql<number>`count(distinct ${jobs.id})::int`,
        })
        .from(jobSkills)
        .innerJoin(jobs, eq(jobs.id, jobSkills.jobId))
        .where(and(eq(jobSkills.userId, userId), inArray(jobSkills.skill, trendSkills), gte(jobs.createdAt, since)))
        .groupBy(sql`1`, jobSkills.skill)
    : [];
  const weeks = new Map<string, Record<string, string | number>>();
  // Every week in the window, so weeks without saved jobs show as zero instead of vanishing.
  const start = new Date(since);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (trendSkills.length) {
    for (let d = new Date(start); d <= new Date(); d.setUTCDate(d.getUTCDate() + 7)) {
      const key = d.toISOString().slice(0, 10);
      weeks.set(key, Object.fromEntries([["week", key], ...trendSkills.map((s) => [s, 0])]));
    }
  }
  for (const r of trendRows) {
    const row = weeks.get(r.week) ?? Object.fromEntries([["week", r.week], ...trendSkills.map((s) => [s, 0])]);
    row[r.skill] = r.n;
    weeks.set(r.week, row);
  }

  const expMap = new Map(exp.map((e) => [e.bucket, e.n]));
  const mySkills = master
    ? [...new Set([...master.data.skills.flatMap((g) => g.items).map(canonicalSkill), ...extractSkills(cvText)])]
    : [];

  return {
    jds,
    recentJds: totals?.recent ?? 0,
    hasCv: Boolean(master),
    topSkills,
    trendSkills,
    trend: [...weeks.values()].sort((a, b) => String(a.week).localeCompare(String(b.week))),
    roles,
    experience: EXPERIENCE_BUCKETS.map((b) => ({ label: b, value: expMap.get(b) ?? 0 })),
    salary,
    workModes: modes.filter((m) => m.mode && m.mode !== "unknown"),
    mySkills,
  };
}
