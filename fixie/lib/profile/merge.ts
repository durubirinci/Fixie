import { isEmptyPreferences, type Preferences } from "@/lib/scan/schema";

export interface SignInPlan {
  /** What this device should use from now on; null means "not answered yet". */
  preferences: Preferences | null;
  /** True when this device's answers should be copied up to the account. */
  shouldSaveToAccount: boolean;
}

/**
 * Decides whose answers win when someone signs in. An account that already
 * has a profile wins and replaces this device's copy. An account with none
 * adopts this device's answers, unless they were skipped. Pure; never throws.
 */
export function planSignIn(local: Preferences | null, account: Preferences | null): SignInPlan {
  if (account) return { preferences: account, shouldSaveToAccount: false };
  if (local && !isEmptyPreferences(local)) return { preferences: local, shouldSaveToAccount: true };
  return { preferences: local, shouldSaveToAccount: false };
}
