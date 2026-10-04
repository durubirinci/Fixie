import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@/lib/scan/schema";

const { mockCreate, mockFetch } = vi.hoisted(() => ({ mockCreate: vi.fn(), mockFetch: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/scan/knowledge", () => ({ getKnowledgeBlock: () => "" }));
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    static APIError = Error;
    messages = { create: mockCreate };
  }
  return { default: Anthropic };
});

import { analyzeItem, resetClientForTests } from "@/lib/scan/analyze";
import { UNSURE_RESULT } from "@/lib/scan/schema";

const JAR: ScanResult = {
  status: "ok",
  item: "Glass jar",
  material: "Glass",
  fairy: "glass",
  recyclable: "yes",
  howToRecycle: ["Rinse it out."],
  repurpose: [{ title: "Fairy lantern", steps: "Add a battery tea light." }],
  caution: null,
  confidence: "high",
};

function geminiReply(text: string, status = 200): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), {
    status,
  });
}

describe("analyzeItem with Gemini", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    mockCreate.mockReset();
    resetClientForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns Gemini's validated report and never calls Claude", async () => {
    mockFetch.mockResolvedValue(geminiReply(JSON.stringify(JAR)));
    expect(await analyzeItem({ image: "QUJD", location: "Austin, TX" })).toEqual(JAR);
    expect(mockCreate).not.toHaveBeenCalled();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/models/gemini-flash-latest:generateContent");
    // SECURITY: the key travels in a header, never in the URL.
    expect(url).not.toContain("gemini-test-key");
    expect(init.headers["x-goog-api-key"]).toBe("gemini-test-key");
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].inlineData).toEqual({ mimeType: "image/jpeg", data: "QUJD" });
    expect(body.contents[0].parts[1].text).toContain("Austin, TX");
    expect(body.generationConfig.responseJsonSchema).toBeDefined();
  });

  it("prefers Claude when both keys are set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "claude-key");
    mockCreate.mockResolvedValue({
      stop_reason: "tool_use",
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "tool_use", id: "t", name: "report_item", input: JAR }],
    });
    expect(await analyzeItem({ image: "QUJD" })).toEqual(JAR);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // SAFETY: Gemini answers get the same server-side rules as Claude's.
  it("strips reuse ideas from hazardous items", async () => {
    const battery = { ...JAR, item: "AA battery", recyclable: "special_dropoff", caution: "Tape the ends." };
    mockFetch.mockResolvedValue(geminiReply(JSON.stringify(battery)));
    expect((await analyzeItem({ image: "QUJD" })).repurpose).toEqual([]);
  });

  it("fills in fields Gemini leaves out and lowercases enum values", async () => {
    const withoutCaution: Partial<ScanResult> = { ...JAR, confidence: "High" as never, fairy: "Glass" as never };
    delete withoutCaution.caution;
    mockFetch.mockResolvedValue(geminiReply(JSON.stringify(withoutCaution)));
    expect(await analyzeItem({ image: "QUJD" })).toEqual(JAR);
  });

  it("falls back to the latest Flash model when the configured one is retired", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-1.0-pro-vision");
    mockFetch
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(geminiReply(JSON.stringify(JAR)));
    expect(await analyzeItem({ image: "QUJD" })).toEqual(JAR);
    expect(mockFetch.mock.calls[0][0]).toContain("/models/gemini-1.0-pro-vision:");
    expect(mockFetch.mock.calls[1][0]).toContain("/models/gemini-flash-latest:");
  });

  it("retries without the schema when the model rejects it", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(geminiReply("```json\n" + JSON.stringify(JAR) + "\n```"));
    expect(await analyzeItem({ image: "QUJD" })).toEqual(JAR);
    const retryBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(retryBody.generationConfig.responseJsonSchema).toBeUndefined();
  });

  it.each([
    ["the free quota is used up", () => mockFetch.mockResolvedValue(new Response("{}", { status: 429 }))],
    ["the request fails", () => mockFetch.mockRejectedValue(new Error("timeout"))],
    ["the answer isn't JSON", () => mockFetch.mockResolvedValue(geminiReply("a glass jar, probably"))],
    ["the answer has the wrong shape", () => mockFetch.mockResolvedValue(geminiReply('{"item":"jar"}'))],
    [
      "the prompt is blocked",
      () => mockFetch.mockResolvedValue(new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }))),
    ],
  ])("returns unsure when %s", async (_case, arrange) => {
    arrange();
    expect(await analyzeItem({ image: "QUJD" })).toEqual(UNSURE_RESULT);
  });
});
