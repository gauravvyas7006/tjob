import { eq } from "drizzle-orm";
import { cvToPlainText, extractSkills, type ExtProfileResponse } from "@tjob/shared";
import { db, user } from "@/db";
import { appUrl } from "@/lib/env";
import { getMasterCv } from "@/lib/cv/service";
import { apiHandler } from "@/lib/ext-route";

/** Who is connected, plus the skills used for the extension's free local match score. */
export const GET = apiHandler(null, async (userId): Promise<ExtProfileResponse> => {
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const master = await getMasterCv(userId);
  const skills = master
    ? [
        ...new Set([
          ...master.data.skills.flatMap((g) => g.items),
          ...extractSkills(cvToPlainText(master.data) + "\n" + master.extraFacts),
        ]),
      ]
    : [];
  return { name: u?.name ?? "", skills, appUrl: appUrl() };
});
