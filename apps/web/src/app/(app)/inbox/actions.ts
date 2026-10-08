"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { CATEGORY_TO_STATUS, EMAIL_CATEGORIES, type EmailCategory } from "@tjob/shared";
import { db, emails, mailRules } from "@/db";
import { addEvent, changeStatus, getApplication, touchActivity } from "@/lib/applications";
import { classifyStoredEmail } from "@/lib/mail/process";
import { requireUser } from "@/lib/session";

async function ownEmail(userId: string, emailId: string) {
  const [row] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.userId, userId), eq(emails.id, emailId)));
  return row ?? null;
}

/** Correct an email's category; optionally remember it for every email from this sender. */
export async function recategorizeEmailAction(emailId: string, category: EmailCategory, remember: boolean) {
  const user = await requireUser();
  if (!EMAIL_CATEGORIES.includes(category)) return;
  const email = await ownEmail(user.id, emailId);
  if (!email) return;
  await classifyStoredEmail(
    user.id,
    email,
    {
      category,
      isJobRelated: category !== "other",
      company: email.company,
      jobTitle: email.jobTitle,
      confidence: 1,
      summary: email.summary,
    },
    "user",
  );
  if (remember && email.fromAddress) {
    await db.insert(mailRules).values({ userId: user.id, fromContains: email.fromAddress.toLowerCase(), category });
  }
  revalidatePath("/inbox");
}

export async function linkEmailAction(emailId: string, applicationId: string) {
  const user = await requireUser();
  const email = await ownEmail(user.id, emailId);
  const app = await getApplication(user.id, applicationId);
  if (!email || !app) return;
  await db.update(emails).set({ applicationId: app.id, needsReview: false, pendingBody: null }).where(eq(emails.id, email.id));
  const status = CATEGORY_TO_STATUS[email.category];
  const changed = status
    ? await changeStatus(app, status, { auto: true, at: email.receivedAt, emailId: email.id, detail: email.subject })
    : false;
  if (!changed) await addEvent(app.id, "email", email.subject, email.id);
  await touchActivity(app.id, email.receivedAt);
  revalidatePath("/inbox");
  revalidatePath(`/applications/${app.id}`);
}

export async function markReviewedAction(emailId: string) {
  const user = await requireUser();
  await db
    .update(emails)
    .set({ needsReview: false })
    .where(and(eq(emails.userId, user.id), eq(emails.id, emailId)));
  revalidatePath("/inbox");
}

export async function deleteEmailAction(emailId: string) {
  const user = await requireUser();
  await db.delete(emails).where(and(eq(emails.userId, user.id), eq(emails.id, emailId)));
  revalidatePath("/inbox");
}
