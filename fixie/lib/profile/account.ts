import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { Preferences } from "@/lib/scan/schema";

export type AccountLoad = { ok: true; preferences: Preferences | null } | { ok: false };

/**
 * Reads the signed-in person's saved profile. Row-level security means only
 * their own row is visible. A row that doesn't match the schema counts as no
 * profile. Returns { ok: false } on a network or database error; never throws.
 */
export async function loadAccountPreferences(supabase: SupabaseClient, userId: string): Promise<AccountLoad> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("space, interests, tools")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      log.warn("profile.load_failed", { reason: error.code });
      return { ok: false };
    }
    if (!data) return { ok: true, preferences: null };
    const parsed = Preferences.safeParse(data);
    return { ok: true, preferences: parsed.success ? parsed.data : null };
  } catch (error) {
    log.warn("profile.load_failed", { reason: error instanceof Error ? error.name : "Unknown" });
    return { ok: false };
  }
}

/**
 * Saves the profile to the signed-in person's own row, creating it the first
 * time. Returns false when the save fails; never throws.
 */
export async function saveAccountPreferences(
  supabase: SupabaseClient,
  userId: string,
  preferences: Preferences,
): Promise<boolean> {
  // SECURITY: checked here too, so nothing outside the schema is ever sent.
  const parsed = Preferences.safeParse(preferences);
  if (!parsed.success) return false;
  try {
    const { error } = await supabase.from("profiles").upsert({ id: userId, ...parsed.data });
    if (error) log.warn("profile.save_failed", { reason: error.code });
    return !error;
  } catch (error) {
    log.warn("profile.save_failed", { reason: error instanceof Error ? error.name : "Unknown" });
    return false;
  }
}
