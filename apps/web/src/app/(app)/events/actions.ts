"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EVENT_MARKS, EVENT_SOURCE_LABELS, type EventMark } from "@tjob/shared";
import { refreshEvents, setEventMark } from "@/lib/events/service";
import { requireUser } from "@/lib/session";

/** "Refresh now". Skips the fetch when the listings were read in the last 10 minutes. */
export async function refreshEventsAction(): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const res = await refreshEvents({ ifOlderThanMs: 10 * 60_000 });
  revalidatePath("/events");
  if (res.skipped) return { ok: true, message: "Already up to date: checked in the last 10 minutes" };
  const failed = res.sources.filter((s) => s.error);
  const found = res.sources
    .filter((s) => !s.error)
    .map((s) => `${EVENT_SOURCE_LABELS[s.source]} ${s.count}`)
    .join(", ");
  const errors = failed.map((s) => `${EVENT_SOURCE_LABELS[s.source]}: ${s.error}`).join("; ");
  return {
    ok: failed.length < res.sources.length,
    message: [found && `Events found: ${found}`, errors && `Couldn't read ${errors}`].filter(Boolean).join(". "),
  };
}

export async function setEventMarkAction(eventId: string, mark: EventMark | null) {
  const user = await requireUser();
  if (!z.uuid().safeParse(eventId).success || (mark !== null && !EVENT_MARKS.includes(mark))) return;
  await setEventMark(user.id, eventId, mark);
  revalidatePath("/events");
}
