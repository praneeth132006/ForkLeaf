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
  // Schemes a phone or desktop hands straight to a web browser, with the rest
  // of the address as the page to open. Each would turn "an app on this
  // device" into "any web site", which is what the HTTPS allowlist prevents.
  "intent:",
  "chrome:",
  "googlechrome:",
  "googlechromes:",
  "firefox:",
  "microsoft-edge:",
  "microsoft-edge-https:",
  "opera-http:",
  "opera-https:",
  "x-safari-http:",
  "x-safari-https:",
  "brave:",
  "mailto:",
  "tel:",
  "sms:",
]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The web sites an authorisation may be delivered to, as host and path.
 *
 * A web address can belong to anyone, so a code sent to one is a code handed
 * to whoever runs that site. Open registration is what the MCP specification
 * asks for — assistants register themselves the first time they connect — but
 * that must not let a stranger register their own site and send someone a
 * "connect" link that delivers their notebook there. So a web redirect is
 * accepted only for the assistants ForkLeaf documents, each pinned to its
 * callback path so an open redirect elsewhere on the same site cannot be used.
 * Apps on the person's own machine (loopback HTTP, an app's own scheme) are
 * not listed: an answer sent there never leaves that machine.
 *
 * A deployment can add its own with MCP_ALLOWED_REDIRECT_HOSTS, a comma
 * separated list of `host` or `host/path` entries.
 */
export const TRUSTED_REDIRECTS: readonly string[] = [
  "claude.ai/api/mcp/auth_callback",
  "claude.com/api/mcp/auth_callback",
  "chatgpt.com/connector_platform_oauth_redirect",
  "vscode.dev/redirect",
  "insiders.vscode.dev/redirect",
];

function configuredRedirects(): string[] {
  const raw = typeof process === "undefined" ? undefined : process.env.MCP_ALLOWED_REDIRECT_HOSTS;
  return (raw ?? "")
    .split(",")
    .map((entry) =>
      entry
        .trim()
        .toLowerCase()
        .replace(/^https:\/\//, "")
        .replace(/\/+$/, ""),
    )
    .filter(Boolean);
}

/**
 * Whether an HTTPS address is one of the allowed web callbacks. The host must
 * match exactly — no subdomains, so a user-content subdomain of an allowed
 * site does not inherit its trust — and the path must be the listed one or
 * below it.
 */
export function isTrustedWebRedirect(url: URL, extra: readonly string[] = configuredRedirects()) {
  if (url.protocol !== "https:" || url.port) return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  return [...TRUSTED_REDIRECTS, ...extra].some((entry) => {
    const slash = entry.indexOf("/");
    const entryHost = slash === -1 ? entry : entry.slice(0, slash);
    const entryPath = slash === -1 ? "" : entry.slice(slash);
    if (host !== entryHost) return false;
    return !entryPath || path === entryPath || path.startsWith(`${entryPath}/`);
  });
}

/**
 * Where an assistant may ask to be sent back to.
 *
 * HTTPS only to a known assistant's callback (see TRUSTED_REDIRECTS); plain
 * HTTP only on this machine, which is how command-line clients receive the
 * answer; and an app's own scheme (`cursor://…`), which is how desktop apps
 * do. Never a scheme that runs something, reads a file, or opens a browser.
 *
 * Checked at registration and again on every authorisation and renewal, so a
 * client registered before a rule tightened is held to the rule as it is now.
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
  if (url.protocol === "https:") return isTrustedWebRedirect(url);
  if (url.protocol === "http:") return LOOPBACK.has(url.hostname);
  return (
    /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) &&
    !BLOCKED_SCHEMES.has(url.protocol) &&
    // web+foo: is the prefix a web site can claim with registerProtocolHandler.
    !url.protocol.startsWith("web+")
  );
}

/**
 * The name an assistant gives itself, made safe to show: no control,
 * zero-width or direction-changing characters that could make it read as
 * something else, one line, and short.
 */
export function cleanClientName(value: unknown): string {
  if (typeof value !== "string") return "An AI assistant";
  const cleaned = value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "")
    .trim()
    .slice(0, 60);
  return cleaned || "An AI assistant";
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
    return {
      ok: false,
      error: `${String(bad).slice(0, 200)} is not an address ForkLeaf will redirect to. Web addresses are accepted only for known assistants; apps on your own computer may use http://localhost or their own scheme.`,
    };
  }
  const clientName = cleanClientName(name);
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
