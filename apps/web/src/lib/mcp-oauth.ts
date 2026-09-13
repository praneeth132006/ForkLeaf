/**
 * The OAuth side of connecting an AI assistant, as plain functions.
 *
 * The MCP specification's way to connect a remote server is OAuth 2.1 with
 * PKCE: the assistant registers itself, sends the person to a page where they
 * say yes, and gets tokens it keeps and renews on its own. That is what makes
 * setup one step — paste an address, sign in — and it also answers the problem
 * a pasted key could not: a GitHub App's token lasts eight hours and its
 * refresh token can be spent only once, so something has to keep the newest
 * one. Here the assistant does.
 *
 * Nothing is stored on ForkLeaf's side. Client registrations, authorisation
 * codes and tokens are all sealed (encrypted and authenticated) with the
 * server's secret, so each carries what it needs and nothing can be forged.
 * This file holds the parts with no secrets: validation and the metadata
 * documents clients read.
 */

export const MCP_PATH = "/api/mcp";
export const AUTHORIZE_PATH = "/mcp/authorize";
export const TOKEN_PATH = "/api/mcp/oauth/token";
export const REGISTER_PATH = "/api/mcp/oauth/register";

const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2000;
const BLOCKED_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "blob:",
  "about:",
  "ftp:",
  "ws:",
  "wss:",
  "http:",
]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Where an assistant may ask to be sent back to.
 *
 * HTTPS anywhere; plain HTTP only on this machine, which is how command-line
 * clients receive the answer; and an app's own scheme (`cursor://…`), which
 * is how desktop apps do. Never a scheme that runs something or reads a file.
 */
export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URI_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return LOOPBACK.has(url.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && !BLOCKED_SCHEMES.has(url.protocol);
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** RFC 7636, S256 only: the plain method would defeat the point. */
export async function verifyPkce(verifier: unknown, challenge: string): Promise<boolean> {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const expected = await pkceChallenge(verifier);
  if (expected.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ challenge.charCodeAt(i);
  }
  return diff === 0;
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${AUTHORIZE_PATH}`,
    token_endpoint: `${origin}${TOKEN_PATH}`,
    registration_endpoint: `${origin}${REGISTER_PATH}`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["notebook"],
    service_documentation: `${origin}/docs/mcp`,
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["notebook"],
    resource_name: "ForkLeaf notebook",
    resource_documentation: `${origin}/docs/mcp`,
  };
}

export interface Registration {
  redirectUris: string[];
  clientName: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** RFC 7591 dynamic registration, reduced to the two fields that matter. */
export function parseRegistration(body: unknown): Parsed<Registration> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Expected a JSON registration request." };
  }
  const { redirect_uris: uris, client_name: name } = body as Record<string, unknown>;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    return {
      ok: false,
      error: `redirect_uris must list between 1 and ${MAX_REDIRECT_URIS} addresses.`,
    };
  }
  const bad = uris.find((uri) => !isAllowedRedirectUri(uri));
  if (bad !== undefined) {
    return { ok: false, error: `${String(bad)} is not an address ForkLeaf will redirect to.` };
  }
  const clientName =
    typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : "An AI assistant";
  return { ok: true, value: { redirectUris: uris as string[], clientName } };
}

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

/** The query an assistant opens the consent page with. */
export function readAuthorizeRequest(params: URLSearchParams): Parsed<AuthorizeRequest> {
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const challenge = params.get("code_challenge");
  if (params.get("response_type") !== "code") {
    return { ok: false, error: "Only response_type=code is supported." };
  }
  if (!clientId) return { ok: false, error: "client_id is missing." };
  if (!isAllowedRedirectUri(redirectUri)) {
    return { ok: false, error: "redirect_uri is missing or not allowed." };
  }
  if (!challenge || !/^[A-Za-z0-9\-_]{43}$/.test(challenge)) {
    return { ok: false, error: "A PKCE code_challenge is required." };
  }
  if ((params.get("code_challenge_method") ?? "S256") !== "S256") {
    return { ok: false, error: "code_challenge_method must be S256." };
  }
  const state = params.get("state");
  return {
    ok: true,
    value: {
      clientId,
      redirectUri,
      codeChallenge: challenge,
      state: state ? state.slice(0, 500) : null,
    },
  };
}

/** The address the assistant is sent back to, with the code or the refusal. */
export function redirectWith(redirectUri: string, values: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return url.toString();
}
