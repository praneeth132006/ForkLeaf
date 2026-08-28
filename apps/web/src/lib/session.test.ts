import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Keeping a sign-in alive across an eight-hour token.
 *
 * ForkLeaf is registered as a GitHub App, whose user tokens expire eight hours
 * after they are issued. The session cookie lasts thirty days, so for most of
 * its life it carried a token that no longer worked — which is what "it keeps
 * signing me out" actually was. These are the cases that decide whether a
 * session survives that: the ordinary renewal, the refusal that really is the
 * end, the network blip that is not, and the burst of parallel requests that
 * must not each spend the same single-use refresh token.
 */

const store = new Map<string, string>();

const cookieJar = {
  get: (name: string) => {
    const value = store.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set: (name: string, value: string) => void store.set(name, value),
  delete: (name: string) => void store.delete(name),
};

vi.mock("next/headers", () => ({ cookies: async () => cookieJar }));

const refreshUserToken = vi.fn();
vi.mock("@/lib/github-oauth", async () => {
  class TokenRefused extends Error {
    constructor(message: string) {
      super(message);
      this.name = "TokenRefused";
    }
  }
  return {
    TokenRefused,
    refreshUserToken: (...args: unknown[]) => refreshUserToken(...args),
    exchangeCodeForToken: vi.fn(),
  };
});

process.env.SESSION_SECRET = "a-test-secret-that-is-certainly-long-enough";

import { TokenRefused } from "@/lib/github-oauth";
import { decryptSession, encryptSession, getLiveSession, getSession } from "./session";

const user = { id: 1, login: "someone", name: null, avatarUrl: "" };
const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

/** Puts a session in the cookie jar, the way a completed sign-in would. */
async function signedInWith(overrides: Record<string, unknown> = {}) {
  store.set("forkleaf_session", await encryptSession({ token: "old-token", user, ...overrides }));
}

beforeEach(() => {
  store.clear();
  refreshUserToken.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("what the cookie carries", () => {
  it("brings back every field it was given, not a hand-picked two", async () => {
    // `scopes` is written at sign-in so a genuine "no such repository" can be
    // told apart from "you did not grant access to private ones". It used to
    // be dropped on the way out, which made that distinction unreachable — and
    // would have taken the renewal fields with it.
    const value = await encryptSession({
      token: "t",
      user,
      scopes: ["repo"],
      expiresAt: 1_800_000_000,
      refreshToken: "r",
      refreshExpiresAt: 1_820_000_000,
    });

    expect(await decryptSession(value)).toEqual({
      token: "t",
      user,
      scopes: ["repo"],
      expiresAt: 1_800_000_000,
      refreshToken: "r",
      refreshExpiresAt: 1_820_000_000,
    });
  });
});

describe("getLiveSession", () => {
  it("leaves a token that has not expired alone", async () => {
    await signedInWith({ expiresAt: inSeconds(3600), refreshToken: "r" });

    const session = await getLiveSession();

    expect(session?.token).toBe("old-token");
    expect(refreshUserToken).not.toHaveBeenCalled();
  });

  it("leaves a token with no expiry alone", async () => {
    // An OAuth App, or a GitHub App with token expiration switched off: there
    // is nothing to renew and nothing to renew it with.
    await signedInWith();

    expect((await getLiveSession())?.token).toBe("old-token");
    expect(refreshUserToken).not.toHaveBeenCalled();
  });

  it("renews a token that is about to expire, before it does", async () => {
    // Two minutes left is not enough: it would expire during the request it
    // was about to be used for.
    await signedInWith({ expiresAt: inSeconds(120), refreshToken: "old-refresh" });
    refreshUserToken.mockResolvedValue({
      token: "new-token",
      scopes: [],
      expiresAt: inSeconds(28_800),
      refreshToken: "new-refresh",
    });

    const session = await getLiveSession();

    expect(refreshUserToken).toHaveBeenCalledWith("old-refresh");
    expect(session?.token).toBe("new-token");
    // Written back before it was used: the spent refresh token is dead, and a
    // renewal whose replacement never reached the cookie has thrown away the
    // session's only way back.
    expect((await getSession())?.refreshToken).toBe("new-refresh");
  });

  it("keeps what the sign-in recorded when a renewal reports no scopes", async () => {
    // A GitHub App renewal comes back with an empty scope list; replacing the
    // real one with it would lose the only record of what was granted.
    await signedInWith({
      expiresAt: inSeconds(0),
      refreshToken: "r",
      scopes: ["repo"],
    });
    refreshUserToken.mockResolvedValue({
      token: "new-token",
      scopes: [],
      expiresAt: inSeconds(28_800),
      refreshToken: "r2",
    });

    expect((await getLiveSession())?.scopes).toEqual(["repo"]);
  });

  it("spends the refresh token once, however many requests arrive together", async () => {
    // Opening a note is a burst: the tree, the file, one call per image. Each
    // would notice the same expired token, and the refresh token is single
    // use — so the first would win and the rest would end the session that was
    // in the middle of being saved.
    await signedInWith({ expiresAt: inSeconds(0), refreshToken: "r" });
    refreshUserToken.mockResolvedValue({
      token: "new-token",
      scopes: [],
      expiresAt: inSeconds(28_800),
      refreshToken: "r2",
    });

    const sessions = await Promise.all([getLiveSession(), getLiveSession(), getLiveSession()]);

    expect(refreshUserToken).toHaveBeenCalledTimes(1);
    for (const session of sessions) expect(session?.token).toBe("new-token");
  });

  it("ends the session when GitHub refuses to renew it", async () => {
    // The authorisation was revoked, or the refresh token is past its six
    // months. GitHub will say the same thing next time, so this really is over.
    await signedInWith({ expiresAt: inSeconds(0), refreshToken: "r" });
    refreshUserToken.mockRejectedValue(new TokenRefused("bad_refresh_token"));

    expect(await getLiveSession()).toBeNull();
    expect(store.has("forkleaf_session")).toBe(false);
  });

  it("keeps the session when GitHub could not be reached", async () => {
    // A network blip says nothing about whether this sign-in is still good,
    // and signing somebody out over one is worse than the failed call.
    await signedInWith({ expiresAt: inSeconds(0), refreshToken: "r" });
    refreshUserToken.mockRejectedValue(new Error("fetch failed"));

    expect((await getLiveSession())?.token).toBe("old-token");
    expect(store.has("forkleaf_session")).toBe(true);
  });

  it("ends an expired session that has nothing to renew it with", async () => {
    await signedInWith({ expiresAt: inSeconds(-10) });

    expect(await getLiveSession()).toBeNull();
    expect(store.has("forkleaf_session")).toBe(false);
  });

  it("says nothing is signed in when there is no cookie", async () => {
    expect(await getLiveSession()).toBeNull();
  });
});
