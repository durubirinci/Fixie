import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseConfig } from "@/lib/supabase/config";

describe("getSupabaseConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is null when the variables are missing or blank, so sign-in stays hidden", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(getSupabaseConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(getSupabaseConfig()).toBeNull();
  });

  it("is null for a malformed URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(getSupabaseConfig()).toBeNull();
  });

  it("returns both values when they're set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(getSupabaseConfig()).toEqual({ url: "https://abc.supabase.co", anonKey: "anon" });
  });
});
