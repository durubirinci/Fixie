import "server-only";
import { createHash } from "node:crypto";
import type { ScanRequest, ScanResult } from "@/lib/scan/schema";

const MAX_ENTRIES = 200;
const TTL_MS = 60 * 60 * 1000;

interface Entry {
  result: ScanResult;
  expiresAt: number;
}

// Map keeps insertion order, so the first key is always the oldest entry.
const entries = new Map<string, Entry>();

/**
 * Remembers answers for the exact same photo and location for an hour, so a
 * retry or a re-upload doesn't pay for a second vision call. Keys are hashes,
 * so no image is ever kept. Per serverless instance, which is fine for this.
 */
export function cacheKey({ image, location }: ScanRequest): string {
  return createHash("sha256")
    .update(image)
    .update("\0")
    .update(location?.toLowerCase() ?? "")
    .digest("hex");
}

export function getCached(key: string, now = Date.now()): ScanResult | null {
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    entries.delete(key);
    return null;
  }
  return entry.result;
}

/** Only confident answers are cached; an "unsure" deserves a fresh try. */
export function setCached(key: string, result: ScanResult, now = Date.now()): void {
  if (result.status !== "ok") return;
  entries.delete(key);
  entries.set(key, { result, expiresAt: now + TTL_MS });
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
}

export function clearCacheForTests(): void {
  entries.clear();
}
