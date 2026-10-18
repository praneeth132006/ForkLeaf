import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import type { SessionUser } from "@forkleaf/types";
import { refreshUserToken, TokenRefused } from "@/lib/github-oauth";

/**
 * Server-side session handling.
 *
 * The GitHub access token is the whole security story of this app: it can read
 * and write every repository the user granted. So it is never sent to the
 * browser. It is encrypted (JWE, A256GCM) into an httpOnly cookie that only the
 * server can open, and every GitHub call is proxied through our own routes.
 *
 * A token in localStorage — the usual shortcut — would be readable by any
 * script that ever runs on the page.
 */

const COOKIE_NAME = "forkleaf_session";
/**
 * Names the one sign-in that has ended, by a fingerprint of its token.
 *
 * Ending a session used to mean deleting the session cookie, and that was the
 * cause of "the app on my home screen keeps signing me out". Responses do not
 * arrive in the order their requests were sent. A phone waking the installed
 * app fires a burst of requests at once; one of them renews the eight-hour
 * token and sets a new cookie, while another, sent a moment earlier with the
 * old cookie, finds the old refresh token already spent and deletes the cookie.
 * If that deletion lands second it erases the brand-new, perfectly good
 * session along with the dead one.
 *
 * A marker that names the dead token cannot do that. The browser keeps
 * whichever session cookie it was handed last, and the marker only matches the
 * session it was written about, so a newer sign-in sails straight past it.
 */
const ENDED_COOKIE = "forkleaf_session_ended";
const STATE_COOKIE = "forkleaf_oauth_state";
const RETURN_COOKIE = "forkleaf_return_to";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  token: string;
  user: SessionUser;
  /**
   * What GitHub actually granted, as it reported it back.
   *
   * Kept because it is the only way to tell a "not found" that means *not
   * found* from one that means "you did not give this app access to private
   * repositories". Those two need completely different things said to the
   * person reading them, and guessing between them is how an app ends up
   * telling somebody their repository does not exist.
   */
  scopes?: string[];
  /**
   * Unix seconds when the GitHub token stops working.
   *
   * A GitHub App's user token lasts eight hours, which is shorter than one
   * working day and far shorter than this cookie. Knowing when it runs out is
   * what makes it possible to renew it a minute early instead of finding out
   * from a 401 in the middle of somebody's writing.
   *
   * Absent for a token with no lifetime — an OAuth App, or a GitHub App with
   * token expiration switched off.
   */
  expiresAt?: number;
  /** GitHub's six-month refresh token, if this deployment gets one. */
  refreshToken?: string;
  /** Unix seconds when the refresh token itself expires. */
  refreshExpiresAt?: number;
}

let cachedKey: Uint8Array | null = null;

/**
 * Derives the 256-bit encryption key from SESSION_SECRET.
 *
 * Fails loudly rather than falling back to a default: a hardcoded fallback
 * secret would mean anyone could forge a session cookie on every deployment
 * that forgot to set it.
 */
async function encryptionKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters. " +
        "Generate one with: openssl rand -base64 32",
    );
  }

  // SHA-256 gives exactly the 32 bytes A256GCM needs, whatever the secret's length.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  cachedKey = new Uint8Array(digest);
  return cachedKey;
}

/** True when the server is configured for GitHub sign-in. */
export function githubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_OAUTH_CLIENT_ID &&
    process.env.GITHUB_OAUTH_CLIENT_SECRET &&
    process.env.SESSION_SECRET,
  );
}

/**
 * What a session cookie says it is.
 *
 * The same key seals the session, MCP access and refresh tokens, and OAuth
 * codes. Each of those carries its purpose and is refused for any other; the
 * session carries one too, so nothing sealed for an assistant — scoped to one
 * notebook — can ever be presented as a session, which reaches every
 * repository the token can. Cookies written before this have no purpose and
 * are still read.
 */
const SESSION_PURPOSE = "session";

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new EncryptJWT({ ...payload, purpose: SESSION_PURPOSE })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .encrypt(await encryptionKey());
}

export async function decryptSession(value: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtDecrypt(value, await encryptionKey());
    // Everything the cookie carries, not a hand-picked two.
    //
    // This used to rebuild the session as `{ token, user }`, which quietly
    // dropped every other field on the way out: `scopes` — written at sign-in
    // precisely so a "not found" could be told apart from "you did not grant
    // access to private repositories" — arrived as undefined at both of its
    // readers, and the renewal fields below would have gone the same way.
    if (payload.purpose !== undefined && payload.purpose !== SESSION_PURPOSE) return null;
    const session = payload as unknown as SessionPayload;
    const { token, user } = session;
    if (typeof token !== "string" || !user) return null;

    return {
      token,
      user,
      ...(Array.isArray(session.scopes) ? { scopes: session.scopes } : {}),
      ...(typeof session.expiresAt === "number" ? { expiresAt: session.expiresAt } : {}),
      ...(typeof session.refreshToken === "string" ? { refreshToken: session.refreshToken } : {}),
      ...(typeof session.refreshExpiresAt === "number"
        ? { refreshExpiresAt: session.refreshExpiresAt }
        : {}),
    };
  } catch {
    // Tampered, expired, or encrypted under a rotated secret.
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  // Lax rather than Strict so the OAuth redirect back from GitHub still
  // carries the cookie; Strict would drop it on that cross-site navigation.
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, await encryptSession(payload), {
    ...cookieOptions,
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const session = await decryptSession(value);
  if (!session) return null;

  const ended = store.get(ENDED_COOKIE)?.value;
  if (ended && ended === (await fingerprint(session.token))) return null;
  return session;
}

/** A short, one-way name for a token: enough to recognise it, useless to anyone holding it. */
async function fingerprint(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Ends one particular sign-in, without touching any other.
 *
 * For a session GitHub has stopped honouring. A person pressing "Sign out" is
 * different — that is `clearSessionCookie`, which removes whatever is there.
 */
export async function endSession(session: Pick<SessionPayload, "token">): Promise<void> {
  const store = await cookies();
  store.set(ENDED_COOKIE, await fingerprint(session.token), {
    ...cookieOptions,
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Ends whichever sign-in this request was made with. */
export async function endCurrentSession(): Promise<void> {
  const session = await getSession();
  if (session) await endSession(session);
}

/**
 * How early a token is renewed, in seconds.
 *
 * A token that expires "in twenty seconds" is a token that will expire during
 * the request it was about to be used for. The margin also covers clock skew
 * between this server and GitHub's, which is not guaranteed to be zero.
 */
const RENEW_BEFORE_SECONDS = 300;

/**
 * One renewal at a time, per refresh token.
 *
 * Opening a note is a burst of parallel requests — the tree, the file, one call
 * per image — and every one of them passes through here. Without this they
 * would all notice the same expired token at the same moment and each spend
 * the same single-use refresh token; the first would win, and the rest would
 * come back refused, ending the session that was in the middle of being saved.
 *
 * Per instance, which is all that can be promised on serverless. Requests that
 * land on another instance, or after the renewal has finished, are what
 * `renewed` below and the ended-session marker are for.
 */
const renewing = new Map<string, Promise<SessionPayload | null>>();

/**
 * Renewals that have finished, by the refresh token they spent.
 *
 * `renewing` only covers requests that arrive while a renewal is in flight. A
 * request sent with the old cookie just before the new one reached the browser
 * arrives a moment *after*, finds the same expired token, and would spend a
 * refresh token GitHub has already retired — and be refused. Remembering the
 * answer for a few minutes lets that request carry on with the renewed
 * session, and hands the browser the new cookie once more for good measure.
 */
const renewed = new Map<string, { session: SessionPayload; at: number }>();
const RENEWED_FOR_MS = 10 * 60 * 1000;
const RENEWED_MAX = 500;

function rememberRenewal(spent: string, session: SessionPayload): void {
  const now = Date.now();
  for (const [key, entry] of renewed) {
    if (now - entry.at > RENEWED_FOR_MS || renewed.size >= RENEWED_MAX) renewed.delete(key);
  }
  renewed.set(spent, { session, at: now });
}

function recentRenewal(spent: string): SessionPayload | null {
  const entry = renewed.get(spent);
  if (!entry) return null;
  if (Date.now() - entry.at > RENEWED_FOR_MS) {
    renewed.delete(spent);
    return null;
  }
  return entry.session;
}

/** For tests: forget every renewal this instance has seen. */
export function forgetRenewalsForTesting(): void {
  renewing.clear();
  renewed.clear();
}

/** True when the token has expired, or is about to. */
function needsRenewal(session: SessionPayload): boolean {
  if (session.expiresAt === undefined) return false;
  return session.expiresAt - RENEW_BEFORE_SECONDS <= Math.floor(Date.now() / 1000);
}

/**
 * The session, with a working token in it.
 *
 * `getSession` reads the cookie and nothing more, which is right for a page
 * that only wants a name and an avatar. Anything that is about to *call*
 * GitHub wants this instead: a GitHub App's user token lasts eight hours, so
 * the token in a perfectly valid thirty-day cookie is, most of the time, an
 * expired one. Renewing it here is the difference between a sign-in that lasts
 * as long as the cookie says it does and one that ends every working morning.
 *
 * Only safe from a route handler, because it writes the cookie back — and it
 * must write it back, since GitHub retires each refresh token as it is spent.
 */
export async function getLiveSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || !needsRenewal(session)) return session;

  // Expired, and nothing to renew it with: an OAuth App token that has been
  // revoked, or a refresh token past its six months. Either way this session
  // is over, and saying so here saves every route behind it a round trip to
  // GitHub to be told the same thing.
  if (!session.refreshToken) {
    await endSession(session);
    return null;
  }

  const already = recentRenewal(session.refreshToken);
  if (already) {
    await setSessionCookie(already);
    return already;
  }

  const inFlight = renewing.get(session.refreshToken);
  if (inFlight) return inFlight;

  const attempt = renew(session).finally(() => {
    renewing.delete(session.refreshToken!);
  });
  renewing.set(session.refreshToken, attempt);

  return attempt;
}

async function renew(session: SessionPayload): Promise<SessionPayload | null> {
  try {
    const grant = await refreshUserToken(session.refreshToken!);

    const next: SessionPayload = {
      ...session,
      token: grant.token,
      // A GitHub App returns no scopes on a renewal; keeping what the sign-in
      // recorded is more honest than replacing it with an empty list.
      ...(grant.scopes.length > 0 ? { scopes: grant.scopes } : {}),
      ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
      ...(grant.refreshToken !== undefined ? { refreshToken: grant.refreshToken } : {}),
      ...(grant.refreshExpiresAt !== undefined ? { refreshExpiresAt: grant.refreshExpiresAt } : {}),
    };

    // Before it is used, not after: the refresh token just spent is now dead,
    // and a renewal whose replacement never reached the cookie has thrown away
    // the session's only way back.
    await setSessionCookie(next);
    rememberRenewal(session.refreshToken!, next);
    return next;
  } catch (error) {
    if (error instanceof TokenRefused) {
      // GitHub will say the same thing next time — the authorisation was
      // revoked, or the refresh token is past its six months. The session is
      // genuinely over.
      console.warn("[forkleaf] GitHub refused to renew the session token:", error.message);
      await endSession(session);
      return null;
    }

    // Could not reach GitHub. That says nothing about whether this session is
    // still good, and signing somebody out over a network blip would be a much
    // worse answer than letting the call they were making fail on its own.
    console.error("[forkleaf] Could not renew the session token:", error);
    return session;
  }
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// ─── OAuth CSRF state ───────────────────────────────────────────────────────

/**
 * How many sign-in attempts can be in flight at once, and for how long.
 *
 * The cookie used to hold exactly one state, overwritten by every start. That
 * is correct for somebody who presses one button once and comes straight back,
 * and wrong for everybody else: ForkLeaf offers sign-in from the hero, from
 * the nav, from the sidebar and from the editor, so clicking one, thinking
 * better of it, clicking another and finishing the first ended at "that
 * sign-in link expired or did not match". An installed app made it the normal
 * case — github.com is outside the app's scope, so the browser moves the
 * navigation into its own view, which can run the start again and leave the
 * cookie holding a state GitHub was never given.
 *
 * So a few recent attempts are remembered rather than only the last, and any
 * one of them may be the one that comes back. Each is still random, httpOnly,
 * single use and short lived — finishing one clears them all — so the
 * login-CSRF check this exists for is exactly as strong as it was. Four is
 * enough for a person with a busy finger and small enough to stay a cookie.
 *
 * Thirty minutes rather than ten because the round trip is not ours: it runs
 * through signing in to GitHub, two-factor, and sometimes choosing between
 * accounts. Ten minutes was declaring a real sign-in a forgery.
 */
const MAX_PENDING_STATES = 4;
const STATE_TTL_SECONDS = 1_800;

/**
 * Creates the OAuth `state` parameter and stores it in a short-lived cookie.
 *
 * Without this check an attacker can complete the OAuth flow in the victim's
 * browser and silently bind the victim's session to the attacker's GitHub
 * account — a login-CSRF that ends with the victim's notes in someone else's
 * repository.
 */
export async function createOAuthState(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const store = await cookies();
  const pending = [state, ...readStates(store.get(STATE_COOKIE)?.value)].slice(
    0,
    MAX_PENDING_STATES,
  );
  store.set(STATE_COOKIE, pending.join("."), { ...cookieOptions, maxAge: STATE_TTL_SECONDS });

  return state;
}

/** The states still in flight, newest first. Hex and dots, nothing else. */
function readStates(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(".").filter((state) => /^[0-9a-f]{48}$/.test(state));
}

/**
 * Remembers where to go once GitHub has answered.
 *
 * In a cookie rather than in the `state` parameter or GitHub's `redirect_uri`:
 * the redirect URI has to match what is registered on the OAuth app exactly,
 * and `state` is compared byte for byte as a CSRF token. A cookie keeps the
 * destination on this origin, where it was already checked.
 */
export async function setReturnPath(path: string | null): Promise<void> {
  const store = await cookies();
  if (!path) {
    store.delete(RETURN_COOKIE);
    return;
  }
  store.set(RETURN_COOKIE, path, { ...cookieOptions, maxAge: 600 });
}

/** Reads and clears the remembered destination. Single use, like the state. */
export async function consumeReturnPath(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(RETURN_COOKIE)?.value ?? null;
  store.delete(RETURN_COOKIE);
  return value;
}

/**
 * Verifies and consumes the state parameter. Single use.
 *
 * Any of the attempts still in flight will do — see `MAX_PENDING_STATES` — and
 * all of them are dropped either way, so a state can never be replayed and an
 * abandoned attempt cannot outlive the sign-in that finished.
 */
export async function consumeOAuthState(received: string | null): Promise<boolean> {
  const store = await cookies();
  const pending = readStates(store.get(STATE_COOKIE)?.value);
  store.delete(STATE_COOKIE);

  if (!received) return false;
  // Every candidate is compared, rather than stopping at the first match, so
  // the work does not depend on which attempt came back.
  return pending.reduce((found, state) => timingSafeEqual(state, received) || found, false);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Sealed values for connected assistants ─────────────────────────────────

/**
 * Encrypts a value for one purpose, under the same key as the session.
 *
 * The purpose travels inside the encrypted payload and is checked on the way
 * out, so a value sealed as one thing — a client registration, a code, a
 * token — can never be presented as another, and a session cookie is none of
 * them.
 */
export async function sealValue(
  payload: Record<string, unknown>,
  purpose: string,
  ttlSeconds: number,
): Promise<string> {
  return new EncryptJWT({ ...payload, purpose })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${Math.max(1, Math.floor(ttlSeconds))}s`)
    .encrypt(await encryptionKey());
}

/** Opens a sealed value, or null when it is expired, tampered with, or for another purpose. */
export async function openValue<T>(
  value: string | null | undefined,
  purpose: string,
): Promise<T | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtDecrypt(value, await encryptionKey());
    return payload.purpose === purpose ? (payload as unknown as T) : null;
  } catch {
    return null;
  }
}

const MCP_PENDING_COOKIE = "forkleaf_mcp_pending";

/** Keeps an assistant's authorisation request across the round trip to GitHub. */
export async function setMcpPending(value: string): Promise<void> {
  const store = await cookies();
  store.set(MCP_PENDING_COOKIE, value, { ...cookieOptions, maxAge: 600 });
}

/** Reads and clears it. Single use, like the OAuth state. */
export async function consumeMcpPending(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(MCP_PENDING_COOKIE)?.value ?? null;
  if (value) store.delete(MCP_PENDING_COOKIE);
  return value;
}
