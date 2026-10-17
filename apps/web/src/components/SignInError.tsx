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
    "That sign-in did not finish in the window it started in, so it was stopped. Starting again from here usually settles it.",
  missing_code: "GitHub did not send an authorisation code. Please try again.",
  exchange_failed:
    "Could not complete sign-in with GitHub. Try again — if it keeps happening, check that you have not revoked ForkLeaf's access on GitHub.",
  oauth_not_configured:
    "GitHub sign-in is not configured on this deployment. See the README for how to set it up — or carry on with local-only notes.",
};

/**
 * The errors worth offering a second go at, rather than only explaining.
 *
 * A message ending in "please try again" with nothing to press is a message
 * that asks somebody to go and find the button they already pressed. Cancelling
 * is not on the list — that was a decision, and re-offering it reads as not
 * having listened — and neither is an unconfigured deployment, where trying
 * again cannot work until somebody edits an environment file.
 */
const RETRYABLE = new Set(["invalid_state", "missing_code", "exchange_failed"]);

export function SignInError({ code }: { code: string }) {
  const message = MESSAGES[code] ?? "Sign-in did not complete. Please try again.";

  return (
    <div
      role="alert"
      className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-[var(--fl-warn)]/40 bg-[var(--fl-warn)]/10 px-4 py-3 text-sm text-[var(--fl-text)]"
    >
      <p className="min-w-0 flex-1">{message}</p>
      {RETRYABLE.has(code) && (
        <a href="/sign-in" className="fl-btn fl-btn-primary shrink-0 !py-1.5 !text-[13px]">
          Try again
        </a>
      )}
    </div>
  );
}
