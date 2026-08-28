import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeCodeForToken, refreshUserToken, TokenRefused } from "./github-oauth";

/**
 * GitHub's token endpoint, and the two things worth being exact about: the
 * lifetimes it reports, and the difference between "no" and "not right now".
 */

const respondWith = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  process.env.GITHUB_OAUTH_CLIENT_ID = "Ov23liTEST";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchangeCodeForToken", () => {
  it("turns GitHub's relative lifetimes into absolute times", async () => {
    // `expires_in` is only meaningful at the moment of the answer. Stored as a
    // duration it would be re-read hours later as though it still had eight
    // hours left on it, which is the same bug in a new place.
    vi.stubGlobal(
      "fetch",
      respondWith({
        access_token: "gho_new",
        expires_in: 28_800,
        refresh_token: "ghr_new",
        refresh_token_expires_in: 15_811_200,
        scope: "repo",
      }),
    );

    const before = Math.floor(Date.now() / 1000);
    const grant = await exchangeCodeForToken("code", "https://example.test/api/auth/callback");

    expect(grant.token).toBe("gho_new");
    expect(grant.refreshToken).toBe("ghr_new");
    expect(grant.scopes).toEqual(["repo"]);
    expect(grant.expiresAt).toBeGreaterThanOrEqual(before + 28_800);
    expect(grant.refreshExpiresAt).toBeGreaterThanOrEqual(before + 15_811_200);
  });

  it("reports no expiry for a token that has none", async () => {
    // An OAuth App, or a GitHub App with token expiration switched off. An
    // invented expiry here would renew a token that never needed renewing —
    // with no refresh token to do it with.
    vi.stubGlobal("fetch", respondWith({ access_token: "gho_forever", scope: "repo" }));

    const grant = await exchangeCodeForToken("code", "https://example.test/cb");

    expect(grant.expiresAt).toBeUndefined();
    expect(grant.refreshToken).toBeUndefined();
  });
});

describe("refreshUserToken", () => {
  it("asks for a renewal with the refresh grant", async () => {
    const fetchMock = respondWith({
      access_token: "gho_renewed",
      expires_in: 28_800,
      refresh_token: "ghr_rotated",
    });
    vi.stubGlobal("fetch", fetchMock);

    const grant = await refreshUserToken("ghr_old");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.grant_type).toBe("refresh_token");
    expect(body.refresh_token).toBe("ghr_old");
    // Rotated on every use, which is why the caller has to store what comes
    // back before using it.
    expect(grant.refreshToken).toBe("ghr_rotated");
  });

  it("treats a refusal as a refusal, however cheerfully it is delivered", async () => {
    // GitHub answers a spent or revoked refresh token with a 200 and an
    // `error` field, so the status line is no help: the body is the signal.
    vi.stubGlobal(
      "fetch",
      respondWith({
        error: "bad_refresh_token",
        error_description: "The refresh token is incorrect or expired.",
      }),
    );

    await expect(refreshUserToken("ghr_dead")).rejects.toBeInstanceOf(TokenRefused);
  });

  it("does not call a network failure a refusal", async () => {
    // The difference decides whether somebody is signed out. A refused token
    // is the end of a session; an unreachable GitHub is not.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );

    const failure = await refreshUserToken("ghr_fine").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TokenRefused);
  });
});
