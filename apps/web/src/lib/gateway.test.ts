import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiGatewayError, fetchSession, onSessionExpired } from "./gateway";

/**
 * The browser's half of "the sign-in ended".
 *
 * The server drops the cookie the moment GitHub refuses the token, but the
 * page it dropped it out from under is still showing an avatar, a repository
 * and a sync indicator. Every call in the gateway goes through one function,
 * which makes that function the only place guaranteed to see the 401 whatever
 * asked for it — a tree read, a commit, or the image proxy behind a note full
 * of screenshots.
 */

const respondWith = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

/**
 * Puts the module into the state a signed-in browser is in.
 *
 * Only a session that was live can stop being live, and the gateway learns
 * which it is from the server rather than assuming — so every expiry case has
 * to start from a real GitHub session, the same way the app does.
 */
async function signIn() {
  vi.stubGlobal(
    "fetch",
    respondWith(200, {
      mode: "github",
      user: { id: 1, login: "someone", name: null, avatarUrl: "" },
      githubAvailable: true,
      scopes: ["repo"],
    }),
  );
  await fetchSession();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session expiry", () => {
  it("tells its listeners when a call comes back unauthorised", async () => {
    await signIn();
    vi.stubGlobal(
      "fetch",
      respondWith(401, { error: { code: "unauthorized", message: "Your sign-in has expired." } }),
    );

    const told = vi.fn();
    const stop = onSessionExpired(told);

    await expect(fetchSession()).rejects.toBeInstanceOf(ApiGatewayError);
    expect(told).toHaveBeenCalledTimes(1);

    stop();
  });

  it("stays quiet for failures a sign-in would not fix", async () => {
    // A 500 or a 404 is not a reason to sign anybody out — doing so would turn
    // a passing outage into "you have been logged out", which is worse than
    // the outage.
    vi.stubGlobal("fetch", respondWith(500, { error: { code: "unknown", message: "boom" } }));

    const told = vi.fn();
    const stop = onSessionExpired(told);

    await expect(fetchSession()).rejects.toBeInstanceOf(ApiGatewayError);
    expect(told).not.toHaveBeenCalled();

    stop();
  });

  it("stops telling a listener that has unsubscribed", async () => {
    await signIn();
    vi.stubGlobal(
      "fetch",
      respondWith(401, { error: { code: "unauthorized", message: "expired" } }),
    );

    const told = vi.fn();
    onSessionExpired(told)();

    await expect(fetchSession()).rejects.toBeInstanceOf(ApiGatewayError);
    expect(told).not.toHaveBeenCalled();
  });

  it("tells every listener even when one of them throws", async () => {
    await signIn();
    vi.stubGlobal(
      "fetch",
      respondWith(401, { error: { code: "unauthorized", message: "expired" } }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const first = vi.fn(() => {
      throw new Error("listener is broken");
    });
    const second = vi.fn();
    const stopFirst = onSessionExpired(first);
    const stopSecond = onSessionExpired(second);

    await expect(fetchSession()).rejects.toBeInstanceOf(ApiGatewayError);
    // The editor missing this because the dashboard's listener threw would put
    // us back to failing silently, which is the bug this exists to close.
    expect(second).toHaveBeenCalledTimes(1);

    stopFirst();
    stopSecond();
  });
  it("says nothing to somebody who was never signed in", async () => {
    // Local mode: no cookie, no token, and a 401 from any route that needs one
    // is the expected answer rather than news. Announcing an expired sign-in
    // here would invent a session the reader never had.
    vi.stubGlobal(
      "fetch",
      respondWith(200, { mode: "local", user: null, githubAvailable: true, scopes: [] }),
    );
    await fetchSession();

    vi.stubGlobal(
      "fetch",
      respondWith(401, { error: { code: "unauthorized", message: "Sign in to continue." } }),
    );

    const told = vi.fn();
    const stop = onSessionExpired(told);

    await expect(fetchSession()).rejects.toBeInstanceOf(ApiGatewayError);
    expect(told).not.toHaveBeenCalled();

    stop();
  });

  it("announces once, not once per failing request", async () => {
    // A note with nine screenshots is nine requests through the image proxy,
    // and every one of them fails the same way. One banner, not nine.
    await signIn();
    vi.stubGlobal(
      "fetch",
      respondWith(401, { error: { code: "unauthorized", message: "expired" } }),
    );

    const told = vi.fn();
    const stop = onSessionExpired(told);

    await expect(fetchSession()).rejects.toBeInstanceOf(ApiGatewayError);
    await expect(fetchSession()).rejects.toBeInstanceOf(ApiGatewayError);
    await expect(fetchSession()).rejects.toBeInstanceOf(ApiGatewayError);
    expect(told).toHaveBeenCalledTimes(1);

    stop();
  });
});
