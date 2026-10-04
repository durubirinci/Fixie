import "server-only";
import { z } from "zod";

// Haiku is the default for speed on stage; SCAN_MODEL lets us switch to a
// more accurate model without a code change (see brief §3).
const DEFAULT_SCAN_MODEL = "claude-haiku-4-5-20251001";

const ServerEnv = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  SCAN_MODEL: z.string().trim().min(1).optional(),
});

export interface ScanEnv {
  anthropicApiKey: string;
  scanModel: string;
}

/**
 * Reads and validates the server env vars the scan route needs.
 * Throws an Error naming the missing or invalid keys (never their values),
 * so a misconfigured deploy fails loudly instead of returning wrong answers.
 */
export function getScanEnv(source: NodeJS.ProcessEnv = process.env): ScanEnv {
  const parsed = ServerEnv.safeParse({
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY,
    // An empty SCAN_MODEL= line in .env means "use the default", not "invalid".
    SCAN_MODEL: source.SCAN_MODEL || undefined,
  });
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${keys}`);
  }
  return {
    anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
    scanModel: parsed.data.SCAN_MODEL ?? DEFAULT_SCAN_MODEL,
  };
}

// Gemini's free tier: a no-cost alternative to Claude for live scans.
// An alias Google keeps pointed at its current Flash model, so the app
// doesn't break when a versioned name is retired.
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export interface GeminiEnv {
  apiKey: string;
  model: string;
}

/** Reads the Gemini key and model. Returns null when no key is set. */
export function getGeminiEnv(source: NodeJS.ProcessEnv = process.env): GeminiEnv | null {
  const apiKey = source.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: source.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL };
}

export type ScanProvider = "claude" | "gemini" | "demo";

/**
 * Which service answers live scans: Claude when its key is set, otherwise
 * Gemini's free tier when that key is set, otherwise canned demo answers.
 */
export function getScanProvider(source: NodeJS.ProcessEnv = process.env): ScanProvider {
  if (source.ANTHROPIC_API_KEY?.trim()) return "claude";
  if (source.GEMINI_API_KEY?.trim()) return "gemini";
  return "demo";
}

const RateLimitEnv = z.object({
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
});

export interface UpstashEnv {
  url: string;
  token: string;
}

/**
 * Reads the Upstash credentials for rate limiting.
 * Returns null when neither is set (local dev: the caller falls back to an
 * in-memory limiter). Throws an Error naming the bad keys (never their
 * values) when only one is set or the URL is malformed, because that is a
 * broken deploy rather than a choice.
 */
export function getUpstashEnv(source: NodeJS.ProcessEnv = process.env): UpstashEnv | null {
  const url = source.UPSTASH_REDIS_REST_URL || undefined;
  const token = source.UPSTASH_REDIS_REST_TOKEN || undefined;
  if (!url && !token) return null;

  const parsed = RateLimitEnv.safeParse({ UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token });
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${keys}`);
  }
  return { url: parsed.data.UPSTASH_REDIS_REST_URL, token: parsed.data.UPSTASH_REDIS_REST_TOKEN };
}
