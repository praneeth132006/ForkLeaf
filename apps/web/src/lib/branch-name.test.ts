import { describe, expect, it } from "vitest";
import { sanitizeBranchName, suggestBranchName } from "./branch-name";

describe("sanitizeBranchName", () => {
  it.each([
    ["fix the docs", "fix-the-docs"],
    ["  padded  ", "padded"],
    ["feature/new-thing", "feature/new-thing"],
    ["docs: typo (again)", "docs-typo-again"],
    ["../escape", "escape"],
    ["a//b", "a/b"],
    ["trailing.lock", "trailing"],
    ["-leading-dash", "leading-dash"],
  ])("%s → %s", (input, expected) => {
    expect(sanitizeBranchName(input)).toBe(expected);
  });

  it("caps absurd lengths without leaving a stranded separator", () => {
    const capped = sanitizeBranchName("x".repeat(500));
    expect(capped).toHaveLength(200);
    expect(capped.endsWith("-")).toBe(false);
  });

  it("returns empty when nothing usable survives", () => {
    expect(sanitizeBranchName("///")).toBe("");
    expect(sanitizeBranchName("🎉")).toBe("");
  });
});

describe("suggestBranchName", () => {
  it("namespaces the branch under the author's login", () => {
    expect(suggestBranchName("octo", "Fix the install docs")).toBe("octo/fix-the-install-docs");
  });

  it("falls back to a generic name when the subject yields nothing", () => {
    expect(suggestBranchName("octo", "🎉")).toBe("octo/edit");
  });

  it("keeps the result short enough to read in a PR list", () => {
    expect(suggestBranchName("octo", "a".repeat(200)).length).toBeLessThanOrEqual(50);
  });
});
