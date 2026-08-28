import { NextResponse, type NextRequest } from "next/server";
import { appUrl, safeReturnPath } from "@/lib/app-url";
import { clientKey } from "@/lib/rate-limit";
import { createOAuthState, githubOAuthConfigured, setReturnPath } from "@/lib/session";

/**
 * Starts the GitHub OAuth flow.
 *
 * There are two honest scopes to offer, and the caller picks with `?access=`.
 *
 * `repo` is the default, because notes usually belong in a private repository
 * and it is the narrowest classic scope that can write to one. It is also
 * broad: it covers every repository the account can reach, which is a lot to
 * hand over to a notes app.
 *
 * `public_repo` is the alternative for somebody who is only ever going to keep
 * public notes. It cannot touch a private repository at all, which is the
 * point — an app that cannot read your private code cannot leak it.
 *
 * Nothing else is asked for, and in particular not `read:user`. It used to be
 * in this list to get the name and avatar in the sidebar, but `GET /user`
 * returns those to any authenticated token; the only thing the scope added was
 * a second block on GitHub's consent screen saying the app can "read your
 * private profile information", which it neither needs nor wants. A permission
 * requested for a reason that does not survive being written down is a
 * permission to drop.
 *
 * What is genuinely not on offer is per-repository selection: classic OAuth
 * scopes have no such thing, and pretending otherwise in the UI would be worse
 * than saying so. The narrower `public_repo` grant is offered instead, as an
 * equal choice rather than as a thing you would have to know to ask for.
 */

/** The scopes this route will ask for, by the name the UI uses. */
const SCOPES: Record<string, string> = {
  // Everything, private repositories included.
  all: "repo",
  // Public repositories only.
  public: "public_repo",
};
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

  // Where to land afterwards. Somebody whose token expired mid-sentence is
  // signing in *from* the editor, and finishing on the dashboard with their
  // note nowhere in sight reads as though the sign-in went somewhere else.
  // Validated here, so nothing but a path on this deployment can be stored.
  await setReturnPath(safeReturnPath(new URL(request.url).searchParams.get("next")));

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", process.env.GITHUB_OAUTH_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", appUrl(request, "/api/auth/callback").toString());
  // An allowlist, not a pass-through: this value ends up in the authorisation
  // request, and a scope taken from the query string unchecked is a way to ask
  // somebody to grant something they were never shown.
  const requested = new URL(request.url).searchParams.get("access") ?? "all";
  authorize.searchParams.set("scope", SCOPES[requested] ?? SCOPES.all!);
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
