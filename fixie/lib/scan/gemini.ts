import "server-only";
import { DEFAULT_GEMINI_MODEL, type GeminiEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { GEMINI_SYSTEM_PROMPT, buildUserText, reportJsonSchema } from "./prompt";
import type { ScanRequest } from "./schema";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Same budget as the Claude call: below the route's maxDuration (30s).
const TIMEOUT_MS = 25_000;
// Thinking models spend output tokens before answering, so leave room.
const MAX_OUTPUT_TOKENS = 4096;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Asks Gemini to fill in the report for one photo, using its free tier.
 * Returns the parsed JSON for analyzeItem() to validate, or null on any
 * failure (timeout, quota, block, non-JSON). Never throws.
 */
export async function requestGeminiReport(input: ScanRequest, env: GeminiEnv, knowledge: string): Promise<unknown> {
  const system = knowledge ? `${GEMINI_SYSTEM_PROMPT}\n\n${knowledge}` : GEMINI_SYSTEM_PROMPT;
  const userText = buildUserText(input.location);

  let model = env.model;
  let response = await post(env, model, buildBody(input, system, userText, true));
  // 404 means Google has retired this model name; fall back to the alias.
  if (response?.status === 404 && model !== DEFAULT_GEMINI_MODEL) {
    log.warn("scan.gemini_model_not_found", { model });
    model = DEFAULT_GEMINI_MODEL;
    response = await post(env, model, buildBody(input, system, userText, true));
  }
  // An older or newer model may reject the structured-output schema. Retry
  // once with the schema in the prompt instead, and let Zod check the shape.
  if (response?.status === 400) {
    log.warn("scan.gemini_schema_rejected");
    const withSchema = `${userText}\n\nReply with JSON matching this schema:\n${JSON.stringify(reportJsonSchema())}`;
    response = await post(env, model, buildBody(input, system, withSchema, false));
  }
  if (!response) return null;
  if (!response.ok) {
    // 429 is the free tier's per-minute or daily quota running out.
    log.warn("scan.model_error", {
      provider: "gemini",
      model,
      httpStatus: response.status,
      ...(await errorDetail(response)),
    });
    return null;
  }

  const body = (await response.json().catch(() => null)) as GeminiResponse | null;
  const candidate = body?.candidates?.[0];
  if (body?.promptFeedback?.blockReason || !candidate) {
    log.warn("scan.model_refused", { provider: "gemini", reason: body?.promptFeedback?.blockReason ?? "no_candidate" });
    return null;
  }

  const text = candidate.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  try {
    return fillMissingFields(JSON.parse(stripCodeFence(text)));
  } catch {
    log.warn("scan.invalid_model_output", { provider: "gemini", finishReason: candidate.finishReason ?? null });
    return null;
  }
}

function buildBody(input: ScanRequest, system: string, userText: string, useSchema: boolean): unknown {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: "image/jpeg", data: input.image } }, { text: userText }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      ...(useSchema && { responseJsonSchema: reportJsonSchema() }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
    },
  };
}

async function post(env: GeminiEnv, model: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // SECURITY: the key goes in a header, never the URL, so it can't end up in logs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // SECURITY: log the failure kind only; the request holds the image.
    log.warn("scan.model_error", { provider: "gemini", reason: error instanceof Error ? error.name : "Unknown" });
    return null;
  }
}

/** Without a schema, models sometimes wrap JSON in a ```json fence. */
function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

/**
 * Google's error body says why a call failed ("model not found", "API key not
 * valid"). It never echoes the key or the image, so it's safe to log.
 */
async function errorDetail(response: Response): Promise<{ status?: string; message?: string }> {
  const body = (await response.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
  return { status: body?.error?.status, message: body?.error?.message?.slice(0, 200) };
}

const NULLABLE_FIELDS = ["item", "material", "fairy", "recyclable", "caution"] as const;
const ENUM_FIELDS = ["status", "fairy", "recyclable", "confidence"] as const;

/**
 * Gemini often leaves out empty fields instead of sending null or [], and
 * sometimes capitalises enum values. Fill those in so a good answer isn't
 * thrown away over formatting; Zod still checks everything else.
 */
function fillMissingFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
  const record: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const field of NULLABLE_FIELDS) record[field] ??= null;
  record.howToRecycle ??= [];
  record.repurpose ??= [];
  for (const field of ENUM_FIELDS) {
    const value = record[field];
    if (typeof value === "string") record[field] = value.trim().toLowerCase();
  }
  return record;
}
