import { extAutofillInputSchema } from "@tjob/shared";
import { autofillAnswers } from "@/lib/autofill";
import { apiHandler } from "@/lib/ext-route";

export const maxDuration = 60;

export const POST = apiHandler(extAutofillInputSchema, (userId, body) => autofillAnswers(userId, body));
