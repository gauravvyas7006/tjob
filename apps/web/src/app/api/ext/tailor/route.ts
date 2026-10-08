import { z } from "zod";
import type { ExtTailorResponse } from "@tjob/shared";
import { appUrl } from "@/lib/env";
import { apiHandler } from "@/lib/ext-route";
import { ATS_BAND_LABELS } from "@/lib/cv/ats-check";
import { tailorForJob } from "@/lib/cv/service";

export const maxDuration = 120;

const schema = z.object({ jobId: z.string().uuid(), focusNote: z.string().max(1000).optional() });

/** "Tailor CV" from the extension. */
export const POST = apiHandler(schema, async (userId, body): Promise<ExtTailorResponse> => {
  const v = await tailorForJob(userId, body.jobId, { focusNote: body.focusNote, captureMethod: "extension" });
  const report = v.atsReport;
  return {
    cvVersionId: v.id,
    atsBefore: report?.beforeScore ?? v.atsBefore,
    atsAfter: report?.score ?? v.atsAfter,
    atsBand: report ? ATS_BAND_LABELS[report.band] : "",
    gaps: v.gaps.map((g) => g.requirement),
    pdfUrl: `${appUrl()}/api/cv/${v.id}/pdf`,
    editUrl: `${appUrl()}/cv/${v.id}`,
  };
});
