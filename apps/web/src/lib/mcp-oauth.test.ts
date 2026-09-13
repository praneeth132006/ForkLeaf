import { describe, expect, it } from "vitest";
import {
  authorizationServerMetadata,
  isAllowedRedirectUri,
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
    expect(parseRegistration({ redirect_uris: ["https://a.example/cb"] })).toMatchObject({
      ok: true,
      value: { clientName: "An AI assistant" },
    });
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
