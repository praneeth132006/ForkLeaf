import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const capture = vi.fn();
const identify = vi.fn();
const reset = vi.fn();

vi.mock("posthog-js", () => ({ default: { init, capture, identify, reset } }));

/** A fresh module per test, since it deliberately starts only once. */
async function load(key?: string, host?: string) {
  vi.resetModules();
  vi.clearAllMocks();

  if (key) process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
  else delete process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (host) process.env.NEXT_PUBLIC_POSTHOG_HOST = host;
  else delete process.env.NEXT_PUBLIC_POSTHOG_HOST;

  return import("./posthog");
}

beforeEach(() => {
  vi.stubGlobal("window", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

describe("PostHog — when it is not configured", () => {
  it("does nothing at all without a key", async () => {
    const ph = await load();
    ph.startPostHog();

    // The normal state for a fork, a local checkout or a preview deployment.
    expect(init).not.toHaveBeenCalled();
    expect(ph.postHogReady()).toBe(false);
  });

  it("swallows events, identifies and resets rather than throwing", async () => {
    const ph = await load();

    expect(() => ph.postHogCapture("note_created")).not.toThrow();
    expect(() => ph.postHogIdentify("octocat")).not.toThrow();
    expect(() => ph.postHogReset()).not.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
});

describe("PostHog — what it collects", () => {
  it("starts with the project key", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();

    expect(init).toHaveBeenCalledWith("phc_test", expect.anything());
    expect(ph.postHogReady()).toBe(true);
  });

  it("never turns on the three defaults that would read people's notes", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();

    const config = init.mock.calls[0]![1];
    // Autocapture records the text of what was clicked, which here is the
    // contents of somebody's note. Session recording is worse.
    expect(config.autocapture).toBe(false);
    expect(config.disable_session_recording).toBe(true);
    // The app sends its own page views on route change.
    expect(config.capture_pageview).toBe(false);
  });

  it("masks text and attributes, against a future default we did not choose", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();

    const config = init.mock.calls[0]![1];
    expect(config.mask_all_text).toBe(true);
    expect(config.mask_all_element_attributes).toBe(true);
  });

  it("uses the US cloud unless told otherwise", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();
    expect(init.mock.calls[0]![1].api_host).toBe("https://us.i.posthog.com");
  });

  it("honours a host for the EU cloud or a proxy", async () => {
    const ph = await load("phc_test", "https://eu.i.posthog.com");
    ph.startPostHog();
    expect(init.mock.calls[0]![1].api_host).toBe("https://eu.i.posthog.com");
  });

  it("starts once, however many times it is called", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();
    ph.startPostHog();
    ph.startPostHog();

    expect(init).toHaveBeenCalledTimes(1);
  });

  it("does nothing on the server, where there is no window", async () => {
    const ph = await load("phc_test");
    vi.unstubAllGlobals();
    // @ts-expect-error — deleting the global is the point of the test.
    delete globalThis.window;

    ph.startPostHog();
    expect(init).not.toHaveBeenCalled();
  });
});

describe("PostHog — events and identity", () => {
  it("sends an event once started", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();
    ph.postHogCapture("note_created", { where: "sidebar" });

    expect(capture).toHaveBeenCalledWith("note_created", { where: "sidebar" });
  });

  it("identifies by GitHub login and nothing else", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();
    ph.postHogIdentify("octocat");

    // The login is already public on github.com; no email, no repo names.
    expect(identify).toHaveBeenCalledWith("octocat");
  });

  it("ignores an empty login rather than identifying nobody", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();
    ph.postHogIdentify("");

    expect(identify).not.toHaveBeenCalled();
  });

  it("forgets the person on sign-out", async () => {
    const ph = await load("phc_test");
    ph.startPostHog();
    ph.postHogReset();

    expect(reset).toHaveBeenCalled();
  });
});
