import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateServerSupabase, mockExchange } = vi.hoisted(() => ({
  mockCreateServerSupabase: vi.fn(),
  mockExchange: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: mockCreateServerSupabase }));

import { GET } from "@/app/auth/callback/route";

function callback(query: string): Request {
  return new Request(`https://fixie.example/auth/callback${query}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    mockExchange.mockReset();
    mockCreateServerSupabase.mockReset();
    mockCreateServerSupabase.mockResolvedValue({ auth: { exchangeCodeForSession: mockExchange } });
  });

  it("exchanges the code and redirects home on success", async () => {
    mockExchange.mockResolvedValue({ data: {}, error: null });
    const response = await GET(callback("?code=abc123"));
    expect(mockExchange).toHaveBeenCalledWith("abc123", undefined);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://fixie.example/");
  });

  it("passes the flow id through when Supabase adds one", async () => {
    mockExchange.mockResolvedValue({ data: {}, error: null });
    await GET(callback("?code=abc123&sb_flow_id=flow-1"));
    expect(mockExchange).toHaveBeenCalledWith("abc123", { flowId: "flow-1" });
  });

  it("redirects home with a failure flag when the code is missing, without calling Supabase", async () => {
    const response = await GET(callback("?error=access_denied"));
    expect(response.headers.get("location")).toBe("https://fixie.example/?signin=failed");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("redirects home with a failure flag when the code is invalid", async () => {
    mockExchange.mockResolvedValue({ data: {}, error: { code: "bad_code_verifier", name: "AuthApiError" } });
    const response = await GET(callback("?code=stale"));
    expect(response.headers.get("location")).toBe("https://fixie.example/?signin=failed");
  });

  it("doesn't crash when the exchange throws", async () => {
    mockExchange.mockRejectedValue(new TypeError("fetch failed"));
    const response = await GET(callback("?code=abc123"));
    expect(response.headers.get("location")).toBe("https://fixie.example/?signin=failed");
  });

  it("redirects home when Supabase isn't configured", async () => {
    mockCreateServerSupabase.mockResolvedValue(null);
    const response = await GET(callback("?code=abc123"));
    expect(response.headers.get("location")).toBe("https://fixie.example/?signin=failed");
  });

  it("never redirects off this site, whatever the query says", async () => {
    mockExchange.mockResolvedValue({ data: {}, error: null });
    const response = await GET(callback("?code=abc123&next=https://evil.example/"));
    expect(new URL(response.headers.get("location") ?? "").origin).toBe("https://fixie.example");
  });
});
