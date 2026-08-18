/**
 * Explains why a GitHub sign-in attempt did not complete.
 *
 * Each case gets a specific message: "something went wrong" leaves a
 * self-hoster with no idea whether they mistyped a client secret or simply
 * pressed Cancel.
 */
const MESSAGES: Record<string, string> = {
  access_denied:
    "Sign-in was cancelled. You can keep using ForkLeaf with notes stored on this device.",
  invalid_state:
    "That sign-in link expired or did not match. Please try signing in again from this page.",
  missing_code: "GitHub did not send an authorisation code. Please try again.",
  exchange_failed:
    "Could not complete sign-in with GitHub. If you are self-hosting, check that GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET are correct.",
  oauth_not_configured:
    "GitHub sign-in is not configured on this deployment. See the README for how to set it up — or carry on with local-only notes.",
};

export function SignInError({ code }: { code: string }) {
  const message = MESSAGES[code] ?? "Sign-in did not complete. Please try again.";

  return (
    <div className="w-full">
      <p
        role="alert"
        className="rounded-lg border border-[var(--fl-warn)]/40 bg-[var(--fl-warn)]/10 px-4 py-3 text-sm text-[var(--fl-text)]"
      >
        {message}
      </p>
    </div>
  );
}
