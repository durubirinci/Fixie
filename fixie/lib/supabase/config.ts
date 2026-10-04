import { z } from "zod";

const SupabaseConfig = z.object({
  url: z.url(),
  anonKey: z.string().trim().min(1),
});
export type SupabaseConfig = z.infer<typeof SupabaseConfig>;

/**
 * The public Supabase project URL and anon key, validated. Returns null when
 * either is missing or malformed: the app then runs exactly as it does with
 * no accounts, and sign-in is hidden. Never throws.
 *
 * SECURITY: only the public anon key is read here. Row-level security keeps
 * each person to their own profile; the service-role key is never used.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  // Spelled out in full: Next.js only inlines NEXT_PUBLIC_ variables into the
  // browser bundle when it can see each name literally.
  const parsed = SupabaseConfig.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return parsed.success ? parsed.data : null;
}
