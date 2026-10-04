import { analyzeItem } from "@/lib/scan/analyze";
import { ScanRequest } from "@/lib/scan/schema";
import { pickDemoResult } from "@/lib/scan/demo-results";
import { cacheKey, getCached, setCached } from "@/lib/scan/cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";

export const runtime = "nodejs";
// Vision calls can take 5–15s. Without this, the platform's default limit can
// kill the function mid-response, which looks like a random failure on stage.
// Must stay above the SDK timeout set in analyze.ts.
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  // SECURITY: rate-limit before parsing so abuse costs us as little as possible.
  const limit = await checkRateLimit(req);
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = ScanRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // Demo mode never calls the model, so it survives venue Wi-Fi and a missing key.
  // With no ANTHROPIC_API_KEY set, every scan is a demo scan, so the app runs for free.
  const isDemo = new URL(req.url).searchParams.get("demo") === "1" || !process.env.ANTHROPIC_API_KEY;
  if (isDemo) {
    const result = pickDemoResult(parsed.data.image);
    log.info("scan.completed", { status: result.status, isDemo });
    return Response.json(result);
  }

  const started = Date.now();
  try {
    const key = cacheKey(parsed.data);
    const cached = getCached(key);
    const result = cached ?? (await analyzeItem(parsed.data));
    if (!cached) setCached(key, result);
    log.info("scan.completed", {
      status: result.status,
      fairy: result.fairy,
      isDemo,
      isCached: cached !== null,
      ms: Date.now() - started,
    });
    return Response.json(result);
  } catch (error) {
    // analyzeItem only throws on misconfiguration (e.g. missing API key).
    log.error("scan.failed", { reason: error instanceof Error ? error.message : "Unknown" });
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
