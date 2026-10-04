"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { loadAccountPreferences, saveAccountPreferences } from "@/lib/profile/account";
import { planSignIn } from "@/lib/profile/merge";
import type { Preferences } from "@/lib/scan/schema";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getSupabaseConfig } from "@/lib/supabase/config";

export type AccountState =
  /** Supabase isn't configured, so sign-in is hidden and nothing changes. */
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; userId: string; firstName: string | null };

export interface UseAccount {
  account: AccountState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Saves on this device, and to the account when signed in. */
  savePreferences: (value: Preferences) => void;
  /** A small, non-blocking message, such as a failed sync. */
  notice: string | null;
  dismissNotice: () => void;
}

const MESSAGES = {
  signInFailed: "Sign-in didn't finish. You can keep scanning, or try again.",
  syncFailed: "Couldn't reach your account. Your answers are saved on this device.",
} as const;

// Google sends these in the session's user metadata. Only the first name is
// shown, and it's read from the session; nothing from Google is stored.
const GoogleNames = z.object({
  given_name: z.string().trim().min(1).optional(),
  full_name: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
});

function firstNameOf(metadata: unknown): string | null {
  const parsed = GoogleNames.safeParse(metadata);
  if (!parsed.success) return null;
  const name = parsed.data.given_name ?? (parsed.data.full_name ?? parsed.data.name)?.split(/\s+/)[0];
  return name ? name.slice(0, 40) : null;
}

/**
 * Optional Google sign-in through Supabase, and keeping the person's
 * preferences in step with their account. Scanning never depends on it: when
 * Supabase isn't configured the account is "unavailable" and every call is a
 * no-op apart from saving on the device.
 */
export function useAccount({
  preferences,
  setPreferences,
  hasSignInFailed = false,
}: {
  preferences: Preferences | null;
  setPreferences: (value: Preferences) => void;
  hasSignInFailed?: boolean;
}): UseAccount {
  const [account, setAccount] = useState<AccountState>(() =>
    getSupabaseConfig() ? { status: "loading" } : { status: "unavailable" },
  );
  const [notice, setNotice] = useState<string | null>(hasSignInFailed ? MESSAGES.signInFailed : null);
  const userId = account.status === "signed_in" ? account.userId : null;

  // The sign-in sync reads the device's answers at the moment the account
  // loads, without re-running every time they change.
  const localRef = useRef(preferences);
  useEffect(() => {
    localRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    // Drop ?signin=failed so a reload doesn't repeat the message.
    if (hasSignInFailed) window.history.replaceState(null, "", window.location.pathname);
  }, [hasSignInFailed]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    // Only set state here: awaiting other auth calls inside this callback can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(
        session
          ? { status: "signed_in", userId: session.user.id, firstName: firstNameOf(session.user.user_metadata) }
          : { status: "signed_out" },
      );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!userId || !supabase) return;
    let isCurrent = true;
    void (async () => {
      const loaded = await loadAccountPreferences(supabase, userId);
      if (!isCurrent) return;
      if (!loaded.ok) {
        setNotice(MESSAGES.syncFailed);
        return;
      }
      const plan = planSignIn(localRef.current, loaded.preferences);
      if (plan.preferences && plan.preferences !== localRef.current) setPreferences(plan.preferences);
      if (plan.shouldSaveToAccount && plan.preferences) {
        const isSaved = await saveAccountPreferences(supabase, userId, plan.preferences);
        if (!isSaved && isCurrent) setNotice(MESSAGES.syncFailed);
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [userId, setPreferences]);

  const signIn = useCallback(async (): Promise<void> => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setNotice(MESSAGES.signInFailed);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    // The device keeps its copy of the answers, so ideas stay personalized.
    await getBrowserSupabase()?.auth.signOut();
  }, []);

  const savePreferences = useCallback(
    (value: Preferences): void => {
      setPreferences(value);
      const supabase = getBrowserSupabase();
      if (!userId || !supabase) return;
      void saveAccountPreferences(supabase, userId, value).then((isSaved) => {
        if (!isSaved) setNotice(MESSAGES.syncFailed);
      });
    },
    [userId, setPreferences],
  );

  const dismissNotice = useCallback((): void => setNotice(null), []);

  return { account, signIn, signOut, savePreferences, notice, dismissNotice };
}
