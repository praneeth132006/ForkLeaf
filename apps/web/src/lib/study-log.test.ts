import { describe, expect, it } from "vitest";
import { formatLog, heatmap, logReviews, parseLog, streak, thisWeek } from "./study-log";

describe("the study log", () => {
  it("adds to today's row and round-trips", () => {
    let text = logReviews(null, "2026-09-28");
    text = logReviews(text, "2026-09-28", 4);
    text = logReviews(text, "2026-09-26", 2);
    expect(text).toContain("| 2026-09-26 | 2 |\n| 2026-09-28 | 5 |");
    expect(parseLog(formatLog(parseLog(text)))).toEqual(parseLog(text));
  });

  it("counts a streak ending today, or yesterday before today's session", () => {
    const log = parseLog(logReviews(logReviews(null, "2026-09-26"), "2026-09-27"));
    expect(streak(log, "2026-09-27")).toBe(2);
    expect(streak(log, "2026-09-28")).toBe(2);
    expect(streak(log, "2026-09-29")).toBe(0);
  });

  it("totals the last seven days", () => {
    const log = new Map([
      ["2026-09-20", 9],
      ["2026-09-22", 3],
      ["2026-09-28", 4],
    ]);
    expect(thisWeek(log, "2026-09-28")).toBe(7);
  });

  it("lays out whole weeks, Monday first, ending in the week of today", () => {
    // 2026-09-28 is a Monday.
    const grid = heatmap(
      new Map([
        ["2026-09-28", 8],
        ["2026-09-21", 2],
      ]),
      "2026-09-28",
      2,
    );
    expect(grid).toHaveLength(2);
    expect(grid[0]![0]!.day).toBe("2026-09-21");
    expect(grid[1]![0]).toMatchObject({ day: "2026-09-28", count: 8, level: 4, future: false });
    expect(grid[0]![0]!.level).toBe(1);
    expect(grid[1]![1]!.future).toBe(true);
  });
});
