import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizationServerMetadata,
  cleanClientName,
  isAllowedRedirectUri,
  isTrustedWebRedirect,
  parseRegistration,
  pkceChallenge,
  protectedResourceMetadata,
  readAuthorizeRequest,
  redirectWith,
  verifyPkce,
} from "./mcp-oauth";

describe("isAllowedRedirectUri", () => {
  it("accepts HTTPS, loopback HTTP and an app's own scheme", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:33418/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:9000/cb")).toBe(true);
    expect(isAllowedRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe(true);
  });

  it("accepts the documented assistants' web callbacks", () => {
    for (const uri of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "https://vscode.dev/redirect",
      "https://insiders.vscode.dev/redirect",
      "vscode://vscode.github-authentication/did-authenticate",
      "http://[::1]:7777/callback",
    ]) {
      expect(isAllowedRedirectUri(uri)).toBe(true);
    }
  });

  // The report of 13 October 2026: an unauthenticated registration with an
  // attacker's own HTTPS callback was accepted, so a "connect" link could
  // deliver someone's notebook to that site.
  it("refuses a web callback on any site that is not a known assistant", () => {
    for (const uri of [
      "https://attacker-alpha.example.com/cb",
      "https://evil.example/api/mcp/auth_callback",
      // Look-alikes and tricks around the trusted hosts.
      "https://claude.ai.evil.example/api/mcp/auth_callback",
      "https://evilclaude.ai/api/mcp/auth_callback",
      "https://sub.claude.ai/api/mcp/auth_callback",
      "https://claude.ai:8443/api/mcp/auth_callback",
      "https://claude.ai/somewhere-else",
      "https://claude.ai/api/mcp/auth_callback_evil",
      "https://claude.ai/api/mcp/auth_callback/../../redirect?to=https://evil.example",
      "https://claude.ai/api/mcp/%2e%2e/%2e%2e/redirect",
      "https://chatgpt.com/",
      "https://vscode.dev/",
    ]) {
      expect(isAllowedRedirectUri(uri), uri).toBe(false);
    }
  });

  it("refuses schemes that hand the address to a web browser", () => {
    for (const uri of [
      "intent://evil.example/#Intent;scheme=https;end",
      "googlechromes://evil.example/cb",
      "x-safari-https://evil.example/cb",
      "microsoft-edge:https://evil.example/cb",
      "firefox://open-url?url=https://evil.example",
      "web+forkleaf://evil.example/cb",
      "mailto:attacker@example.com",
    ]) {
      expect(isAllowedRedirectUri(uri), uri).toBe(false);
    }
  });

  it("refuses anything that could run code, read files, or travel unencrypted", () => {
    for (const uri of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "http://evil.example/cb",
      "https://user:pw@example.com/cb",
      "https://example.com/cb#fragment",
      "not a url",
      42,
    ]) {
      expect(isAllowedRedirectUri(uri)).toBe(false);
    }
  });
});

describe("MCP_ALLOWED_REDIRECT_HOSTS", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets a deployment add its own web callbacks, host-exact", () => {
    vi.stubEnv("MCP_ALLOWED_REDIRECT_HOSTS", " https://agent.example.org/oauth/ , other.example ");
    expect(isAllowedRedirectUri("https://agent.example.org/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("https://agent.example.org/elsewhere")).toBe(false);
    expect(isAllowedRedirectUri("https://other.example/any/path")).toBe(true);
    expect(isAllowedRedirectUri("https://x.other.example/any/path")).toBe(false);
  });

  it("adds nothing when unset", () => {
    expect(isTrustedWebRedirect(new URL("https://other.example/cb"), [])).toBe(false);
  });
});

describe("cleanClientName", () => {
  it("strips characters that could disguise a name", () => {
    expect(cleanClientName("Cla\u200Bude")).toBe("Claude");
    expect(cleanClientName("Evil\u202Eedualc")).toBe("Eviledualc");
    expect(cleanClientName("line\none")).toBe("line one");
    expect(cleanClientName("x".repeat(500))).toHaveLength(60);
    expect(cleanClientName("   ")).toBe("An AI assistant");
    expect(cleanClientName(7)).toBe("An AI assistant");
  });
});

describe("PKCE", () => {
  // The example from RFC 7636, appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("matches the RFC's worked example", async () => {
    expect(await pkceChallenge(verifier)).toBe(challenge);
    expect(await verifyPkce(verifier, challenge)).toBe(true);
  });

  it("refuses a wrong or malformed verifier", async () => {
    expect(await verifyPkce(`${verifier.slice(0, -1)}A`, challenge)).toBe(false);
    expect(await verifyPkce("short", challenge)).toBe(false);
    expect(await verifyPkce(undefined, challenge)).toBe(false);
  });
});

describe("parseRegistration", () => {
  it("keeps the redirect addresses and a name", () => {
    expect(
      parseRegistration({
        redirect_uris: ["http://localhost:1234/cb"],
        client_name: "Claude Code",
      }),
    ).toEqual({
      ok: true,
      value: { redirectUris: ["http://localhost:1234/cb"], clientName: "Claude Code" },
    });
    expect(
      parseRegistration({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }),
    ).toMatchObject({
      ok: true,
      value: { clientName: "An AI assistant" },
    });
  });

  it("refuses the reported registration, and any list containing an unknown site", () => {
    expect(
      parseRegistration({
        client_name: "ProbeAlpha",
        redirect_uris: ["https://attacker-alpha.example.com/cb"],
      }).ok,
    ).toBe(false);
    expect(
      parseRegistration({
        client_name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "https://evil.example/cb"],
      }).ok,
    ).toBe(false);
  });

  it("refuses a registration without safe redirect addresses", () => {
    expect(parseRegistration(null).ok).toBe(false);
    expect(parseRegistration({ redirect_uris: [] }).ok).toBe(false);
    expect(parseRegistration({ redirect_uris: ["javascript:x"] }).ok).toBe(false);
  });
});

describe("readAuthorizeRequest", () => {
  const good = new URLSearchParams({
    response_type: "code",
    client_id: "abc",
    redirect_uri: "http://localhost:5000/cb",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "xyz",
  });

  it("reads a well-formed request", () => {
    expect(readAuthorizeRequest(good)).toEqual({
      ok: true,
      value: {
        clientId: "abc",
        redirectUri: "http://localhost:5000/cb",
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        state: "xyz",
      },
    });
  });

  it("insists on PKCE with S256 and the code flow", () => {
    const without = (key: string, value?: string) => {
      const params = new URLSearchParams(good);
      if (value === undefined) params.delete(key);
      else params.set(key, value);
      return readAuthorizeRequest(params).ok;
    };
    expect(without("code_challenge")).toBe(false);
    expect(without("code_challenge_method", "plain")).toBe(false);
    expect(without("response_type", "token")).toBe(false);
    expect(without("redirect_uri", "http://evil.example/")).toBe(false);
    // A client registered before the allowlist still cannot be authorised
    // to an address the rules no longer allow.
    expect(without("redirect_uri", "https://attacker-alpha.example.com/cb")).toBe(false);
  });
});

describe("metadata and redirects", () => {
  it("points clients at this deployment's endpoints", () => {
    const origin = "https://forkleaf.vercel.app";
    expect(authorizationServerMetadata(origin)).toMatchObject({
      issuer: origin,
      authorization_endpoint: `${origin}/mcp/authorize`,
      token_endpoint: `${origin}/api/mcp/oauth/token`,
      code_challenge_methods_supported: ["S256"],
    });
    expect(protectedResourceMetadata(origin)).toMatchObject({
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
    });
  });

  it("adds the answer to the redirect address without losing its own query", () => {
    expect(redirectWith("http://localhost:5000/cb?x=1", { code: "c", state: null })).toBe(
      "http://localhost:5000/cb?x=1&code=c",
    );
  });
});
