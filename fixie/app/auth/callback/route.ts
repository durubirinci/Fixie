import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { log } from "@/lib/log";

/**
 * Where Google sends people back after "Sign in with Google". Exchanges the
 * one-time PKCE code for a session cookie, then redirects home. Any failure
 * (cancelled sign-in, missing or reused code, Supabase down) also redirects
 * home, with ?signin=failed so the app can say so. Never throws.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // SECURITY: always home on this origin; never a redirect target from the query.
  const home = new URL("/", url.origin);
  if (!code) return failed(home, "missing_code");

  const supabase = await createServerSupabase();
  if (!supabase) return failed(home, "not_configured");

  try {
    const flowId = url.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) return failed(home, error.code ?? error.name);
  } catch (error) {
    return failed(home, error instanceof Error ? error.name : "Unknown");
  }
  return NextResponse.redirect(home);
}

function failed(home: URL, reason: string): Response {
  // SECURITY: the reason is an error code, never the auth code or a token.
  log.warn("auth.callback_failed", { reason });
  const target = new URL(home);
  target.searchParams.set("signin", "failed");
  return NextResponse.redirect(target);
}
