import { extSaveAnswersInputSchema } from "@tjob/shared";
import { saveAnswers } from "@/lib/autofill";
import { apiHandler } from "@/lib/ext-route";

/** Final answers the user submitted, saved so the next form with the same question is free. */
export const POST = apiHandler(extSaveAnswersInputSchema, async (userId, body) => {
  await saveAnswers(userId, body.answers);
  return { saved: body.answers.length };
});
