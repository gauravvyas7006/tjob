import "server-only";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  CATEGORY_TO_STATUS,
  normalizeCompany,
  truncate,
  type EmailCategory,
  type JobSource,
} from "@tjob/shared";
import { applications, db, emails, mailRules } from "@/db";
import { AiUnavailableError } from "@/lib/ai/budget";
import { classifyEmail, type EmailClassification } from "@/lib/ai/classify-email";
import {
  addEvent,
  changeStatus,
  createApplication,
  touchActivity,
  type Application,
} from "@/lib/applications";
import { upsertJob } from "@/lib/jobs";
import { extractAlertJobs } from "./alerts";
import { extractJobIds, senderOrg } from "./body";
import {
  applyBuiltInRules,
  applyUserRules,
  isAtsSender,
  isJobBoard,
  sourceForSender,
  type UserRule,
} from "./rules";

export type EmailRow = typeof emails.$inferSelect;

export interface IncomingMail {
  uid: number | null;
  messageId: string;
  threadKey: string;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  receivedAt: Date;
  /** Cleaned plain text, max ~3000 chars. */
  text: string;
}

export type ProcessOutcome = "rule" | "ai" | "deferred" | "review" | "duplicate" | "skipped";

/** Categories that may create a new application when no tracked application matches. */
const CREATES_APPLICATION: EmailCategory[] = [
  "application_confirmation",
  "assessment",
  "interview",
  "offer",
  "rejection",
];

export async function loadUserRules(userId: string): Promise<UserRule[]> {
  return db
    .select({
      id: mailRules.id,
      fromContains: mailRules.fromContains,
      subjectContains: mailRules.subjectContains,
      category: mailRules.category,
    })
    .from(mailRules)
    .where(eq(mailRules.userId, userId));
}

/**
 * Store one relevant email and classify it: user rules → built-in rules → AI. With
 * `deferAi`, emails that need AI are stored as "pending" for a cheaper batch run.
 */
export async function processIncomingMail(
  userId: string,
  mailAccountId: string,
  mail: IncomingMail,
  opts: { userRules: UserRule[]; deferAi: boolean },
): Promise<ProcessOutcome> {
  const [dupe] = await db
    .select({ id: emails.id })
    .from(emails)
    .where(and(eq(emails.userId, userId), eq(emails.messageId, mail.messageId)))
    .limit(1);
  if (dupe) return "duplicate";

  const ruleInput = { fromAddress: mail.fromAddress, fromName: mail.fromName, subject: mail.subject, text: mail.text };
  const builtIn = applyBuiltInRules(ruleInput);
  const userRule = applyUserRules(ruleInput, opts.userRules);

  let cls: EmailClassification | null = null;
  let by: EmailRow["classifiedBy"] = "pending";
  if (userRule) {
    cls = {
      isJobRelated: userRule.category !== "other",
      category: userRule.category,
      company: builtIn?.company ?? "",
      jobTitle: builtIn?.jobTitle ?? "",
      confidence: 0.95,
      summary: builtIn?.summary ?? truncate(mail.subject, 120),
    };
    by = "rule";
    await db
      .update(mailRules)
      .set({ hits: sql`${mailRules.hits} + 1` })
      .where(eq(mailRules.id, userRule.id));
  } else if (builtIn) {
    cls = builtIn;
    by = "rule";
  }

  if (cls && !cls.isJobRelated) return "skipped";

  // Job-alert emails become leads (jobs you haven't acted on yet) — no AI needed.
  if (cls?.category === "job_alert") {
    const source = sourceForSender(mail.fromAddress);
    if (source !== "other") {
      for (const lead of extractAlertJobs(mail.text, source).slice(0, 30)) {
        await upsertJob(userId, { ...lead, description: "", capturedVia: "email" });
      }
    }
  }

  const base = {
    userId,
    mailAccountId,
    uid: mail.uid,
    messageId: mail.messageId,
    threadKey: mail.threadKey,
    fromAddress: mail.fromAddress,
    fromName: mail.fromName,
    toAddress: mail.toAddress,
    subject: mail.subject,
    snippet: truncate(mail.text.replace(/\s+/g, " "), 400),
    receivedAt: mail.receivedAt,
  };

  if (!cls && opts.deferAi) {
    await db
      .insert(emails)
      .values({ ...base, classifiedBy: "pending", pendingBody: mail.text })
      .onConflictDoNothing();
    return "deferred";
  }

  if (!cls) {
    try {
      cls = await classifyEmail(userId, {
        from: `${mail.fromName} <${mail.fromAddress}>`,
        subject: mail.subject,
        date: mail.receivedAt.toISOString(),
        body: mail.text,
      });
      by = "ai";
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      // No AI right now: keep it for the Review list (and for AI later, if the budget resets).
      await db
        .insert(emails)
        .values({ ...base, classifiedBy: "budget", needsReview: true, pendingBody: mail.text, summary: truncate(mail.subject, 120) })
        .onConflictDoNothing();
      return "review";
    }
    if (!cls.isJobRelated) return "skipped";
  }

  const [row] = await db
    .insert(emails)
    .values({
      ...base,
      category: cls.category,
      confidence: cls.confidence,
      summary: cls.summary,
      company: cls.company,
      jobTitle: cls.jobTitle,
      classifiedBy: by,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return "duplicate";

  await linkEmail(userId, row, cls, mail.text);
  return by === "ai" ? "ai" : "rule";
}

/** Apply an AI/rule/user classification to a stored email and update the matching application. */
export async function linkEmail(
  userId: string,
  email: EmailRow,
  cls: Pick<EmailClassification, "category" | "company" | "jobTitle" | "confidence" | "isJobRelated">,
  bodyText: string,
): Promise<Application | null> {
  if (!cls.isJobRelated || cls.category === "job_alert" || cls.category === "other") {
    await db.update(emails).set({ needsReview: false, pendingBody: null }).where(eq(emails.id, email.id));
    return null;
  }

  const source = sourceForSender(email.fromAddress);
  const ids = extractJobIds(bodyText);
  const externalId = source === "linkedin" ? ids.linkedin : source === "naukri" ? ids.naukri : null;

  let app = await findApplication(userId, {
    source,
    externalId,
    threadKey: email.threadKey,
    company: cls.company,
    jobTitle: cls.jobTitle,
    fromAddress: email.fromAddress,
    excludeEmailId: email.id,
  });

  const impliedStatus = CATEGORY_TO_STATUS[cls.category];

  if (!app && CREATES_APPLICATION.includes(cls.category) && cls.company && cls.confidence >= 0.7 && impliedStatus) {
    app = await createApplication(userId, {
      source,
      externalId,
      company: cls.company,
      title: cls.jobTitle,
      jobUrl:
        externalId && source === "linkedin"
          ? `https://www.linkedin.com/jobs/view/${externalId}/`
          : "",
      status: impliedStatus,
      appliedAt: cls.category === "application_confirmation" ? email.receivedAt : null,
      captureMethod: "email",
      detail: `Created from email: ${email.subject}`,
    });
  } else if (app && impliedStatus) {
    const changed = await changeStatus(app, impliedStatus, {
      auto: true,
      at: email.receivedAt,
      emailId: email.id,
      detail: `${email.subject}`,
    });
    if (!changed) await addEvent(app.id, "email", email.subject, email.id);
    await touchActivity(app.id, email.receivedAt);
    if (!app.title && cls.jobTitle) {
      await db.update(applications).set({ title: cls.jobTitle }).where(eq(applications.id, app.id));
    }
  } else if (app) {
    await addEvent(app.id, "email", email.subject, email.id);
    await touchActivity(app.id, email.receivedAt);
  }

  await db
    .update(emails)
    .set({
      applicationId: app?.id ?? null,
      needsReview: !app || cls.confidence < 0.6,
      pendingBody: null,
    })
    .where(eq(emails.id, email.id));
  return app;
}

export async function findApplication(
  userId: string,
  q: {
    source: JobSource;
    externalId: string | null;
    threadKey: string;
    company: string;
    jobTitle: string;
    fromAddress: string;
    excludeEmailId?: string;
  },
): Promise<Application | null> {
  if (q.externalId) {
    const [byExt] = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.userId, userId), eq(applications.source, q.source), eq(applications.externalId, q.externalId)),
      )
      .limit(1);
    if (byExt) return byExt;
  }

  const [byThread] = await db
    .select({ applicationId: emails.applicationId })
    .from(emails)
    .where(and(eq(emails.userId, userId), eq(emails.threadKey, q.threadKey), isNotNull(emails.applicationId)))
    .orderBy(desc(emails.receivedAt))
    .limit(1);
  if (byThread?.applicationId) {
    const [app] = await db.select().from(applications).where(eq(applications.id, byThread.applicationId));
    if (app) return app;
  }

  const companyKey = q.company ? normalizeCompany(q.company) : "";
  if (companyKey) {
    const candidates = await db
      .select()
      .from(applications)
      .where(and(eq(applications.userId, userId), eq(applications.companyKey, companyKey)))
      .orderBy(desc(applications.lastActivityAt))
      .limit(20);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const title = q.jobTitle.toLowerCase();
      const byTitle = title
        ? candidates.find((c) => c.title && (c.title.toLowerCase().includes(title) || title.includes(c.title.toLowerCase())))
        : undefined;
      return byTitle ?? candidates[0];
    }
  }

  // Direct email from the company's own domain (not a job board / ATS).
  if (!isJobBoard(q.fromAddress) && !isAtsSender(q.fromAddress)) {
    const org = senderOrg(q.fromAddress);
    if (org.length >= 3 && !/^(gmail|yahoo|outlook|hotmail|rediffmail|icloud|proton|zoho)$/.test(org)) {
      const recent = await db
        .select()
        .from(applications)
        .where(eq(applications.userId, userId))
        .orderBy(desc(applications.lastActivityAt))
        .limit(300);
      const hit = recent.find((a) => {
        const compact = a.companyKey.replace(/\s/g, "");
        return compact.length >= 3 && (compact.includes(org) || org.includes(compact));
      });
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Apply a classification (from AI, batch results, or the user) to an email that was stored
 * earlier without one. Non-job emails are deleted rather than kept.
 */
export async function classifyStoredEmail(
  userId: string,
  email: EmailRow,
  cls: EmailClassification,
  by: EmailRow["classifiedBy"],
): Promise<void> {
  if (!cls.isJobRelated && by !== "user") {
    await db.delete(emails).where(eq(emails.id, email.id));
    return;
  }
  const [updated] = await db
    .update(emails)
    .set({
      category: cls.category,
      confidence: cls.confidence,
      summary: cls.summary || email.summary,
      company: cls.company,
      jobTitle: cls.jobTitle,
      classifiedBy: by,
    })
    .where(eq(emails.id, email.id))
    .returning();
  await linkEmail(userId, updated, cls, email.pendingBody ?? email.snippet);
}
