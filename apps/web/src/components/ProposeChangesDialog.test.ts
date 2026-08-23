import { describe, expect, it } from "vitest";
import { explainProposeError } from "./ProposeChangesDialog";

/**
 * The dialog used to show GitHub's raw 422 body — including the JSON array —
 * to somebody who only wanted to know why their pull request did not open.
 * These are the failures worth translating; everything else is shown as it
 * came, because inventing a friendly message for a case nobody has read is how
 * a UI ends up confidently wrong.
 */

describe("explainProposeError", () => {
  it("explains an empty branch, which is the common one", () => {
    const explained = explainProposeError(
      "Validation Failed: No commits between main and praneeth132006/branch-test",
    );

    expect(explained).toContain("no changes the base branch does not already have");
    // The point is that it stops looking like a stack trace.
    expect(explained).not.toContain("resource");
    expect(explained).not.toContain("{");
  });

  it("explains a pull request that is already open", () => {
    expect(explainProposeError("A pull request already exists for user:branch.")).toContain(
      "already open",
    );
  });

  it("explains a branch that is not there", () => {
    expect(explainProposeError("Head sha can't be blank, Head ref must be a valid ref")).toContain(
      "could not be found",
    );
  });

  it("leaves anything it does not recognise alone", () => {
    expect(explainProposeError("Bad credentials")).toBeNull();
    expect(explainProposeError("")).toBeNull();
  });
});
