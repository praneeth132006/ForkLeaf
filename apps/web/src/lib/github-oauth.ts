import "server-only";

/**
 * Talking to GitHub's token endpoint: getting a token, and keeping it alive.
 *
 * ForkLeaf is registered as a **GitHub App**, and a GitHub App's user access
 * token expires eight hours after it is issued. That is the whole story behind
 * "why does it keep signing me out": nothing was timing out on our side — the
 * session cookie is good for thirty days and was still perfectly valid — the
 * token sealed inside it had simply stopped working, several times a day,
 * every day. The app went on showing an avatar and a connected repository
 * while every call behind them came back 401.
 *
 * GitHub issues a refresh token alongside it, valid for six months, for
 * exactly this. Using it is the difference between a sign-in that lasts a
 * working month and one that lasts a working morning.
 *
 * An OAuth App — or a GitHub App with token expiration turned off — returns no
 * refresh token and no expiry, and everything here degrades to what it was:
 * one token, held until GitHub refuses it.
 */

const TOKEN_URL = "https://github.com/login/oauth/access_token";

export interface TokenGrant {
  token: string;
  scopes: string[];
  /** Unix seconds when this token stops working, if GitHub gave it a lifetime. */
  expiresAt?: number;
  refreshToken?: string;
  /** Unix seconds when the refresh token itself expires. */
  refreshExpiresAt?: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * A refusal GitHub will keep repeating.
 *
 * Distinguished from a network failure on purpose. A refresh token GitHub says
 * is bad will be just as bad in thirty seconds, so the session is over and the
 * honest thing is to say so. A refresh that could not reach GitHub says nothing
 * about the session at all, and treating it as an ending would sign people out
 * every time the network hiccuped.
 */
export class TokenRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenRefused";
  }
}

async function post(body: Record<string, string | undefined>): Promise<TokenGrant> {
  let response: Response;

  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      // GitHub's token endpoint answering slowly must not hold a page open
      // indefinitely — this runs inside a request somebody is waiting on.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`Could not reach GitHub to exchange a token: ${String(error)}`);
  }

  const data = (await response.json().catch(() => ({}))) as TokenResponse;

  if (!data.access_token) {
    // GitHub answers a bad or spent refresh token with 200 and an `error`
    // field, so the status is no help here; the body is the only signal.
    throw new TokenRefused(data.error_description ?? data.error ?? "No access token returned");
  }

  const now = Math.floor(Date.now() / 1000);

  return {
    token: data.access_token,
    // What was granted, which is not always what was asked for: somebody can
    // approve a narrower set on GitHub's own screen. (A GitHub App sends this
    // back empty — its permissions live on the app, not on the token.)
    scopes: (data.scope ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    ...(data.expires_in ? { expiresAt: now + data.expires_in } : {}),
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    ...(data.refresh_token_expires_in
      ? { refreshExpiresAt: now + data.refresh_token_expires_in }
      : {}),
  };
}

/** Completes a sign-in: the one-time code becomes a usable token. */
export function exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenGrant> {
  return post({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
    client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  });
}

/**
 * Renews an eight-hour token without anybody being asked to sign in again.
 *
 * The refresh token is single use: GitHub returns a new one with every renewal
 * and retires the one just spent. That is why the result has to be written back
 * to the cookie before it is used — a renewal whose new refresh token is lost
 * has spent the session's last one.
 */
export function refreshUserToken(refreshToken: string): Promise<TokenGrant> {
  return post({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
    client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}
