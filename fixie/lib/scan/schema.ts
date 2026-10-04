import { z } from "zod";

// Bounded so a malicious client can't post a 50MB body into a paid API call.
// ~1.5MB of base64 ≈ a 1024px JPEG with plenty of headroom.
const MAX_IMAGE_BASE64_CHARS = 1_500_000;

export const Space = z.enum(["indoors", "balcony", "yard"]);
export type Space = z.infer<typeof Space>;

export const Interest = z.enum(["plants", "organizing", "decor", "gifts", "kids"]);
export type Interest = z.infer<typeof Interest>;

// "CraftTool", not "Tool": analyze.ts already works with Anthropic's Tool type.
export const CraftTool = z.enum(["scissors_tape", "basic_tools", "glue_paint", "sewing"]);
export type CraftTool = z.infer<typeof CraftTool>;

/** A pick-any list: each value at most once, so it can never be longer than the enum. */
function pickAny<T extends z.ZodEnum>(values: T) {
  return z
    .array(values)
    .max(values.options.length)
    .refine((list) => new Set(list).size === list.length, { message: "No duplicates" });
}

/**
 * What the person told the fairies about themselves. Choices only, never
 * free text, so nothing a client sends reaches the prompt verbatim. A null
 * space or an empty list means "didn't say", not "none".
 */
export const Preferences = z.object({
  space: Space.nullable(),
  interests: pickAny(Interest),
  tools: pickAny(CraftTool),
});
export type Preferences = z.infer<typeof Preferences>;

/** What a skipped "Tell the fairies about you" sheet saves. */
export const EMPTY_PREFERENCES: Preferences = { space: null, interests: [], tools: [] };

/** True when the person skipped every question, so there's nothing to send or sync. */
export function isEmptyPreferences(preferences: Preferences): boolean {
  return preferences.space === null && preferences.interests.length === 0 && preferences.tools.length === 0;
}

export const ScanRequest = z.object({
  image: z.string().min(1).max(MAX_IMAGE_BASE64_CHARS),
  location: z.string().trim().max(80).optional(),
  preferences: Preferences.optional(),
});
export type ScanRequest = z.infer<typeof ScanRequest>;

export const Fairy = z.enum([
  "glass",
  "paper",
  "metal",
  "plastic",
  "textile",
  "organic",
  "electronic",
  "mixed",
]);
export type Fairy = z.infer<typeof Fairy>;

export const Recyclable = z.enum(["yes", "no", "special_dropoff"]);
export type Recyclable = z.infer<typeof Recyclable>;

export const Difficulty = z.enum(["easy", "medium"]);
export type Difficulty = z.infer<typeof Difficulty>;

export const MAX_IDEAS = 3;
export const MAX_SUPPLIES = 5;
export const MAX_STEPS = 6;

/**
 * One upcycling project the user could start today with things at home.
 * The descriptions flow into the Claude tool schema and Gemini's response
 * schema, so field-level guidance lives here with the shape.
 */
export const UpcycleIdea = z.object({
  title: z.string().min(1).describe("Short, fun project name in a playful fairy tone"),
  summary: z.string().min(1).describe("One sentence: what it is and why it's useful"),
  difficulty: Difficulty.describe("easy or medium; never anything that needs power tools"),
  // Loose bound on purpose: the prompt asks for under an hour, and this only
  // rejects nonsense rather than turning a good scan into "unsure".
  minutes: z.number().int().min(1).max(120).describe("Rough time to make it, in minutes"),
  supplies: z
    .array(z.string().min(1))
    .max(MAX_SUPPLIES)
    .describe("Common household items needed, not counting the scanned item"),
  steps: z.array(z.string().min(1)).min(1).max(MAX_STEPS).describe("3 to 6 short imperative steps"),
  safety: z
    .string()
    .min(1)
    .nullable()
    .describe("One line on a real risk in this project (cut edges, hot glue, paint fumes), else null"),
});
export type UpcycleIdea = z.infer<typeof UpcycleIdea>;

export const ScanResult = z.object({
  status: z.enum(["ok", "unsure", "not_an_item"]),
  item: z.string().nullable(),
  material: z.string().nullable(),
  fairy: Fairy.nullable(),
  recyclable: Recyclable.nullable(),
  howToRecycle: z.array(z.string()).max(5),
  repurpose: z.array(UpcycleIdea).max(MAX_IDEAS),
  caution: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ScanResult = z.infer<typeof ScanResult>;

/** The safe fallback used whenever we can't produce a trustworthy answer. */
export const UNSURE_RESULT: ScanResult = {
  status: "unsure",
  item: null,
  material: null,
  fairy: null,
  recyclable: null,
  howToRecycle: [],
  repurpose: [],
  caution: null,
  confidence: "low",
};
