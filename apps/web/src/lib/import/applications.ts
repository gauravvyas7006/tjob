import "server-only";
import { and, eq } from "drizzle-orm";
import { normalizeCompany, type ApplicationStatus, type CaptureMethod, type JobSource } from "@tjob/shared";
import { applications, db } from "@/db";
import { changeStatus, createApplication } from "@/lib/applications";

export interface ImportItem {
  externalId: string | null;
  url: string;
  title: string;
  company: string;
  location?: string;
  appliedAt: Date | null;
  statusText?: string;
}

/** Status text shown on LinkedIn/Naukri "applied jobs" pages → tjob status. */
export function statusFromText(text: string | undefined): ApplicationStatus {
  const t = (text ?? "").toLowerCase();
  if (/not selected|rejected|not shortlisted|declined|not moving forward|no longer under consideration/.test(t)) return "rejected";
  if (/offer/.test(t)) return "offer";
  if (/interview/.test(t)) return "interview";
  if (/assessment|test/.test(t)) return "assessment";
  if (/viewed|downloaded|shortlist|in review|under review|recruiter action/.test(t)) return "viewed";
  return "applied";
}

/**
 * Add applications from an import (LinkedIn CSV or an applied-jobs page). Existing ones (same
 * source + job id, or same company + title) only get missing dates/forward status updates.
 */
export async function importApplications(
  userId: string,
  source: JobSource,
  items: ImportItem[],
  captureMethod: CaptureMethod,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item.company && !item.title) {
      skipped++;
      continue;
    }
    const status = statusFromText(item.statusText);
    const companyKey = normalizeCompany(item.company);

    const [existing] = item.externalId
      ? await db
          .select()
          .from(applications)
          .where(
            and(eq(applications.userId, userId), eq(applications.source, source), eq(applications.externalId, item.externalId)),
          )
          .limit(1)
      : await db
          .select()
          .from(applications)
          .where(
            and(eq(applications.userId, userId), eq(applications.companyKey, companyKey), eq(applications.title, item.title)),
          )
          .limit(1);

    if (existing) {
      let changed = false;
      if (!existing.appliedAt && item.appliedAt) {
        await db.update(applications).set({ appliedAt: item.appliedAt }).where(eq(applications.id, existing.id));
        changed = true;
      }
      if (await changeStatus(existing, status, { auto: true, at: item.appliedAt ?? undefined, detail: "Updated from import" })) {
        changed = true;
      }
      if (changed) updated++;
      else skipped++;
      continue;
    }

    await createApplication(userId, {
      source,
      externalId: item.externalId,
      company: item.company,
      title: item.title,
      location: item.location ?? "",
      jobUrl: item.url,
      status,
      appliedAt: item.appliedAt,
      captureMethod,
      detail: `Imported (${captureMethod === "csv" ? "LinkedIn data export" : "applied-jobs page"})`,
    });
    created++;
  }
  return { created, updated, skipped };
}
