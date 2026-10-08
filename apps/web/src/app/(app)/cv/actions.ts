"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { cvSchema, emptyCv, type Cv } from "@tjob/shared";
import { cvVersions, db, masterCv } from "@/db";
import { aiErrorMessage } from "@/lib/ai/client";
import { parseCvPdf } from "@/lib/ai/parse-cv";
import { CvError, getCvVersion, getMasterCv, tailorForJob, updateCvVersion } from "@/lib/cv/service";
import { upsertJob } from "@/lib/jobs";
import { requireUser } from "@/lib/session";

export type ActionState = { ok: boolean; message?: string } | undefined;

const MAX_PDF_BYTES = 4 * 1024 * 1024;

export async function uploadMasterCvAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose your CV as a PDF file." };
  if (file.size > MAX_PDF_BYTES) return { ok: false, message: "The PDF is larger than 4 MB." };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") return { ok: false, message: "That file isn't a PDF." };

  let data: Cv;
  try {
    data = await parseCvPdf(user.id, bytes);
  } catch (err) {
    return { ok: false, message: `Couldn't read the CV: ${aiErrorMessage(err)}` };
  }
  const values = { originalFileName: file.name.slice(0, 200), originalPdf: bytes, data, parsedAt: new Date() };
  await db
    .insert(masterCv)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: masterCv.userId, set: values });
  revalidatePath("/cv");
  return { ok: true, message: "CV read. Check every section below, fix anything the PDF mangled, and save." };
}

/** Start from an empty CV (no AI needed). */
export async function startBlankCvAction() {
  const user = await requireUser();
  const data = emptyCv();
  data.contact.name = user.name;
  data.contact.email = user.email;
  await db.insert(masterCv).values({ userId: user.id, data }).onConflictDoNothing();
  revalidatePath("/cv");
}

export async function saveMasterCvAction(input: Cv): Promise<ActionState> {
  const user = await requireUser();
  const parsed = cvSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Some fields are invalid." };
  await db.update(masterCv).set({ data: parsed.data }).where(eq(masterCv.userId, user.id));
  revalidatePath("/cv");
  return { ok: true, message: "Master CV saved" };
}

export async function saveExtraFactsAction(text: string): Promise<ActionState> {
  const user = await requireUser();
  await db
    .update(masterCv)
    .set({ extraFacts: text.slice(0, 20000) })
    .where(eq(masterCv.userId, user.id));
  revalidatePath("/cv");
  return { ok: true, message: "Extra facts saved" };
}

export async function appendExtraFactAction(fact: string, versionId: string): Promise<ActionState> {
  const user = await requireUser();
  const master = await getMasterCv(user.id);
  if (!master || !fact.trim()) return { ok: false, message: "Nothing to add." };
  const extraFacts = [master.extraFacts.trim(), `- ${fact.trim()}`].filter(Boolean).join("\n");
  await db.update(masterCv).set({ extraFacts }).where(eq(masterCv.userId, user.id));
  revalidatePath(`/cv/${versionId}`);
  return { ok: true, message: "Added to Extra facts. Re-tailor to use it." };
}

export async function tailorFromJdAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const description = String(form.get("description") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const company = String(form.get("company") ?? "").trim();
  const url = String(form.get("url") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  if (description.length < 100) return { ok: false, message: "Paste the full job description." };

  const source = /linkedin\.com/.test(url) ? "linkedin" : /naukri\.com/.test(url) ? "naukri" : "other";
  const externalId =
    source === "linkedin"
      ? (url.match(/jobs\/view\/(\d{6,})/)?.[1] ?? null)
      : source === "naukri"
        ? (url.match(/-(\d{9,})(?:\?|$)/)?.[1] ?? null)
        : null;
  const job = await upsertJob(user.id, {
    source,
    externalId,
    url,
    title,
    company,
    description,
    capturedVia: "manual",
  });
  let versionId: string;
  try {
    versionId = (await tailorForJob(user.id, job.id, { focusNote: note })).id;
  } catch (err) {
    return { ok: false, message: err instanceof CvError ? err.message : aiErrorMessage(err) };
  }
  redirect(`/cv/${versionId}`);
}

export async function saveCvVersionAction(id: string, input: Cv): Promise<ActionState> {
  const user = await requireUser();
  const parsed = cvSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Some fields are invalid." };
  try {
    await updateCvVersion(user.id, id, parsed.data);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't save" };
  }
  revalidatePath(`/cv/${id}`);
  return { ok: true, message: "Saved" };
}

export async function retailorAction(versionId: string, note: string): Promise<ActionState> {
  const user = await requireUser();
  const v = await getCvVersion(user.id, versionId);
  if (!v?.jobId) return { ok: false, message: "This version isn't linked to a job description." };
  let newId: string;
  try {
    newId = (await tailorForJob(user.id, v.jobId, { focusNote: note })).id;
  } catch (err) {
    return { ok: false, message: err instanceof CvError ? err.message : aiErrorMessage(err) };
  }
  redirect(`/cv/${newId}`);
}

export async function deleteCvVersionAction(id: string) {
  const user = await requireUser();
  await db.delete(cvVersions).where(and(eq(cvVersions.userId, user.id), eq(cvVersions.id, id)));
  revalidatePath("/cv");
  redirect("/cv");
}
