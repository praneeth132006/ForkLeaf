import { describe, expect, it } from "vitest";
import {
  ApiError,
  assertName,
  assertRef,
  normalize,
  readOwnerRepo,
  readRepoRef,
} from "./api-helpers";

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
