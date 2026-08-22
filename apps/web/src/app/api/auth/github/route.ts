import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/app-url";
import { clientKey } from "@/lib/rate-limit";
import { createOAuthState, githubOAuthConfigured } from "@/lib/session";

/**
 * Starts the GitHub OAuth flow.
 *
 * Scope is `repo` because ForkLeaf writes notes to the user's own repositories,
 * including private ones. That is the narrowest scope GitHub offers that still
 * allows private-repo writes — there is no "only my notes repo" classic scope.
 * Users who want finer control can install this as a GitHub App instead; see
 * docs/self-hosting.md.
 */
export async function GET(request: NextRequest) {
  if (!githubOAuthConfigured()) {
    return NextResponse.redirect(appUrl(request, "/?error=oauth_not_configured"));
  }

  // Starting a sign-in is cheap for the client and not free for us: each one
  // sets a cookie and sends someone to GitHub. Bounded so a script cannot use
  // the route as a redirector or a cookie firehose.
  if (tooManySignInAttempts(request)) {
    return NextResponse.redirect(appUrl(request, "/?error=too_many_attempts"));
  }

  const state = await createOAuthState();

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", process.env.GITHUB_OAUTH_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", appUrl(request, "/api/auth/callback").toString());
  authorize.searchParams.set("scope", "repo read:user");
  authorize.searchParams.set("state", state);

  return NextResponse.redirect(authorize);
}

/**
 * A fixed window over sign-in starts, kept local to this route.
 *
 * Not `enforceRateLimit`: that throws an `ApiError` for the JSON routes, and
 * this one answers with a redirect the browser can actually show.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 60_000;

function tooManySignInAttempts(request: NextRequest): boolean {
  const now = Date.now();
  const key = clientKey(request);
  const window = attempts.get(key);

  if (!window || window.resetAt <= now) {
    if (attempts.size > 5_000) attempts.clear();
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }

  window.count += 1;
  return window.count > ATTEMPT_LIMIT;
}
