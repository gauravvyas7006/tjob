import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { AiFeature } from "@tjob/shared";
import { AiUnavailableError, assertAiAvailable, recordUsage } from "./budget";
import { MODELS, usageFrom } from "./pricing";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailableError("no_key");
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

interface FastCall<S extends z.ZodType> {
  userId: string;
  feature: AiFeature;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
}

/**
 * Haiku 4.5 + structured output, for high-volume extraction/classification. No caching: these
 * prompts are under Haiku's 4096-token cache minimum.
 */
export async function callFast<S extends z.ZodType>(opts: FastCall<S>): Promise<z.infer<S>> {
  await assertAiAvailable(opts.userId);
  const res = await anthropic().messages.parse({
    model: MODELS.fast,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: zodOutputFormat(opts.schema) },
  });
  await recordUsage(opts.userId, opts.feature, res.model, usageFrom(res.usage));
  if (res.stop_reason === "refusal") throw new AiOutputError("The model declined this request.");
  if (res.stop_reason === "max_tokens") throw new AiOutputError("The model's answer was cut off.");
  if (res.parsed_output == null) throw new AiOutputError("The model returned an unexpected format.");
  return res.parsed_output as z.infer<S>;
}

type BetaSystemBlock = Anthropic.Beta.Messages.BetaTextBlockParam;
type BetaContent = Anthropic.Beta.Messages.BetaContentBlockParam;

interface WriterCall<S extends z.ZodType> {
  userId: string;
  feature: AiFeature;
  /** Stable blocks first; mark the last stable block with cache_control. */
  system: BetaSystemBlock[];
  content: BetaContent[];
  schema: S;
  maxTokens: number;
}

/**
 * Sonnet 5.5 at low effort + structured output, for writing (CV tailoring / CV reading).
 * Server-side refusal fallback is enabled so a rare policy decline is retried on another model
 * within the same call; cost is recorded against whichever model actually served it.
 */
export async function callWriter<S extends z.ZodType>(opts: WriterCall<S>): Promise<z.infer<S>> {
  await assertAiAvailable(opts.userId);
  const res = await anthropic().beta.messages.parse({
    model: MODELS.writer,
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });
  await recordUsage(opts.userId, opts.feature, res.model, usageFrom(res.usage));
  if (res.stop_reason === "refusal") throw new AiOutputError("The model declined this request.");
  if (res.stop_reason === "max_tokens") throw new AiOutputError("The model's answer was cut off.");
  if (res.parsed_output == null) throw new AiOutputError("The model returned an unexpected format.");
  return res.parsed_output as z.infer<S>;
}

/** User-facing message for any AI failure. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof AiUnavailableError || err instanceof AiOutputError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected.";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit hit; try again in a minute.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error (${err.status ?? "network"}).`;
  return err instanceof Error ? err.message : "Unknown AI error";
}
