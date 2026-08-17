import { NextResponse, type NextRequest } from "next/server";
import { createOAuthState, githubOAuthConfigured } from "@/lib/session";

/**
 * Starts the GitHub OAuth flow.
 *
 * Scope is `repo` because mdnotion writes notes to the user's own repositories,
 * including private ones. That is the narrowest scope GitHub offers that still
 * allows private-repo writes — there is no "only my notes repo" classic scope.
 * Users who want finer control can install this as a GitHub App instead; see
 * docs/self-hosting.md.
 */
export async function GET(request: NextRequest) {
  if (!githubOAuthConfigured()) {
    return NextResponse.redirect(new URL("/?error=oauth_not_configured", request.url));
  }

  const state = await createOAuthState();

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", process.env.GITHUB_OAUTH_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", callbackUrl(request));
  authorize.searchParams.set("scope", "repo read:user");
  authorize.searchParams.set("state", state);

  return NextResponse.redirect(authorize);
}

/**
 * Builds the callback URL.
 *
 * Prefers the configured app URL so the redirect target matches what is
 * registered on the OAuth app; behind a proxy, `request.url` may be the
 * internal address rather than the public one.
 */
function callbackUrl(request: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  return new URL("/api/auth/callback", base).toString();
}
