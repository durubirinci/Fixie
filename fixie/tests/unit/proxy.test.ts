import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockCreateServerClient } = vi.hoisted(() => ({ mockCreateServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mockCreateServerClient }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { proxy } from "@/proxy";

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockCreateServerClient.mockReset();
  });

  it("passes requests straight through when Supabase isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const response = await proxy(new NextRequest("https://fixie.example/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("still serves the page when Supabase is unreachable", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    mockCreateServerClient.mockReturnValue({
      auth: { getClaims: vi.fn().mockRejectedValue(new TypeError("fetch failed")) },
    });
    const response = await proxy(new NextRequest("https://fixie.example/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
