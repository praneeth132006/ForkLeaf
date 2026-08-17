import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import type { SessionUser } from "@forkleaf/types";

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
const STATE_COOKIE = "forkleaf_oauth_state";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  token: string;
  user: SessionUser;
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

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .encrypt(await encryptionKey());
}

export async function decryptSession(value: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtDecrypt(value, await encryptionKey());
    const { token, user } = payload as unknown as SessionPayload;
    if (typeof token !== "string" || !user) return null;
    return { token, user };
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
  return decryptSession(value);
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// ─── OAuth CSRF state ───────────────────────────────────────────────────────

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
  store.set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });

  return state;
}

/** Verifies and consumes the state parameter. Single use. */
export async function consumeOAuthState(received: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!expected || !received) return false;
  return timingSafeEqual(expected, received);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
