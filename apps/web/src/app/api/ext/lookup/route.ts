import { and, eq } from "drizzle-orm";
import { JOB_SOURCES, type ExtLookupResponse, type JobSource } from "@tjob/shared";
import { applications, db, jobs } from "@/db";
import { apiHandler } from "@/lib/ext-route";

/** Is this job (by source + external id, or URL) already saved/applied? */
export const GET = apiHandler(null, async (userId, _body, request): Promise<ExtLookupResponse> => {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") as JobSource | null;
  const externalId = params.get("externalId");
  const url = params.get("url");
  const none: ExtLookupResponse = { found: false, jobId: null, applicationId: null, status: null, appliedAt: null, cvVersionId: null };
  if (!source || !JOB_SOURCES.includes(source)) return none;

  const [app] = externalId
    ? await db
        .select()
        .from(applications)
        .where(and(eq(applications.userId, userId), eq(applications.source, source), eq(applications.externalId, externalId)))
        .limit(1)
    : url
      ? await db
          .select()
          .from(applications)
          .where(and(eq(applications.userId, userId), eq(applications.jobUrl, url)))
          .limit(1)
      : [];
  let jobId = app?.jobId ?? null;
  if (!jobId && externalId) {
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.source, source), eq(jobs.externalId, externalId)))
      .limit(1);
    jobId = job?.id ?? null;
  }
  if (!app && !jobId) return none;
  return {
    found: true,
    jobId,
    applicationId: app?.id ?? null,
    status: app?.status ?? null,
    appliedAt: app?.appliedAt?.toISOString() ?? null,
    cvVersionId: app?.cvVersionId ?? null,
  };
});
