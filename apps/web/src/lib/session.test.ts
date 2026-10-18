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
  getAll: () => Array.from(store, ([name, value]) => ({ name, value })),
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
import {
  clearSessionCookie,
  consumeOAuthState,
  createOAuthState,
  decryptSession,
  encryptSession,
  forgetRenewalsForTesting,
  getLiveSession,
  getSession,
  listSessions,
  sealValue,
  setActiveAccount,
  setSessionCookie,
} from "./session";
import { EncryptJWT } from "jose";

const user = { id: 1, login: "someone", name: null, avatarUrl: "" };
const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

/** Puts a session in the cookie jar, the way a completed sign-in would. */
async function signedInWith(overrides: Record<string, unknown> = {}) {
  store.set("forkleaf_session", await encryptSession({ token: "old-token", user, ...overrides }));
}

beforeEach(() => {
  store.clear();
  forgetRenewalsForTesting();
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

describe("a session is only ever a session", () => {
  it("refuses a value sealed for another purpose, even one shaped like a session", async () => {
    const assistantToken = await sealValue({ token: "t", user }, "mcp-access", 3600);
    expect(await decryptSession(assistantToken)).toBeNull();
  });

  it("still reads a cookie written before sessions carried a purpose", async () => {
    const key = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(process.env.SESSION_SECRET!)),
    );
    const legacy = await new EncryptJWT({ token: "t", user })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .encrypt(key);
    expect(await decryptSession(legacy)).toMatchObject({ token: "t", user });
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
    expect(await getSession()).toBeNull();
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
    expect(await getSession()).toBeNull();
  });

  it("says nothing is signed in when there is no cookie", async () => {
    expect(await getLiveSession()).toBeNull();
  });
});

/**
 * The installed app on a phone: it wakes, and fires the tree, the open note,
 * its images and the session check all at once over a slow connection. The
 * responses come back in whatever order they like. None of that may end a
 * sign-in that is still good.
 */
describe("requests that arrive out of order", () => {
  const renewal = {
    token: "new-token",
    scopes: [],
    expiresAt: inSeconds(28_800),
    refreshToken: "r2",
  };

  it("hands a late request the session an earlier one already renewed", async () => {
    await signedInWith({ expiresAt: inSeconds(0), refreshToken: "r" });
    const stale = store.get("forkleaf_session")!;
    refreshUserToken.mockResolvedValueOnce(renewal);

    expect((await getLiveSession())?.token).toBe("new-token");

    // Sent with the old cookie before the new one reached the browser.
    store.set("forkleaf_session", stale);
    refreshUserToken.mockRejectedValue(new TokenRefused("bad_refresh_token"));

    expect((await getLiveSession())?.token).toBe("new-token");
    expect(refreshUserToken).toHaveBeenCalledTimes(1);
    expect((await getSession())?.token).toBe("new-token");
  });

  it("ends only the session GitHub refused, never a newer one", async () => {
    // Another server instance renewed it and the browser now holds the result,
    // but this instance's refusal of the old refresh token lands afterwards.
    await signedInWith({ expiresAt: inSeconds(0), refreshToken: "r" });
    refreshUserToken.mockRejectedValue(new TokenRefused("bad_refresh_token"));
    expect(await getLiveSession()).toBeNull();

    store.set("forkleaf_session", await encryptSession({ user, ...renewal }));

    expect((await getSession())?.token).toBe("new-token");
    expect((await getLiveSession())?.token).toBe("new-token");
  });

  it("keeps a session ended even when its cookie comes back", async () => {
    await signedInWith({ expiresAt: inSeconds(0), refreshToken: "r" });
    const dead = store.get("forkleaf_session")!;
    refreshUserToken.mockRejectedValue(new TokenRefused("bad_refresh_token"));
    expect(await getLiveSession()).toBeNull();

    store.set("forkleaf_session", dead);
    expect(await getSession()).toBeNull();
  });
});

/**
 * Sign-in is offered from the hero, the nav, the sidebar and the editor, and
 * an installed app adds one more way to start it twice: github.com is outside
 * the app's scope, so the browser moves the navigation into a view of its own
 * and can run the start again on the way. The cookie used to hold the last
 * state only, so finishing any attempt but the latest was rejected as a
 * forgery — "that sign-in link expired or did not match", on a sign-in nobody
 * forged.
 */
describe("sign-ins started more than once", () => {
  beforeEach(() => {
    store.clear();
  });

  it("lets an earlier attempt be the one that comes back", async () => {
    const first = await createOAuthState();
    await createOAuthState();

    expect(await consumeOAuthState(first)).toBe(true);
  });

  it("still accepts the most recent attempt", async () => {
    await createOAuthState();
    const latest = await createOAuthState();

    expect(await consumeOAuthState(latest)).toBe(true);
  });

  it("forgets the oldest once there are too many", async () => {
    const oldest = await createOAuthState();
    for (let i = 0; i < 4; i += 1) await createOAuthState();

    expect(await consumeOAuthState(oldest)).toBe(false);
  });

  it("clears every attempt once one of them finishes", async () => {
    const first = await createOAuthState();
    const second = await createOAuthState();

    expect(await consumeOAuthState(first)).toBe(true);
    // The other attempt died with it: a state is single use, and so is the
    // round of sign-in it belonged to.
    expect(await consumeOAuthState(second)).toBe(false);
  });

  it("refuses a state nobody here issued", async () => {
    await createOAuthState();

    expect(await consumeOAuthState("f".repeat(48))).toBe(false);
    expect(await consumeOAuthState("")).toBe(false);
    expect(await consumeOAuthState(null)).toBe(false);
  });

  it("refuses anything that is not one of our states, however it got there", async () => {
    // A cookie is attacker-writable in more situations than a session is, so
    // the contents are parsed, not trusted: only 48 hex characters count.
    store.set("forkleaf_oauth_state", "not-a-state.*.");

    expect(await consumeOAuthState("not-a-state")).toBe(false);
    expect(await consumeOAuthState("*")).toBe(false);
  });
});

/**
 * Two accounts in one browser.
 *
 * Work notes in one GitHub account and personal notes in another is an
 * ordinary way to live, and until now "signed in" and "signed in as" were the
 * same cookie: a second account could only arrive by evicting the first. Each
 * account's sealed session has its own cookie now, with a pointer at the one
 * in front.
 */
describe("more than one account signed in", () => {
  const work = { id: 7, login: "someone-work", name: null, avatarUrl: "" };
  const personal = { id: 9, login: "someone", name: null, avatarUrl: "" };

  /** Signs in an account the way a completed OAuth callback would. */
  const signIn = (who: typeof work, token: string) =>
    setSessionCookie({ token, user: who, scopes: ["repo"] });

  beforeEach(() => {
    store.clear();
  });

  it("keeps both, and answers as the one in front", async () => {
    await signIn(work, "work-token");
    await signIn(personal, "personal-token");

    expect((await getSession())?.user.login).toBe("someone");
    expect((await listSessions()).map((session) => session.user.id).sort()).toEqual([7, 9]);
  });

  it("switches between them without signing in again", async () => {
    await signIn(work, "work-token");
    await signIn(personal, "personal-token");

    expect(await setActiveAccount(7)).toBe(true);

    const session = await getSession();
    expect(session?.user.login).toBe("someone-work");
    // The token came back with it: switching is not a second round trip to
    // GitHub, which is the whole point of keeping both.
    expect(session?.token).toBe("work-token");
  });

  it("refuses to point at an account this browser is not signed in to", async () => {
    await signIn(work, "work-token");

    expect(await setActiveAccount(1234)).toBe(false);
    expect((await getSession())?.user.id).toBe(7);
  });

  it("keeps one account's sessions out of the other's", async () => {
    await signIn(work, "work-token");
    await signIn(personal, "personal-token");

    // GitHub refuses the personal account's token: that account's sign-in is
    // over and the work account's is untouched. A single ended marker used to
    // mean one account's bad morning ended the other's session too.
    refreshUserToken.mockRejectedValue(new TokenRefused("bad_refresh_token"));
    store.set(
      "forkleaf_acct_9",
      await encryptSession({
        token: "personal-token-expiring",
        user: personal,
        expiresAt: inSeconds(0),
        refreshToken: "r",
      }),
    );

    expect(await getLiveSession()).toBeNull();
    expect(await setActiveAccount(7)).toBe(true);
    expect((await getSession())?.token).toBe("work-token");
  });

  it("falls back to the one that is left when the active account goes", async () => {
    await signIn(work, "work-token");
    await signIn(personal, "personal-token");
    store.delete("forkleaf_acct_9");

    expect((await getSession())?.user.id).toBe(7);
  });

  it("will not guess between two accounts with no pointer", async () => {
    await signIn(work, "work-token");
    await signIn(personal, "personal-token");
    store.delete("forkleaf_active");

    // Guessing wrong opens somebody's work notes under their personal account.
    expect(await getSession()).toBeNull();
    expect(await listSessions()).toHaveLength(2);
  });

  it("signs out of every account, not only the one in front", async () => {
    await signIn(work, "work-token");
    await signIn(personal, "personal-token");

    await clearSessionCookie();

    expect(await listSessions()).toEqual([]);
    expect(await getSession()).toBeNull();
    // Nothing left holding a token.
    expect([...store.keys()].filter((name) => name.startsWith("forkleaf_acct_"))).toEqual([]);
  });
});

/**
 * The upgrade itself: everybody signed in on the day this ships has one
 * `forkleaf_session` cookie and no pointer. Reading it costs one `if` and
 * saves all of them a sign-in.
 */
describe("a browser arriving from the single-session cookie", () => {
  beforeEach(() => {
    store.clear();
  });

  it("is still signed in", async () => {
    await signedInWith();

    expect((await getSession())?.token).toBe("old-token");
    expect(await listSessions()).toHaveLength(1);
  });

  it("is rewritten into its own account cookie by the next write", async () => {
    await signedInWith();
    const session = (await getSession())!;

    await setSessionCookie(session);

    expect(store.get(`forkleaf_acct_${user.id}`)).toBeDefined();
    expect(store.get("forkleaf_active")).toBe(String(user.id));
    // Left behind, it would be a second copy of the same token sitting in a
    // cookie nothing reads.
    expect(store.get("forkleaf_session")).toBeUndefined();
  });

  it("moves across when it is the account being switched to", async () => {
    await signedInWith();

    expect(await setActiveAccount(user.id)).toBe(true);
    expect(store.get(`forkleaf_acct_${user.id}`)).toBeDefined();
    expect(store.get("forkleaf_session")).toBeUndefined();
  });
});
