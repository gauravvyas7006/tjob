import { after } from "next/server";
import { extJobInputSchema, type ExtSaveResponse } from "@tjob/shared";
import { applicationForJob } from "@/lib/applications";
import { apiHandler } from "@/lib/ext-route";
import { ensureJobExtracted, upsertJob } from "@/lib/jobs";

/** "Save" from the extension: store the job + full description and track it as saved. */
export const POST = apiHandler(extJobInputSchema, async (userId, body): Promise<ExtSaveResponse> => {
  const job = await upsertJob(userId, { ...body, capturedVia: "extension" });
  const app = await applicationForJob(userId, job, "extension");
  // Requirement extraction (feeds Insights) runs after the response so Save stays instant.
  after(async () => {
    try {
      await ensureJobExtracted(userId, job);
    } catch (err) {
      console.error("JD extraction failed", err);
    }
  });
  return { jobId: job.id, applicationId: app.id, status: app.status };
});
