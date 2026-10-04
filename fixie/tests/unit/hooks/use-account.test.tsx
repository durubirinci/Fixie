import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "@/hooks/use-account";
import type { Preferences } from "@/lib/scan/schema";

describe("useAccount with no Supabase config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is unavailable, and saving still works on the device alone", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const setPreferences = vi.fn();
    const { result } = renderHook(() => useAccount({ preferences: null, setPreferences }));
    expect(result.current.account).toEqual({ status: "unavailable" });

    const answers: Preferences = { space: "yard", interests: ["plants"], tools: [] };
    act(() => result.current.savePreferences(answers));
    expect(setPreferences).toHaveBeenCalledWith(answers);
    await act(() => result.current.signIn());
    expect(result.current.notice).toBeNull();
  });
});
