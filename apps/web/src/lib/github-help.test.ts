import { describe, expect, it } from "vitest";
import { explainAccessFailure, isPublicOnly } from "./github-help";
import type { SessionResponse } from "./gateway";

const session = (scopes: string[]): SessionResponse => ({
  mode: "github",
  user: { id: 1, login: "praneeth132006", name: null, avatarUrl: "" },
  githubAvailable: true,
  scopes,
});

/**
 * The same 404 means three different things, and only one of them is "that
 * repository does not exist".
 */
describe("explaining a GitHub refusal", () => {
  it("names the real reason when a private repo is invisible to a public-only token", () => {
    const problem = explainAccessFailure(
      { code: "not-found", status: 404 },
      session(["public_repo"]),
    );

    expect(problem.summary).toContain("public repositories only");
    expect(problem.steps.join(" ")).toContain("Private and public repositories");
    expect(problem.action?.href).toBe("/sign-in");
  });

  it("does not blame the scope when the scope is fine", () => {
    const problem = explainAccessFailure({ code: "not-found", status: 404 }, session(["repo"]));

    expect(problem.summary).not.toContain("public repositories only");
    expect(problem.steps.join(" ")).toContain("Check the owner and repository name");
  });

  it("points at the organisation owner when they are the ones who must act", () => {
    const problem = explainAccessFailure(
      {
        code: "forbidden",
        status: 403,
        message: "the `acme` organization has enabled OAuth App access restrictions",
      },
      session(["repo"]),
    );

    expect(problem.summary).toContain("organisation");
    expect(problem.steps.join(" ")).toContain("Grant access");
    expect(problem.action?.href).toContain("github.com/settings/connections/applications");
  });

  it("says the work is safe when the session has expired", () => {
    const problem = explainAccessFailure({ code: "unauthorized", status: 401 }, session(["repo"]));

    expect(problem.summary).toContain("on this device");
    expect(problem.action?.href).toBe("/sign-in");
  });

  it("has something useful to say about a failure it has never seen", () => {
    const problem = explainAccessFailure(new Error("something odd"), session(["repo"]));

    expect(problem.summary).toContain("something odd");
    expect(problem.steps.join(" ")).toContain("nothing is lost");
  });
});

describe("isPublicOnly", () => {
  it("is true only for a token that really cannot see private repositories", () => {
    expect(isPublicOnly(session(["public_repo", "read:user"]))).toBe(true);
    expect(isPublicOnly(session(["repo", "read:user"]))).toBe(false);
    // Nothing recorded: an older session, and not something to guess about.
    expect(isPublicOnly(session([]))).toBe(false);
    expect(isPublicOnly(null)).toBe(false);
  });
});
