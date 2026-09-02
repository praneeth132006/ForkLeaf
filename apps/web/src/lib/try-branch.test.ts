import { describe, expect, it } from "vitest";
import { describeTry, parseTryBranch, tryBranchFor } from "./try-branch";

describe("tryBranchFor", () => {
  it("says what it is, where it came from, and what it is about", () => {
    expect(tryBranchFor("main", "The deploy runbook")).toBe("try/main/the-deploy-runbook");
  });

  it("keeps a base branch that has slashes in it", () => {
    expect(tryBranchFor("release/2026", "Notes")).toBe("try/release/2026/notes");
  });

  it("takes the slashes out of the subject, which is the last segment", () => {
    // Otherwise a note called "SOC 101/week one" would be read back as a
    // branch that came from `main/soc-101`.
    expect(tryBranchFor("main", "SOC 101/week one")).toBe("try/main/soc-101-week-one");
  });

  it("names an untitled experiment something rather than nothing", () => {
    expect(tryBranchFor("main", "!!!")).toBe("try/main/rewrite");
  });
});

describe("parseTryBranch", () => {
  it("reads back what the name says", () => {
    expect(parseTryBranch("try/main/the-deploy-runbook")).toEqual({
      base: "main",
      slug: "the-deploy-runbook",
    });
  });

  it("gives a base branch its slashes back", () => {
    expect(parseTryBranch("try/release/2026/notes")).toEqual({
      base: "release/2026",
      slug: "notes",
    });
  });

  it("says nothing about an ordinary branch", () => {
    // Being wrong here would offer to merge somebody's feature branch into a
    // branch this invented.
    expect(parseTryBranch("main")).toBeNull();
    expect(parseTryBranch("feature/search")).toBeNull();
    expect(parseTryBranch("try/")).toBeNull();
    expect(parseTryBranch("try/main")).toBeNull();
  });

  it("round-trips whatever it made", () => {
    const branch = tryBranchFor("release/2026", "The deploy runbook");
    expect(parseTryBranch(branch)).toEqual({ base: "release/2026", slug: "the-deploy-runbook" });
  });
});

describe("describeTry", () => {
  it("turns a slug back into words", () => {
    expect(describeTry("the-deploy-runbook")).toBe("the deploy runbook");
  });
});
