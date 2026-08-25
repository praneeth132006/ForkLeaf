import { NextResponse, type NextRequest } from "next/server";
import { GitHubClient } from "@forkleaf/github-client";
import { appUrl, safeReturnPath } from "@/lib/app-url";
import {
  consumeOAuthState,
  consumeReturnPath,
  setSessionCookie,
  githubOAuthConfigured,
} from "@/lib/session";

/**
 * Completes the GitHub OAuth flow.
 *
 * Exchanges the short-lived code for an access token, verifies the CSRF state,
 * and stores the token in an encrypted httpOnly cookie. The token is never sent
 * to the browser, and never appears in a URL or a redirect.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // Always this deployment's own origin — never one derived from a request
  // header, which is what makes this redirect safe to hand a user.
  const home = appUrl(request, "/");

  // The user pressed "Cancel" on GitHub's consent screen.
  if (oauthError) {
    return NextResponse.redirect(withError(home, "access_denied"));
  }

  if (!githubOAuthConfigured()) {
    return NextResponse.redirect(withError(home, "oauth_not_configured"));
  }

  // Verify before doing anything else: this is the login-CSRF defence.
  if (!(await consumeOAuthState(state))) {
    return NextResponse.redirect(withError(home, "invalid_state"));
  }

  if (!code) {
    return NextResponse.redirect(withError(home, "missing_code"));
  }

  try {
    const { token, scopes } = await exchangeCodeForToken(
      code,
      appUrl(request, "/api/auth/callback").toString(),
    );

    // Confirm the token works and capture the profile in one call.
    const client = new GitHubClient({ token });
    const user = await client.getAuthenticatedUser();

    await setSessionCookie({
      token,
      scopes,
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
      },
    });

    // Back where the sign-in was started from, when it was started somewhere
    // specific — signing in again because a token expired should return to the
    // note that was open, not to a dashboard.
    //
    // Otherwise the dashboard, not the editor: a fresh sign-in has no
    // repository chosen yet, and dropping someone into an empty editor is how
    // the repo choice used to get made silently on their behalf.
    //
    // Re-checked on the way out as well as on the way in: a cookie is not a
    // safer source of a redirect target than a query string is.
    const back = safeReturnPath(await consumeReturnPath());
    return NextResponse.redirect(appUrl(request, back ?? "/dashboard"));
  } catch (error) {
    console.error("[forkleaf] OAuth callback failed:", error);
    return NextResponse.redirect(withError(home, "exchange_failed"));
  }
}

async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<{ token: string; scopes: string[] }> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "No access token returned");
  }

  // What was granted, which is not always what was asked for: somebody can
  // approve a narrower set on GitHub's own screen.
  const scopes = (data.scope ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return { token: data.access_token, scopes };
}

function withError(url: URL, code: string): URL {
  const next = new URL(url);
  next.searchParams.set("error", code);
  return next;
}
