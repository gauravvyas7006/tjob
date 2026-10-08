import "server-only";
import type { z } from "zod";
import { AiUnavailableError } from "./ai/budget";
import { AiOutputError, aiErrorMessage } from "./ai/client";
import { unauthorized, userIdFromRequest } from "./api-auth";
import { CvError } from "./cv/service";

/**
 * Wrap an extension/API handler: authenticate (session or extension token), validate the JSON
 * body, and turn known errors into clean JSON responses.
 */
export function apiHandler<S extends z.ZodType>(
  schema: S | null,
  handler: (userId: string, body: z.infer<S>, request: Request) => Promise<unknown>,
) {
  return async (request: Request) => {
    const userId = await userIdFromRequest(request);
    if (!userId) return unauthorized();
    let body: z.infer<S> = undefined as z.infer<S>;
    if (schema) {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
      }
      body = parsed.data;
    }
    try {
      const result = await handler(userId, body, request);
      return result instanceof Response ? result : Response.json(result);
    } catch (err) {
      if (err instanceof CvError) return Response.json({ error: err.message }, { status: 400 });
      if (err instanceof AiUnavailableError) return Response.json({ error: err.message }, { status: 402 });
      if (err instanceof AiOutputError) return Response.json({ error: err.message }, { status: 502 });
      console.error(err);
      return Response.json({ error: aiErrorMessage(err) }, { status: 500 });
    }
  };
}
