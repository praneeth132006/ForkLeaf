import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  clearSessionCookie: vi.fn(async () => {}),
  getSession: vi.fn(async () => null),
  getLiveSession: vi.fn(async () => null),
}));

beforeEach(() => {
  vi.clearAllMocks();
});
import {
  ApiError,
  assertName,
  assertRef,
  normalize,
  readOwnerRepo,
  readRepoRef,
  withRateLimitAdvice,
} from "./api-helpers";
import { GitHubError } from "@forkleaf/github-client";

/**
 * These are the input guards on the GitHub proxy routes.
 *
 * Every value they check is interpolated into an upstream API URL, so the cases
 * that matter are the hostile ones: a repository "name" that is really a path,
 * a branch that climbs out of its endpoint, a directory that escapes the repo.
 */

const params = (init: Record<string, string>) => new URLSearchParams(init);

describe("assertName", () => {
  it("accepts real GitHub owners and repositories", () => {
    for (const name of ["praneeth132006", "ForkLeaf", "next.js", "some-repo_1"]) {
      expect(assertName(name, "test")).toBe(name);
    }
  });

  it("rejects anything that would change which endpoint is called", () => {
    for (const name of [
      "",
      "a/b",
      "..",
      "../../user",
      "a%2fb",
      "a b",
      "a?b",
      "a#b",
      "x".repeat(101),
    ]) {
      expect(() => assertName(name, "test")).toThrow(ApiError);
    }
  });
});

describe("assertRef", () => {
  it("accepts ordinary branch names", () => {
    for (const ref of ["main", "feat/dashboard", "release-1.2", "user/fix_thing"]) {
      expect(assertRef(ref)).toBe(ref);
    }
  });

  it("rejects refs that traverse, dangle or are reserved", () => {
    for (const ref of ["", "../main", "a..b", "/main", "main/", "main.lock", "ma in", "-main"]) {
      expect(() => assertRef(ref)).toThrow(ApiError);
    }
  });
});

describe("readRepoRef", () => {
  it("reads a well-formed reference", () => {
    expect(
      readRepoRef(params({ owner: "octocat", repo: "notes", branch: "main", dir: "docs" })),
    ).toEqual({
      owner: "octocat",
      repo: "notes",
      branch: "main",
      directory: "docs",
    });
  });

  it("requires the three identifying fields", () => {
    expect(() => readRepoRef(params({ owner: "octocat", repo: "notes" }))).toThrow(ApiError);
  });

  it("rejects an owner carrying a path", () => {
    expect(() =>
      readRepoRef(params({ owner: "../../user", repo: "notes", branch: "main" })),
    ).toThrow(ApiError);
  });

  it("rejects a branch that traverses", () => {
    expect(() =>
      readRepoRef(params({ owner: "octocat", repo: "notes", branch: "../main" })),
    ).toThrow(ApiError);
  });

  it("strips traversal out of the notes directory", () => {
    const ref = readRepoRef(
      params({ owner: "octocat", repo: "notes", branch: "main", dir: "../../etc" }),
    );
    expect(ref.directory).toBe("etc");
  });
});

describe("readOwnerRepo", () => {
  it("trims and validates both halves", () => {
    expect(readOwnerRepo({ owner: " octocat ", repo: " notes " })).toEqual({
      owner: "octocat",
      repo: "notes",
    });
  });

  it("rejects missing, non-string and path-carrying values", () => {
    expect(() => readOwnerRepo({})).toThrow(ApiError);
    expect(() => readOwnerRepo({ owner: 7, repo: "notes" })).toThrow(ApiError);
    expect(() => readOwnerRepo({ owner: "octocat", repo: "notes/../../user" })).toThrow(ApiError);
  });
});

describe("normalize", () => {
  it("cannot be made to escape the repository root", () => {
    // Traversal segments are dropped rather than resolved: the result may not
    // be the path the caller meant, but it is always inside the repository.
    expect(normalize("../../secrets.md")).toBe("secrets.md");
    expect(normalize("/docs/./notes/../a.md")).toBe("docs/notes/a.md");
    expect(normalize("")).toBe("");
  });
});

describe("withRateLimitAdvice", () => {
  const rateLimited = () =>
    Promise.reject(new GitHubError("rate-limited", "API rate limit exceeded"));

  it("passes a successful call straight through", async () => {
    await expect(withRateLimitAdvice(async () => "ok", false)).resolves.toBe("ok");
  });

  it("tells a signed-out reader the thing that actually helps them", async () => {
    await expect(withRateLimitAdvice(rateLimited, false)).rejects.toMatchObject({
      status: 429,
      code: "rate-limited",
    });

    // Not GitHub's wording: the useful fact is that signing in fixes it.
    await withRateLimitAdvice(rateLimited, false).catch((error: ApiError) => {
      expect(error.message).toContain("Sign in with GitHub");
      expect(error.message).toContain("5,000");
    });
  });

  it("leaves the error alone for somebody already signed in", async () => {
    // Their limit is 5,000 an hour, so signing in is not the advice — this is
    // a real rate limit and should be reported as one.
    await expect(withRateLimitAdvice(rateLimited, true)).rejects.toBeInstanceOf(GitHubError);
  });

  it("never rewrites an unrelated failure", async () => {
    const notFound = () => Promise.reject(new GitHubError("not-found", "Not Found"));

    await expect(withRateLimitAdvice(notFound, false)).rejects.toBeInstanceOf(GitHubError);
    await expect(withRateLimitAdvice(notFound, false)).rejects.toMatchObject({ code: "not-found" });
  });
});

/**
 * A session cookie can outlive the GitHub token inside it by up to thirty
 * days, and nothing announces the moment it does. These cover the rule that
 * closes that gap: a token GitHub refuses ends the session immediately, so the
 * app cannot go on presenting itself as signed in while every call behind it
 * fails.
 */
describe("forgetDeadSession", () => {
  it("clears the session when GitHub refuses the token", async () => {
    const { forgetDeadSession } = await import("./api-helpers");
    const { clearSessionCookie } = await import("./session");

    expect(await forgetDeadSession(new GitHubError("unauthorized", "Bad credentials"))).toBe(true);
    expect(clearSessionCookie).toHaveBeenCalledTimes(1);
  });

  it("leaves the session alone for every other failure", async () => {
    const { forgetDeadSession } = await import("./api-helpers");
    const { clearSessionCookie } = await import("./session");

    // A rate limit, a private repository, a genuine 404: all recoverable, and
    // signing the user out over any of them would be its own bug.
    for (const code of ["rate-limited", "forbidden", "not-found", "conflict"] as const) {
      expect(await forgetDeadSession(new GitHubError(code, "nope"))).toBe(false);
    }
    // Not every failure is even a GitHubError.
    expect(await forgetDeadSession(new Error("socket hang up"))).toBe(false);
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });
});
