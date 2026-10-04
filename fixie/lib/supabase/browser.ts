import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

/**
 * The browser's Supabase client, or null when Supabase isn't configured.
 * The library keeps one client per page, so calling this again is cheap.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  const config = getSupabaseConfig();
  return config ? createBrowserClient(config.url, config.anonKey) : null;
}
