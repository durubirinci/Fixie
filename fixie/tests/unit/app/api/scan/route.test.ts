import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/scan/route";
import { clearCacheForTests } from "@/lib/scan/cache";
import { ScanResult, UNSURE_RESULT } from "@/lib/scan/schema";

const { mockAnalyze, mockCheckRateLimit } = vi.hoisted(() => ({
  mockAnalyze: vi.fn(),
  mockCheckRateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/scan/analyze", () => ({ analyzeItem: mockAnalyze }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));

function post(body: unknown, { isDemo = true } = {}): Request {
  return new Request(`http://localhost/api/scan${isDemo ? "?demo=1" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/scan", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    mockCheckRateLimit.mockResolvedValue({ ok: true });
    clearCacheForTests();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns 429 with Retry-After when the caller is rate-limited, before calling the model", async () => {
    mockCheckRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 42 });
    mockAnalyze.mockClear();
    const response = await POST(post({ image: "QUJD" }, { isDemo: false }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("rate-limits even malformed bodies, so abuse can't skip the limiter", async () => {
    mockCheckRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 5 });
    expect((await POST(post("not json"))).status).toBe(429);
  });

  it("returns 400 for a body that isn't JSON", async () => {
    expect((await POST(post("not json"))).status).toBe(400);
  });

  it("returns 400 when the image is missing", async () => {
    expect((await POST(post({ location: "Austin, TX" }))).status).toBe(400);
  });

  it("returns 200 with a contract-shaped result", async () => {
    const response = await POST(post({ image: "QUJD" }));
    expect(response.status).toBe(200);
    expect(ScanResult.safeParse(await response.json()).success).toBe(true);
  });

  it("answers demo requests without calling the model", async () => {
    mockAnalyze.mockClear();
    await POST(post({ image: "QUJD" }));
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("serves demo results without calling the model when no API key is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockAnalyze.mockClear();
    const response = await POST(post({ image: "QUJD" }, { isDemo: false }));
    expect(response.status).toBe(200);
    expect(ScanResult.safeParse(await response.json()).success).toBe(true);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("returns the model's result for live requests", async () => {
    mockAnalyze.mockResolvedValue(UNSURE_RESULT);
    const response = await POST(post({ image: "QUJD" }, { isDemo: false }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(UNSURE_RESULT);
  });

  it("returns 500 without details when the server is misconfigured", async () => {
    mockAnalyze.mockRejectedValue(new Error("Missing or invalid environment variables: ANTHROPIC_API_KEY"));
    const response = await POST(post({ image: "QUJD" }, { isDemo: false }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
  });

  it("answers a repeat of the same photo from the cache without calling the model again", async () => {
    const jar: ScanResult = { ...UNSURE_RESULT, status: "ok", item: "Glass jar", confidence: "high" };
    mockAnalyze.mockReset();
    mockAnalyze.mockResolvedValue(jar);
    await POST(post({ image: "SkFS" }, { isDemo: false }));
    const second = await POST(post({ image: "SkFS" }, { isDemo: false }));
    expect(await second.json()).toEqual(jar);
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });
});
