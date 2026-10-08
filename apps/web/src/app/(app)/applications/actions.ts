"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  APPLICATION_STATUSES,
  JOB_SOURCES,
  STATUS_LABELS,
  type ApplicationStatus,
} from "@tjob/shared";
import { applications, db, emails, mailAccounts, profile } from "@/db";
import { aiErrorMessage } from "@/lib/ai/client";
import { draftFollowUp } from "@/lib/ai/followup";
import {
  addEvent,
  changeStatus,
  createApplication,
  getApplication,
  touchActivity,
} from "@/lib/applications";
import { decryptSecret } from "@/lib/crypto";
import { renderCvPdf } from "@/lib/cv/render";
import { CvError, cvFileName, getCvVersion, getMasterCv, tailorForJob } from "@/lib/cv/service";
import { ensureJobExtracted, getJob, upsertJob } from "@/lib/jobs";
import { sendMail } from "@/lib/mail/smtp";
import { requireUser } from "@/lib/session";

export type ActionState = { ok: boolean; message?: string } | undefined;

const createSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(300),
  title: z.string().trim().min(1, "Job title is required").max(300),
  source: z.enum(JOB_SOURCES),
  url: z.string().trim().max(2000).default(""),
  location: z.string().trim().max(300).default(""),
  description: z.string().max(60000).default(""),
  status: z.enum(["saved", "applied"]),
  appliedAt: z.string().optional(),
  tailor: z.string().optional(),
});

export async function createApplicationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const externalId =
    d.source === "linkedin"
      ? (d.url.match(/jobs\/view\/(\d{6,})/)?.[1] ?? null)
      : d.source === "naukri"
        ? (d.url.match(/-(\d{9,})(?:\?|$)/)?.[1] ?? null)
        : null;

  let jobId: string | null = null;
  if (d.description.trim()) {
    const job = await upsertJob(user.id, {
      source: d.source,
      externalId,
      url: d.url,
      title: d.title,
      company: d.company,
      location: d.location,
      description: d.description,
      capturedVia: "manual",
    });
    jobId = job.id;
  }
  const appliedAt = d.status === "applied" ? (d.appliedAt ? new Date(d.appliedAt) : new Date()) : null;
  const app = await createApplication(user.id, {
    source: d.source,
    externalId,
    company: d.company,
    title: d.title,
    location: d.location,
    jobUrl: d.url,
    jobId,
    status: d.status,
    appliedAt,
    captureMethod: "manual",
  });

  let target = `/applications/${app.id}`;
  if (jobId) {
    if (d.tailor === "on") {
      try {
        const v = await tailorForJob(user.id, jobId, { captureMethod: "manual" });
        target = `/cv/${v.id}`;
      } catch (err) {
        return { ok: false, message: `Saved, but tailoring failed: ${aiErrorMessage(err)}` };
      }
    } else {
      const job = await getJob(user.id, jobId);
      if (job) await ensureJobExtracted(user.id, job).catch(() => null);
    }
  }
  revalidatePath("/applications");
  redirect(target);
}

export async function updateStatusAction(appId: string, status: ApplicationStatus) {
  const user = await requireUser();
  if (!APPLICATION_STATUSES.includes(status)) return;
  const app = await getApplication(user.id, appId);
  if (!app) return;
  await changeStatus(app, status, { auto: false, detail: `Changed to ${STATUS_LABELS[status]} by you` });
  revalidatePath(`/applications/${appId}`);
  revalidatePath("/applications");
}

export async function saveNotesAction(appId: string, notes: string) {
  const user = await requireUser();
  await db
    .update(applications)
    .set({ notes: notes.slice(0, 20000) })
    .where(and(eq(applications.userId, user.id), eq(applications.id, appId)));
  revalidatePath(`/applications/${appId}`);
}

export async function saveJdAction(appId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const app = await getApplication(user.id, appId);
  if (!app) return { ok: false, message: "Application not found" };
  const description = String(form.get("description") ?? "").trim();
  if (description.length < 50) return { ok: false, message: "Paste the full job description (at least a few lines)." };

  const job = await upsertJob(user.id, {
    source: app.source,
    externalId: app.externalId,
    url: app.jobUrl,
    title: app.title,
    company: app.company,
    location: app.location,
    description,
    capturedVia: "manual",
  });
  if (app.jobId !== job.id) {
    await db.update(applications).set({ jobId: job.id }).where(eq(applications.id, app.id));
  }
  try {
    await ensureJobExtracted(user.id, job);
  } catch (err) {
    return { ok: true, message: `Saved. Requirement extraction failed: ${aiErrorMessage(err)}` };
  }
  revalidatePath(`/applications/${appId}`);
  return { ok: true, message: "Job description saved" };
}

export async function tailorForApplicationAction(appId: string, focusNote: string): Promise<ActionState> {
  const user = await requireUser();
  const app = await getApplication(user.id, appId);
  if (!app?.jobId) return { ok: false, message: "Add the job description first." };
  let versionId: string;
  try {
    versionId = (await tailorForJob(user.id, app.jobId, { focusNote })).id;
  } catch (err) {
    return { ok: false, message: err instanceof CvError ? err.message : aiErrorMessage(err) };
  }
  redirect(`/cv/${versionId}`);
}

export async function attachCvAction(appId: string, cvVersionId: string | null) {
  const user = await requireUser();
  const app = await getApplication(user.id, appId);
  if (!app) return;
  if (cvVersionId && !(await getCvVersion(user.id, cvVersionId))) return;
  await db.update(applications).set({ cvVersionId }).where(eq(applications.id, app.id));
  if (cvVersionId) await addEvent(app.id, "cv_attached", "CV version attached");
  revalidatePath(`/applications/${appId}`);
}

export async function deleteApplicationAction(appId: string) {
  const user = await requireUser();
  await db.delete(applications).where(and(eq(applications.userId, user.id), eq(applications.id, appId)));
  revalidatePath("/applications");
  redirect("/applications");
}

export async function draftFollowUpAction(
  appId: string,
): Promise<{ ok: true; subject: string; body: string; to: string } | { ok: false; message: string }> {
  const user = await requireUser();
  const app = await getApplication(user.id, appId);
  if (!app) return { ok: false, message: "Application not found" };
  const [lastEmail] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.applicationId, app.id), eq(emails.direction, "in")))
    .orderBy(desc(emails.receivedAt))
    .limit(1);
  const [prof] = await db.select().from(profile).where(eq(profile.userId, user.id));
  const master = await getMasterCv(user.id);
  try {
    const draft = await draftFollowUp(user.id, {
      candidateName: prof?.fullName || user.name,
      candidateSummary: master?.data.summary ?? "",
      company: app.company,
      title: app.title,
      appliedOn: app.appliedAt?.toDateString() ?? "",
      status: STATUS_LABELS[app.status],
      lastEmailSubject: lastEmail?.subject ?? "",
    });
    const to =
      lastEmail && !/no-?reply|donotreply|notifications?@/i.test(lastEmail.fromAddress) ? lastEmail.fromAddress : "";
    return { ok: true, ...draft, to };
  } catch (err) {
    return { ok: false, message: aiErrorMessage(err) };
  }
}

const sendSchema = z.object({
  to: z.string().trim().email("Enter the recruiter's email address"),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10000),
  attachCv: z.boolean(),
});

export async function sendFollowUpAction(appId: string, input: z.infer<typeof sendSchema>): Promise<ActionState> {
  const user = await requireUser();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };
  const app = await getApplication(user.id, appId);
  if (!app) return { ok: false, message: "Application not found" };
  const [acc] = await db.select().from(mailAccounts).where(eq(mailAccounts.userId, user.id));
  if (!acc?.smtpHost) return { ok: false, message: "Set up SMTP in Settings → Email first." };

  const attachments = [];
  if (parsed.data.attachCv && app.cvVersionId) {
    const v = await getCvVersion(user.id, app.cvVersionId);
    if (v) {
      attachments.push({
        filename: cvFileName(v.data, v.title),
        content: await renderCvPdf(v.data, v.title),
        contentType: "application/pdf",
      });
    }
  }
  const [lastIn] = await db
    .select({ messageId: emails.messageId, threadKey: emails.threadKey })
    .from(emails)
    .where(and(eq(emails.applicationId, app.id), eq(emails.direction, "in")))
    .orderBy(desc(emails.receivedAt))
    .limit(1);

  let messageId: string;
  try {
    messageId = await sendMail(
      {
        host: acc.smtpHost,
        port: acc.smtpPort,
        secure: acc.smtpSecure,
        user: acc.smtpUser || acc.imapUser,
        pass: decryptSecret(acc.smtpPasswordEnc || acc.imapPasswordEnc),
      },
      {
        from: acc.fromName ? `"${acc.fromName}" <${acc.emailAddress}>` : acc.emailAddress,
        to: parsed.data.to,
        subject: parsed.data.subject,
        text: parsed.data.body,
        inReplyTo: lastIn?.messageId,
        attachments,
      },
    );
  } catch (err) {
    return { ok: false, message: `Couldn't send: ${err instanceof Error ? err.message : String(err)}` };
  }

  const now = new Date();
  const [row] = await db
    .insert(emails)
    .values({
      userId: user.id,
      mailAccountId: acc.id,
      direction: "out",
      messageId: messageId || `<sent-${now.getTime()}@tjob>`,
      threadKey: lastIn?.threadKey ?? messageId ?? `<sent-${now.getTime()}@tjob>`,
      fromAddress: acc.emailAddress,
      toAddress: parsed.data.to,
      subject: parsed.data.subject,
      snippet: parsed.data.body.slice(0, 400),
      receivedAt: now,
      category: "other",
      classifiedBy: "user",
      summary: "Follow-up you sent",
      applicationId: app.id,
    })
    .onConflictDoNothing()
    .returning({ id: emails.id });
  await addEvent(app.id, "followup_sent", `Follow-up sent to ${parsed.data.to}`, row?.id);
  await touchActivity(app.id, now);
  revalidatePath(`/applications/${appId}`);
  return { ok: true, message: "Follow-up sent" };
}
