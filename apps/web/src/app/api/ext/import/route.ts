import { extImportInputSchema } from "@tjob/shared";
import { apiHandler } from "@/lib/ext-route";
import { importApplications } from "@/lib/import/applications";

/** "Import this page" on LinkedIn's / Naukri's applied-jobs pages. */
export const POST = apiHandler(extImportInputSchema, (userId, body) =>
  importApplications(
    userId,
    body.source,
    body.items.map((i) => ({
      ...i,
      appliedAt: i.appliedAt ? new Date(i.appliedAt) : null,
    })),
    "extension",
  ),
);
