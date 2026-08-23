import { describe, expect, it, vi } from "vitest";
import { Transport, describeErrors } from "./http";
import { GitHubError } from "./errors";

/**
 * The transport is the last place a request can be stopped before the user's
 * GitHub token is attached to it, so it is where the "which URL are we actually
 * calling" question gets answered once for every caller.
 */

function transport() {
  const called: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    called.push(String(url));
    return new Response("{}", { status: 200 });
  });

  return {
    transport: new Transport({ token: "t", fetch: fetchImpl as unknown as typeof fetch }),
    fetchImpl,
    called,
  };
}

describe("Transport request paths", () => {
  it("calls the GitHub API for an ordinary path", async () => {
    const { transport: t, called } = transport();
    await t.request("/repos/octo/notes/git/trees/abc?recursive=1");

    expect(called).toEqual(["https://api.github.com/repos/octo/notes/git/trees/abc?recursive=1"]);
  });

  it("refuses a path whose segments traverse out of the endpoint", async () => {
    const { transport: t, fetchImpl } = transport();

    // What an owner of `../../user` would produce if it ever reached here.
    await expect(t.request("/repos/../../user/notes/git/trees/abc")).rejects.toBeInstanceOf(
      GitHubError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses percent-encoded traversal", async () => {
    const { transport: t, fetchImpl } = transport();

    await expect(t.request("/repos/%2e%2e/%2e%2e/user")).rejects.toBeInstanceOf(GitHubError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses an absolute URL on another host", async () => {
    const { transport: t, fetchImpl } = transport();

    // A forged `Link: rel="next"` header is the realistic route to this.
    await expect(t.request("https://evil.example.com/steal")).rejects.toBeInstanceOf(GitHubError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("still allows the API's own absolute pagination URLs", async () => {
    const { transport: t, called } = transport();
    await t.request("https://api.github.com/user/repos?page=2");

    expect(called).toEqual(["https://api.github.com/user/repos?page=2"]);
  });

  it("never sends the token anywhere but the API host", async () => {
    const { transport: t } = transport();
    await expect(t.request("https://api.github.com.evil.test/x")).rejects.toThrow(/Refusing/);
  });
});

describe("describeErrors", () => {
  /**
   * This runs on every 4xx the app can produce. It used to be
   * `JSON.stringify`, which put `[{"resource":"PullRequest","code":"custom",
   * "message":"No commits between main and my-branch"}]` in front of the user
   * — with the actual explanation buried in it.
   */

  it("pulls out the sentence GitHub wrote", () => {
    expect(
      describeErrors([
        { resource: "PullRequest", code: "custom", message: "No commits between main and x" },
      ]),
    ).toBe("No commits between main and x");
  });

  it("joins several, without repeating one", () => {
    expect(
      describeErrors([{ message: "first" }, { message: "second" }, { message: "first" }]),
    ).toBe("first; second");
  });

  it("makes something readable of an entry with no prose", () => {
    expect(describeErrors([{ resource: "Issue", field: "title", code: "missing_field" }])).toBe(
      "Issue.title missing_field",
    );
    expect(describeErrors([{ code: "already_exists" }])).toBe("already_exists");
  });

  it("falls back to the raw shape rather than dropping it", () => {
    expect(describeErrors([{ unexpected: true }])).toBe('{"unexpected":true}');
  });

  it("is empty for nothing", () => {
    expect(describeErrors(undefined)).toBe("");
    expect(describeErrors([])).toBe("");
  });
});
