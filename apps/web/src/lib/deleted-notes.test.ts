import { describe, expect, it } from "vitest";
import { daysBefore, deletedSince } from "./deleted-notes";

describe("deletedSince", () => {
  it("lists notes that existed before and do not now", () => {
    expect(deletedSince(["b.md", "a.md", "keep.md", "logo.png"], ["keep.md", "new.md"])).toEqual([
      { path: "a.md", movedTo: null },
      { path: "b.md", movedTo: null },
    ]);
  });

  it("ignores files that are not notes", () => {
    expect(deletedSince(["paper.pdf", "assets/x.png"], [])).toEqual([]);
  });

  it("says where a note seems to have moved", () => {
    expect(deletedSince(["inbox/Plan.md"], ["projects/plan.md"])).toEqual([
      { path: "inbox/Plan.md", movedTo: "projects/plan.md" },
    ]);
  });

  it("does not guess when the same name appeared twice, or already existed", () => {
    expect(deletedSince(["old/plan.md"], ["a/plan.md", "b/plan.md"])[0]!.movedTo).toBeNull();
    expect(deletedSince(["old/plan.md", "x/plan.md"], ["x/plan.md"])[0]!.movedTo).toBeNull();
  });
});

describe("daysBefore", () => {
  it("counts back across a month", () => {
    expect(daysBefore(new Date(2026, 8, 3), 7)).toBe("2026-08-27");
  });
});
