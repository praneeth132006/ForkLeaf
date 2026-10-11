import { describe, expect, it } from "vitest";
import { notePlacement } from "./tree";

describe("notePlacement", () => {
  it("puts a plain title in the chosen folder", () => {
    expect(notePlacement("work", "Plan")).toEqual({ folder: "work", title: "Plan" });
    expect(notePlacement("", "Plan")).toEqual({ folder: "", title: "Plan" });
  });

  it("turns slashes in the title into folders under the chosen one", () => {
    expect(notePlacement("work", "ideas/Q3/plan")).toEqual({
      folder: "work/ideas/Q3",
      title: "plan",
    });
    expect(notePlacement("", "ideas/plan")).toEqual({ folder: "ideas", title: "plan" });
  });

  it("drops empty segments instead of making nameless folders", () => {
    expect(notePlacement("work", "/ideas//plan/")).toEqual({ folder: "work/ideas", title: "plan" });
    expect(notePlacement("work", "  ")).toEqual({ folder: "work", title: "" });
  });
});
