import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { log } from "@/lib/log";

/**
 * Refreshes the Supabase session before a page renders, so an expired access
 * token is swapped for a new one and the new cookies reach the browser. With
 * no Supabase config, or with no session, it passes every request through.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // Update the request too, so anything rendering after this sees the new session.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  try {
    // Verifies the token and refreshes it when expired; the result isn't needed here.
    await supabase.auth.getClaims();
  } catch (error) {
    // Supabase being unreachable must never block the page; the person just looks signed out.
    log.warn("auth.refresh_failed", { reason: error instanceof Error ? error.name : "Unknown" });
  }
  return response;
}

export const config = {
  // Pages only. The scan route is stateless and the callback sets its own
  // session, so neither needs a refresh; static files never do.
  matcher: [
    "/((?!_next/static|_next/image|api/scan|auth/callback|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
