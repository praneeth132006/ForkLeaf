import { describe, expect, it } from "vitest";
import { formatWeeklyReview, staleEntries, summariseWeek } from "./weekly-review";

describe("stale notes in the weekly review", () => {
  it("says what each flagged note needs, and leaves out notes that are only worth a glance", () => {
    expect(
      staleEntries([
        {
          path: "a.md",
          title: "A",
          verdict: "fresh",
          reasons: [],
          missingFiles: ["x.png", "y.pdf"],
          missingLinks: ["Gone"],
        },
        {
          path: "b.md",
          title: "B",
          verdict: "likely-stale",
          reasons: ["Says the launch is next year, and it was written in 2024."],
          missingFiles: [],
          missingLinks: [],
        },
        {
          path: "c.md",
          title: "C",
          verdict: "worth-checking",
          reasons: ["Not edited in a while."],
          missingFiles: [],
          missingLinks: [],
        },
      ]),
    ).toEqual([
      {
        path: "a.md",
        title: "A",
        reason: "points at 2 missing files; 1 link to a note that does not exist",
      },
      {
        path: "b.md",
        title: "B",
        reason: "Says the launch is next year, and it was written in 2024",
      },
    ]);
  });

  it("adds a Worth a look section only when there is something to look at", () => {
    const now = new Date(2026, 8, 13, 12);
    expect(formatWeeklyReview(summariseWeek([], now))).not.toContain("## Worth a look");

    const review = formatWeeklyReview(
      summariseWeek(
        [],
        now,
        [],
        [{ path: "notes/a.md", title: "A", reason: "points at 1 missing file" }],
      ),
    );
    expect(review).toContain("## Worth a look\n\n- [[notes/a|A]] — points at 1 missing file");
    expect(review.indexOf("## Worth a look")).toBeLessThan(review.indexOf("## Looking back"));
  });
});
