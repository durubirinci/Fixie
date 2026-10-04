import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNSURE_RESULT, type ScanResult } from "@/lib/scan/schema";

vi.mock("server-only", () => ({}));

import { cacheKey, clearCacheForTests, getCached, setCached } from "@/lib/scan/cache";

const JAR: ScanResult = { ...UNSURE_RESULT, status: "ok", item: "Glass jar", confidence: "high" };

describe("scan cache", () => {
  beforeEach(() => clearCacheForTests());

  it("keys on the photo and the location", () => {
    expect(cacheKey({ image: "QUJD" })).toBe(cacheKey({ image: "QUJD" }));
    expect(cacheKey({ image: "QUJD" })).not.toBe(cacheKey({ image: "QUJE" }));
    expect(cacheKey({ image: "QUJD", location: "Austin" })).not.toBe(cacheKey({ image: "QUJD" }));
  });

  it("returns a stored confident answer until it expires", () => {
    setCached("k", JAR, 0);
    expect(getCached("k", 1_000)).toEqual(JAR);
    expect(getCached("k", 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("never stores an unsure answer", () => {
    setCached("k", UNSURE_RESULT, 0);
    expect(getCached("k", 1)).toBeNull();
  });

  it("drops the oldest entry once full", () => {
    for (let i = 0; i <= 200; i += 1) setCached(`k${i}`, JAR, 0);
    expect(getCached("k0", 1)).toBeNull();
    expect(getCached("k200", 1)).toEqual(JAR);
  });
});
