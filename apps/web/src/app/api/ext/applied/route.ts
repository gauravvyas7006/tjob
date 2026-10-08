import { eq } from "drizzle-orm";
import { extAppliedInputSchema } from "@tjob/shared";
import { applications, db } from "@/db";
import { applicationForJob, changeStatus } from "@/lib/applications";
import { apiHandler } from "@/lib/ext-route";
import { getCvVersion } from "@/lib/cv/service";
import { getJob } from "@/lib/jobs";

/** "Mark applied" (or the extension detecting the site's own "application sent" message). */
export const POST = apiHandler(extAppliedInputSchema, async (userId, body) => {
  const job = await getJob(userId, body.jobId);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  const app = await applicationForJob(userId, job, "extension");
  if (body.cvVersionId && (await getCvVersion(userId, body.cvVersionId))) {
    await db.update(applications).set({ cvVersionId: body.cvVersionId }).where(eq(applications.id, app.id));
  }
  await changeStatus(app, "applied", { auto: true, detail: "Marked applied from the extension" });
  return { applicationId: app.id, status: "applied" };
});
