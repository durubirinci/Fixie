import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getGeminiEnv, getScanEnv, getScanProvider } from "@/lib/env";
import { log } from "@/lib/log";
import { requestGeminiReport } from "./gemini";
import { getKnowledgeBlock } from "./knowledge";
import { REPORT_TOOL, REPORT_TOOL_NAME, SYSTEM_PROMPT, buildUserText } from "./prompt";
import { ScanResult, UNSURE_RESULT, type ScanRequest } from "./schema";

// Timeout sits below the route's maxDuration (30s) so we fail gracefully
// with UNSURE_RESULT instead of the platform killing the request. One retry
// at most: a second timeout would overrun maxDuration anyway.
const SDK_TIMEOUT_MS = 25_000;
const MAX_TOKENS = 1024;

// Created on first use rather than at import, so a build or a test that never
// scans doesn't need the API key.
let client: Anthropic | null = null;
let model: string | null = null;

function getClient(): { client: Anthropic; model: string } {
  if (!client || !model) {
    const env = getScanEnv();
    // SECURITY: the key is only ever read here, on the server.
    client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: SDK_TIMEOUT_MS, maxRetries: 1 });
    model = env.scanModel;
  }
  return { client, model };
}

/**
 * Identifies the item in a photo and returns recycling + reuse guidance.
 * Never throws for model-side problems: timeouts, API errors, refusals,
 * a missing tool call and malformed output all return UNSURE_RESULT.
 * Throws only when the server is misconfigured (missing API key).
 *
 * Uses Claude when ANTHROPIC_API_KEY is set, otherwise Gemini's free tier
 * when GEMINI_API_KEY is set. Both answers go through the same validation
 * and safety rules.
 */
export async function analyzeItem(input: ScanRequest): Promise<ScanResult> {
  const gemini = getScanProvider() === "gemini" ? getGeminiEnv() : null;
  if (gemini) {
    const raw = await requestGeminiReport(input, gemini, getKnowledgeBlock());
    return raw === null ? UNSURE_RESULT : validateReport(raw);
  }

  const { client, model } = getClient();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: buildSystem(getKnowledgeBlock()),
      tools: [REPORT_TOOL],
      // "auto" rather than forcing the tool: newer models reject forced
      // tool_choice, and SCAN_MODEL may point at one. The prompt asks for the
      // tool and a missing call falls back to UNSURE_RESULT below.
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: input.image } },
            { type: "text", text: buildUserText(input.location) },
          ],
        },
      ],
    });
  } catch (error) {
    // SECURITY: log the failure kind only; the request holds the image.
    log.warn("scan.model_error", {
      reason: error instanceof Error ? error.name : "Unknown",
      httpStatus: error instanceof Anthropic.APIError ? (error.status ?? null) : null,
    });
    return UNSURE_RESULT;
  }

  log.info("scan.model_usage", {
    inputTokens: response.usage.input_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  if (response.stop_reason === "refusal") {
    log.warn("scan.model_refused");
    return UNSURE_RESULT;
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === REPORT_TOOL_NAME,
  );
  if (!toolUse) {
    log.warn("scan.no_tool_call", { stopReason: response.stop_reason });
    return UNSURE_RESULT;
  }

  return validateReport(toolUse.input);
}

/** Checks a model's report against the contract, then applies the safety rules. */
function validateReport(raw: unknown): ScanResult {
  const parsed = ScanResult.safeParse(trimLists(raw));
  if (!parsed.success) {
    log.warn("scan.invalid_model_output", {
      issues: parsed.error.issues.length,
      // Field names only, never values, so nothing from the photo is logged.
      fields: parsed.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", "),
    });
    return UNSURE_RESULT;
  }
  return enforceSafetyRules(parsed.data);
}

/**
 * The system prompt: fixed instructions, then the knowledge base when there
 * is one. Both are identical on every request, so the whole prefix (tools +
 * system) is cached from the marker on the last block.
 */
function buildSystem(knowledge: string): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: SYSTEM_PROMPT }];
  if (knowledge) blocks.push({ type: "text", text: knowledge });
  // Haiku 4.5 only caches prefixes of 4,096+ tokens; below that this marker is
  // a silent no-op, so it costs nothing while the knowledge base is small.
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
  return blocks;
}

/**
 * Cuts over-long lists down to the contract's limits before validation, so a
 * model that offers a fourth idea still gets a result instead of "unsure".
 * Anything that isn't the expected shape is passed through for Zod to reject.
 */
function trimLists(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  return {
    ...record,
    ...(Array.isArray(record.howToRecycle) && { howToRecycle: record.howToRecycle.slice(0, 5) }),
    ...(Array.isArray(record.repurpose) && { repurpose: record.repurpose.slice(0, 3) }),
  };
}

/**
 * Applies the rules the prompt asks for, in code, so they hold even when the
 * model ignores the prompt. Pure; never throws.
 */
export function enforceSafetyRules(result: ScanResult): ScanResult {
  // SAFETY: hazardous items must never come back with reuse ideas, even if
  // the model ignores the prompt instruction. Strip them server-side.
  if (result.recyclable === "special_dropoff" || result.caution) {
    result = { ...result, repurpose: [] };
  }
  // SAFETY: a low-confidence answer is a guess; don't present it as fact.
  if (result.confidence === "low" && result.status === "ok") {
    result = { ...result, status: "unsure" };
  }
  return result;
}

/** Test-only: forget the cached client so env changes take effect. */
export function resetClientForTests(): void {
  client = null;
  model = null;
}
