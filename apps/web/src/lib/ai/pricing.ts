/** Anthropic list prices, USD per million tokens (Claude API, October 2026). */
interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  /** 5-minute TTL cache write */
  cacheWrite: number;
}

export const MODELS = {
  /** Cheap and fast: email sorting, JD extraction, short answers. */
  fast: "claude-haiku-4-5",
  /** Writing quality: CV tailoring and CV reading. */
  writer: "claude-sonnet-5-5",
} as const;

const PRICES: Record<string, ModelPrice> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

// Unknown model (e.g. a server-side refusal fallback): bill conservatively at Opus rates.
const FALLBACK_PRICE: ModelPrice = PRICES["claude-opus-5-5"];

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function priceFor(model: string): ModelPrice {
  const exact = PRICES[model];
  if (exact) return exact;
  const prefix = Object.keys(PRICES).find((k) => model.startsWith(k));
  return prefix ? PRICES[prefix] : FALLBACK_PRICE;
}

export function costUsd(model: string, u: TokenUsage, batch = false): number {
  const p = priceFor(model);
  const cost =
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.cacheRead +
      u.cacheWriteTokens * p.cacheWrite) /
    1_000_000;
  return batch ? cost / 2 : cost;
}

/** Normalize an SDK `usage` object. */
export function usageFrom(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): TokenUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}
