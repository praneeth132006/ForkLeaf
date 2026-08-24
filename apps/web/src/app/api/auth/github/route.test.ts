import { describe, expect, it } from "vitest";

/**
 * Which scope a sign-in asks for.
 *
 * The value comes off the query string and ends up in the authorisation
 * request GitHub shows the user, so it is the one input here that must not be
 * passed through unchecked: an unvalidated scope is a way to get somebody to
 * grant something they were never shown a button for.
 *
 * The table is duplicated rather than exported from the route, because a Next
 * route file may only export HTTP methods — so this asserts the property that
 * matters (anything unrecognised falls back to the default) against the same
 * shape.
 */

const SCOPES: Record<string, string> = {
  all: "repo read:user",
  public: "public_repo read:user",
};

const scopeFor = (access: string | null) => SCOPES[access ?? "all"] ?? SCOPES.all!;

describe("the scope a sign-in asks for", () => {
  it("asks for private repositories by default, which is where notes go", () => {
    expect(scopeFor(null)).toBe("repo read:user");
    expect(scopeFor("all")).toBe("repo read:user");
  });

  it("can ask for public repositories only", () => {
    expect(scopeFor("public")).toBe("public_repo read:user");
  });

  it("never includes the scope that reaches private repositories", () => {
    // On the tokens, not on the string: "public_repo" contains "repo".
    expect(scopeFor("public").split(" ")).not.toContain("repo");
    expect(scopeFor("public").split(" ")).toContain("public_repo");
    expect(scopeFor("all").split(" ")).toContain("repo");
  });

  it("falls back to the default rather than honouring an invented value", () => {
    expect(scopeFor("admin:org")).toBe("repo read:user");
    expect(scopeFor("delete_repo")).toBe("repo read:user");
    expect(scopeFor("")).toBe("repo read:user");
  });
});
