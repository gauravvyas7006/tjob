"use server";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { AGENCY_KINDS, AGENCY_STATUSES, type AgencyStatus } from "@tjob/shared";
import { agencies, db } from "@/db";
import { addSuggestedAgencies, normalizeUrl, setAgencyStatus } from "@/lib/agencies/service";
import { requireUser } from "@/lib/session";

export type ActionState = { ok: boolean; message?: string } | undefined;

const text = (max: number) => z.string().trim().max(max).default("");
const url = z.string().trim().max(2000).default("").transform(normalizeUrl);

const agencySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  kind: z.enum(AGENCY_KINDS),
  area: text(200),
  focus: text(1000),
  website: url,
  applyUrl: url,
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]).default(""),
  phone: text(100),
  linkedinUrl: url,
  howToApproach: text(2000),
});

/** Creates an agency, or updates one when `id` is set. */
export async function saveAgencyAction(id: string | null, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = agencySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const [clash] = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(and(eq(agencies.userId, user.id), eq(agencies.name, d.name), ...(id ? [ne(agencies.id, id)] : [])))
    .limit(1);
  if (clash) return { ok: false, message: `${d.name} is already on your list.` };

  if (id) {
    await db
      .update(agencies)
      .set(d)
      .where(and(eq(agencies.userId, user.id), eq(agencies.id, id)));
  } else {
    await db.insert(agencies).values({ ...d, userId: user.id, origin: "user" });
  }
  revalidatePath("/agencies");
  return { ok: true, message: id ? "Saved" : `Added ${d.name}` };
}

export async function setAgencyStatusAction(id: string, status: AgencyStatus) {
  const user = await requireUser();
  if (!AGENCY_STATUSES.includes(status)) return;
  await setAgencyStatus(user.id, id, status);
  revalidatePath("/agencies");
}

export async function saveAgencyNotesAction(id: string, notes: string) {
  const user = await requireUser();
  await db
    .update(agencies)
    .set({ notes: notes.slice(0, 20000) })
    .where(and(eq(agencies.userId, user.id), eq(agencies.id, id)));
  revalidatePath("/agencies");
}

export async function deleteAgencyAction(id: string) {
  const user = await requireUser();
  await db.delete(agencies).where(and(eq(agencies.userId, user.id), eq(agencies.id, id)));
  revalidatePath("/agencies");
}

export async function addSuggestedAgenciesAction(): Promise<number> {
  const user = await requireUser();
  const added = await addSuggestedAgencies(user.id);
  revalidatePath("/agencies");
  return added;
}
