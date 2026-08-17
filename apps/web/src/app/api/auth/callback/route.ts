import { NextResponse, type NextRequest } from "next/server";
import { GitHubClient } from "@mdnotion/github-client";
import { consumeOAuthState, setSessionCookie, githubOAuthConfigured } from "@/lib/session";

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

  const home = new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? url.origin);

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
    const token = await exchangeCodeForToken(code, url.origin);

    // Confirm the token works and capture the profile in one call.
    const client = new GitHubClient({ token });
    const user = await client.getAuthenticatedUser();

    await setSessionCookie({
      token,
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
      },
    });

    return NextResponse.redirect(new URL("/editor", process.env.NEXT_PUBLIC_APP_URL ?? url.origin));
  } catch (error) {
    console.error("[mdnotion] OAuth callback failed:", error);
    return NextResponse.redirect(withError(home, "exchange_failed"));
  }
}

async function exchangeCodeForToken(code: string, origin: string): Promise<string> {
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
      redirect_uri: new URL(
        "/api/auth/callback",
        process.env.NEXT_PUBLIC_APP_URL ?? origin,
      ).toString(),
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "No access token returned");
  }

  return data.access_token;
}

function withError(url: URL, code: string): URL {
  const next = new URL(url);
  next.searchParams.set("error", code);
  return next;
}
