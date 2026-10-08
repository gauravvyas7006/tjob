"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiTokens, db, mailAccounts, profile, savedAnswers } from "@/db";
import { saveAnswers } from "@/lib/autofill";
import { decryptSecret, encryptSecret, newApiToken, sha256 } from "@/lib/crypto";
import { importApplications } from "@/lib/import/applications";
import { parseLinkedInApplicationsCsv } from "@/lib/import/linkedin-csv";
import { testImap } from "@/lib/mail/imap";
import { testSmtp } from "@/lib/mail/smtp";
import { requireUser } from "@/lib/session";

export type ActionState = { ok: boolean; message?: string } | undefined;

const profileSchema = z.object({
  fullName: z.string().trim().max(200),
  phone: z.string().trim().max(50),
  location: z.string().trim().max(200),
  totalExperience: z.string().trim().max(50),
  currentCtc: z.string().trim().max(100),
  expectedCtc: z.string().trim().max(100),
  noticePeriod: z.string().trim().max(100),
  preferredLocations: z.string().trim().max(300),
  linkedinUrl: z.string().trim().max(300),
  githubUrl: z.string().trim().max(300),
  portfolioUrl: z.string().trim().max(300),
});

export async function saveProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };
  await db
    .insert(profile)
    .values({ userId: user.id, ...parsed.data })
    .onConflictDoUpdate({ target: profile.userId, set: parsed.data });
  revalidatePath("/settings");
  return { ok: true, message: "Profile saved" };
}

const mailSchema = z.object({
  emailAddress: z.string().trim().email("Enter the mailbox's email address"),
  imapHost: z.string().trim().min(3, "IMAP host is required"),
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapSecure: z.string().optional(),
  imapUser: z.string().trim().min(1, "IMAP username is required"),
  imapPassword: z.string().optional(),
  smtpHost: z.string().trim().optional().default(""),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
  smtpSecure: z.string().optional(),
  smtpUser: z.string().trim().optional().default(""),
  smtpPassword: z.string().optional(),
  fromName: z.string().trim().max(200).optional().default(""),
  backfillDays: z.coerce.number().int().min(7).max(365).default(90),
});

export async function saveMailAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = mailSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const [existing] = await db.select().from(mailAccounts).where(eq(mailAccounts.userId, user.id));

  const imapPass = d.imapPassword || (existing ? decryptSecret(existing.imapPasswordEnc) : "");
  if (!imapPass) return { ok: false, message: "Enter the mailbox password / app password." };
  const smtpPass = d.smtpPassword || (existing?.smtpPasswordEnc ? decryptSecret(existing.smtpPasswordEnc) : imapPass);

  try {
    await testImap({ host: d.imapHost, port: d.imapPort, secure: d.imapSecure === "on", user: d.imapUser, pass: imapPass });
  } catch (err) {
    return { ok: false, message: `IMAP login failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (d.smtpHost) {
    try {
      await testSmtp({
        host: d.smtpHost,
        port: d.smtpPort,
        secure: d.smtpSecure === "on",
        user: d.smtpUser || d.imapUser,
        pass: smtpPass,
      });
    } catch (err) {
      return { ok: false, message: `IMAP works, but SMTP login failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const sameMailbox = existing && existing.imapHost === d.imapHost && existing.imapUser === d.imapUser;
  const values = {
    emailAddress: d.emailAddress,
    imapHost: d.imapHost,
    imapPort: d.imapPort,
    imapSecure: d.imapSecure === "on",
    imapUser: d.imapUser,
    imapPasswordEnc: encryptSecret(imapPass),
    smtpHost: d.smtpHost,
    smtpPort: d.smtpPort,
    smtpSecure: d.smtpSecure === "on",
    smtpUser: d.smtpUser,
    smtpPasswordEnc: d.smtpHost ? encryptSecret(smtpPass) : "",
    fromName: d.fromName,
    backfillDays: d.backfillDays,
    ...(sameMailbox
      ? {}
      : { uidValidity: null, lastUid: 0, backfillDone: false, lastSyncedAt: null, lastSyncError: null }),
  };
  await db
    .insert(mailAccounts)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: mailAccounts.userId, set: values });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: sameMailbox
      ? "Mailbox settings saved."
      : `Connected. Click "Sync now" to read the last ${d.backfillDays} days (the first sync may take a few runs).`,
  };
}

export async function deleteMailAccountAction() {
  const user = await requireUser();
  await db.delete(mailAccounts).where(eq(mailAccounts.userId, user.id));
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function createApiTokenAction(name: string): Promise<{ token: string }> {
  const user = await requireUser();
  const token = newApiToken();
  await db.insert(apiTokens).values({ userId: user.id, name: name.trim().slice(0, 100) || "Chrome extension", tokenHash: sha256(token) });
  revalidatePath("/settings");
  return { token };
}

export async function revokeApiTokenAction(id: string) {
  const user = await requireUser();
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.userId, user.id), eq(apiTokens.id, id)));
  revalidatePath("/settings");
}

export async function importLinkedInCsvAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the Job Applications CSV file." };
  if (file.size > 3 * 1024 * 1024) return { ok: false, message: "File is larger than 3 MB." };
  const { rows, errors } = parseLinkedInApplicationsCsv(await file.text());
  if (errors.length) return { ok: false, message: errors.join(" ") };
  if (!rows.length) return { ok: false, message: "No applications found in that file." };
  const r = await importApplications(
    user.id,
    "linkedin",
    rows.map((row) => ({ ...row })),
    "csv",
  );
  revalidatePath("/applications");
  return { ok: true, message: `Imported ${r.created} new, updated ${r.updated}, skipped ${r.skipped} already tracked.` };
}

export async function addSavedAnswerAction(question: string, answer: string): Promise<ActionState> {
  const user = await requireUser();
  if (!question.trim() || !answer.trim()) return { ok: false, message: "Enter a question and an answer." };
  await saveAnswers(user.id, [{ question, value: answer }]);
  revalidatePath("/settings");
  return { ok: true, message: "Saved" };
}

export async function deleteSavedAnswerAction(id: string) {
  const user = await requireUser();
  await db.delete(savedAnswers).where(and(eq(savedAnswers.userId, user.id), eq(savedAnswers.id, id)));
  revalidatePath("/settings");
}
