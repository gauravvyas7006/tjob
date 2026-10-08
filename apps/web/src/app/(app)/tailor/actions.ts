"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiErrorMessage } from "@/lib/ai/client";
import { MAX_TAILOR_REQUEST } from "@/lib/cv/chat";
import { CvError, tailorForJob } from "@/lib/cv/service";
import { pastedJobInput, upsertJob } from "@/lib/jobs";
import { requireUser } from "@/lib/session";

export type ChatResult = { ok: true; jobId: string } | { ok: false; message: string };

function failure(err: unknown): ChatResult {
  return { ok: false, message: err instanceof CvError ? err.message : aiErrorMessage(err) };
}

/** A pasted job description: save the job and tailor the CV. The client then opens its conversation. */
export async function startTailorChatAction(text: string): Promise<ChatResult> {
  const user = await requireUser();
  const description = text.trim();
  if (description.length < 100) {
    return { ok: false, message: "That looks too short for a job description. Paste the whole description." };
  }
  if (description.length > 30_000) return { ok: false, message: "That's longer than any job description. Paste just the one job." };
  const job = await upsertJob(user.id, pastedJobInput({ description }));
  try {
    await tailorForJob(user.id, job.id);
  } catch (err) {
    return failure(err);
  }
  revalidatePath("/tailor");
  revalidatePath("/cv");
  return { ok: true, jobId: job.id };
}

/** A follow-up in a conversation ("lead with my Node.js work"): tailor again with that note. */
export async function refineTailorChatAction(jobId: string, text: string): Promise<ChatResult> {
  const user = await requireUser();
  const note = text.trim();
  if (!z.uuid().safeParse(jobId).success || !note) return { ok: false, message: "Nothing to send." };
  if (note.length > MAX_TAILOR_REQUEST) {
    return { ok: false, message: `Keep requests under ${MAX_TAILOR_REQUEST} characters.` };
  }
  try {
    await tailorForJob(user.id, jobId, { focusNote: note });
  } catch (err) {
    return failure(err);
  }
  revalidatePath("/tailor");
  revalidatePath("/cv");
  return { ok: true, jobId };
}
