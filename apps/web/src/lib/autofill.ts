import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { normalizeQuestion, type ExtAutofillInput, type ExtAutofillResponse } from "@tjob/shared";
import { db, profile as profileTable, savedAnswers, user as userTable } from "@/db";
import { AiUnavailableError } from "./ai/budget";
import { profileFieldFor } from "./autofill-fields";
import { draftAnswers } from "./ai/answer";
import { getMasterCv } from "./cv/service";
import { getJob } from "./jobs";

type Question = ExtAutofillInput["questions"][number];

function pickOption(value: string, options: string[]): string | null {
  if (!options.length) return value;
  const v = value.trim().toLowerCase();
  const exact = options.find((o) => o.trim().toLowerCase() === v);
  if (exact) return exact;
  const partial = options.find((o) => o.toLowerCase().startsWith(v) || v.startsWith(o.toLowerCase()));
  return partial ?? null;
}

function fitToField(value: string, q: Question): string | null {
  if (!value) return null;
  if (q.type === "number") {
    const n = value.match(/\d+(\.\d+)?/);
    return n ? n[0] : null;
  }
  if (q.type === "select" || q.type === "radio") return pickOption(value, q.options);
  return value;
}

/**
 * Answers for application form fields: profile fields and saved answers first (free), then AI
 * for the remaining questions. AI answers are saved so the same question is free next time.
 */
export async function autofillAnswers(userId: string, input: ExtAutofillInput): Promise<ExtAutofillResponse> {
  const [prof] = await db.select().from(profileTable).where(eq(profileTable.userId, userId));
  const [u] = await db.select({ email: userTable.email, name: userTable.name }).from(userTable).where(eq(userTable.id, userId));
  const keys = input.questions.map((q) => normalizeQuestion(q.label));
  const saved = keys.length
    ? await db
        .select()
        .from(savedAnswers)
        .where(and(eq(savedAnswers.userId, userId), inArray(savedAnswers.questionKey, keys)))
    : [];
  const savedByKey = new Map(saved.map((s) => [s.questionKey, s]));

  const answers: ExtAutofillResponse["answers"] = [];
  const unanswered: Question[] = [];
  const usedSaved: string[] = [];

  for (const q of input.questions) {
    const key = normalizeQuestion(q.label);
    const s = savedByKey.get(key);
    const fromSaved = s ? fitToField(s.answer, q) : null;
    if (fromSaved) {
      answers.push({ id: q.id, value: fromSaved, source: "saved" });
      usedSaved.push(s!.id);
      continue;
    }
    const field = profileFieldFor(q.label);
    let raw = "";
    if (field === "email") raw = u?.email ?? "";
    else if (field && prof) raw = String(prof[field] ?? "");
    if (!raw && field === "fullName") raw = u?.name ?? "";
    const fromProfile = raw ? fitToField(raw, q) : null;
    if (fromProfile) {
      answers.push({ id: q.id, value: fromProfile, source: "profile" });
      continue;
    }
    unanswered.push(q);
  }

  if (usedSaved.length) {
    await db
      .update(savedAnswers)
      .set({ useCount: sql`${savedAnswers.useCount} + 1` })
      .where(inArray(savedAnswers.id, usedSaved));
  }

  if (unanswered.length) {
    try {
      const master = await getMasterCv(userId);
      const job = input.jobId ? await getJob(userId, input.jobId) : null;
      const drafted = await draftAnswers(userId, {
        profile: prof
          ? {
              name: prof.fullName || u?.name || "",
              email: u?.email ?? "",
              phone: prof.phone,
              location: prof.location,
              totalExperience: prof.totalExperience,
              currentCtc: prof.currentCtc,
              expectedCtc: prof.expectedCtc,
              noticePeriod: prof.noticePeriod,
              preferredLocations: prof.preferredLocations,
            }
          : { name: u?.name ?? "", email: u?.email ?? "" },
        cv: master?.data ?? null,
        job: job ? { title: job.title, company: job.company } : null,
        questions: unanswered.map((q) => ({ id: q.id, label: q.label, type: q.type, options: q.options })),
      });
      for (const q of unanswered) {
        const value = fitToField(drafted.get(q.id) ?? "", q);
        answers.push({ id: q.id, value: value ?? "", source: value ? "ai" : "none" });
        if (value) {
          await db
            .insert(savedAnswers)
            .values({ userId, questionKey: normalizeQuestion(q.label), question: q.label, answer: value, source: "ai" })
            .onConflictDoNothing();
        }
      }
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      for (const q of unanswered) answers.push({ id: q.id, value: "", source: "none" });
    }
  }
  return { answers };
}

/** Save the user's final answers (from the extension after submit, or Settings). */
export async function saveAnswers(userId: string, items: { question: string; value: string }[]) {
  for (const it of items) {
    const key = normalizeQuestion(it.question);
    if (!key || !it.value.trim()) continue;
    await db
      .insert(savedAnswers)
      .values({ userId, questionKey: key, question: it.question, answer: it.value.trim(), source: "user" })
      .onConflictDoUpdate({
        target: [savedAnswers.userId, savedAnswers.questionKey],
        set: { answer: it.value.trim(), source: "user", question: it.question },
      });
  }
}
