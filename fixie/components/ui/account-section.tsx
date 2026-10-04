import type { AccountState } from "@/hooks/use-account";
import { GoogleSignInButton } from "./google-sign-in-button";

interface AccountSectionProps {
  account: AccountState;
  onSignIn: () => void;
  onSignOut: () => void;
}

/**
 * The optional account part of the profile sheet. Renders nothing when
 * Supabase isn't configured, so the app looks exactly as it does without
 * accounts.
 */
export function AccountSection({ account, onSignIn, onSignOut }: AccountSectionProps): React.JSX.Element | null {
  if (account.status === "unavailable" || account.status === "loading") return null;

  if (account.status === "signed_in") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
        <p className="text-[15px] text-ink-soft">
          Signed in{account.firstName ? ` as ${account.firstName}` : ""}. Your answers follow you to other devices.
        </p>
        <button type="button" onClick={onSignOut} className="min-h-11 shrink-0 px-2 font-semibold text-moss">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 border-t border-ink/10 pt-4 text-center">
      <p className="text-[15px] text-ink-soft">Optional: keep your answers on every device.</p>
      <GoogleSignInButton onClick={onSignIn} />
    </div>
  );
}
