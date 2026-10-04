/* eslint-disable @next/next/no-img-element -- a 20px static brand mark; next/image adds nothing here. */

interface GoogleSignInButtonProps {
  onClick: () => void;
  isBusy?: boolean;
}

/**
 * "Sign in with Google", drawn to Google's branding rules for the light
 * theme: white pill, grey outline, the official four-colour G, and Roboto
 * Medium label. The visible pill is 40px tall, as the rules set it; the
 * button around it is 44px so the touch target still meets ours.
 */
export function GoogleSignInButton({ onClick, isBusy = false }: GoogleSignInButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy}
      className="flex min-h-11 items-center justify-center disabled:opacity-60"
    >
      <span className="flex h-10 items-center gap-2.5 rounded-full border border-google-outline bg-google-surface pr-3 pl-3 font-google text-sm leading-5 font-medium text-google-text">
        <img src="/brand/google-g.svg" alt="" width={20} height={20} />
        Sign in with Google
      </span>
    </button>
  );
}
