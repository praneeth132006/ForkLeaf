import { describe, it, expect } from "vitest";
import { buildTimeline, sparkline, type RevisionInput } from "./timeline";

const at = (day: number) => `2026-03-${String(day).padStart(2, "0")}T10:00:00.000Z`;

function rev(sha: string, day: number, text: string | null): RevisionInput {
  return { sha, date: at(day), text };
}

describe("buildTimeline", () => {
  it("returns an empty, still-usable timeline for no revisions", () => {
    const timeline = buildTimeline([]);
    expect(timeline.revisions).toEqual([]);
    // Scales are floored at 1 so a caller dividing by them cannot produce NaN.
    expect(timeline.maxWords).toBe(1);
    expect(timeline.maxChurn).toBe(1);
    expect(timeline.spanMs).toBe(0);
    expect(timeline.netWords).toBe(0);
  });

  it("measures a single revision as an opening addition", () => {
    const timeline = buildTimeline([rev("a", 1, "one two three\nfour")]);
    expect(timeline.revisions).toHaveLength(1);
    const [only] = timeline.revisions;
    expect(only!.words).toBe(4);
    expect(only!.lines).toBe(2);
    expect(only!.added).toBe(2);
    expect(only!.removed).toBe(0);
    expect(only!.wordDelta).toBe(4);
    expect(only!.index).toBe(0);
    expect(timeline.spanMs).toBe(0);
  });

  it("orders revisions oldest first regardless of input order", () => {
    const timeline = buildTimeline([
      rev("newest", 3, "a b c"),
      rev("oldest", 1, "a"),
      rev("middle", 2, "a b"),
    ]);

    expect(timeline.revisions.map((r) => r.sha)).toEqual(["oldest", "middle", "newest"]);
    expect(timeline.revisions.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(timeline.netWords).toBe(2);
    expect(timeline.spanMs).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it("keeps input order for revisions sharing a timestamp", () => {
    const timeline = buildTimeline([
      { sha: "first", date: at(1), text: "a" },
      { sha: "second", date: at(1), text: "a b" },
    ]);
    expect(timeline.revisions.map((r) => r.sha)).toEqual(["first", "second"]);
  });

  it("counts lines added and removed against the previous revision", () => {
    const timeline = buildTimeline([
      rev("a", 1, "alpha\nbeta\ngamma"),
      rev("b", 2, "alpha\nBETA CHANGED\ngamma\ndelta"),
    ]);

    const [, second] = timeline.revisions;
    expect(second!.added).toBe(2); // the rewritten line plus the new one
    expect(second!.removed).toBe(1);
    expect(second!.wordDelta).toBe(2); // "BETA CHANGED" and "delta" less "beta"
  });

  it("reports zero churn for a commit that did not touch this note", () => {
    const timeline = buildTimeline([rev("a", 1, "same text"), rev("b", 2, "same text")]);
    const [, second] = timeline.revisions;
    expect(second!.added).toBe(0);
    expect(second!.removed).toBe(0);
    expect(second!.wordDelta).toBe(0);
  });

  it("tracks a note being gutted", () => {
    const timeline = buildTimeline([rev("a", 1, "one two three four five"), rev("b", 2, "one")]);
    const [, second] = timeline.revisions;
    expect(second!.wordDelta).toBe(-4);
    expect(timeline.netWords).toBe(-4);
  });

  it("handles an empty revision without dividing by zero", () => {
    const timeline = buildTimeline([rev("a", 1, ""), rev("b", 2, "words here")]);
    const [first, second] = timeline.revisions;
    expect(first!.words).toBe(0);
    expect(first!.lines).toBe(0);
    expect(first!.added).toBe(0);
    expect(second!.added).toBe(1);
    expect(timeline.maxWords).toBe(2);
  });

  it("counts a trailing newline as ending a line, not starting one", () => {
    const timeline = buildTimeline([rev("a", 1, "one\ntwo\n")]);
    expect(timeline.revisions[0]!.lines).toBe(2);
  });

  it("normalises CRLF so a line ending change is not counted as content", () => {
    const timeline = buildTimeline([rev("a", 1, "one\r\ntwo")]);
    expect(timeline.revisions[0]!.lines).toBe(2);
  });

  it("ignores highlight markup when counting words", () => {
    const timeline = buildTimeline([rev("a", 1, '<mark class="fl-hl-blue">two words</mark>')]);
    expect(timeline.revisions[0]!.words).toBe(2);
  });

  it("carries measurements across a revision that could not be read", () => {
    const timeline = buildTimeline([
      rev("a", 1, "one two three"),
      rev("b", 2, null),
      rev("c", 3, "one two three four"),
    ]);

    const [first, gap, third] = timeline.revisions;
    expect(gap!.missing).toBe(true);
    // The curve holds level across the gap rather than dropping to zero.
    expect(gap!.words).toBe(first!.words);
    expect(gap!.added).toBe(0);
    expect(gap!.removed).toBe(0);

    // And the revision after the gap is compared with the last one we could
    // actually read, so the gap costs the diff nothing.
    expect(third!.missing).toBe(false);
    expect(third!.added).toBe(1);
    expect(third!.removed).toBe(1);
    expect(third!.wordDelta).toBe(1);
    expect(timeline.missingCount).toBe(1);
  });

  it("survives a leading run of unreadable revisions", () => {
    const timeline = buildTimeline([rev("a", 1, null), rev("b", 2, null), rev("c", 3, "hello")]);
    expect(timeline.revisions.map((r) => r.words)).toEqual([0, 0, 1]);
    expect(timeline.missingCount).toBe(2);
    // The first readable revision is still an opening addition.
    expect(timeline.revisions[2]!.added).toBe(1);
  });

  it("does not throw away a timeline over one unparseable date", () => {
    const timeline = buildTimeline([
      { sha: "bad", date: "not a date", text: "a" },
      { sha: "good", date: at(2), text: "a b" },
    ]);
    expect(timeline.revisions.map((r) => r.sha)).toEqual(["bad", "good"]);
    expect(Number.isFinite(timeline.spanMs)).toBe(true);
  });

  it("passes commit metadata through untouched", () => {
    const timeline = buildTimeline([
      { sha: "a", date: at(1), text: "x", message: "Start the note", authorName: "Ada" },
    ]);
    expect(timeline.revisions[0]!.message).toBe("Start the note");
    expect(timeline.revisions[0]!.authorName).toBe("Ada");
  });

  it("reports the tallest word count and the busiest single step", () => {
    const timeline = buildTimeline([
      rev("a", 1, "one"),
      rev("b", 2, "one\ntwo\nthree\nfour"),
      rev("c", 3, "one"),
    ]);
    expect(timeline.maxWords).toBe(4);
    expect(timeline.maxChurn).toBe(3 + 0); // three lines appended in one step
  });

  it("stays linear enough for a long history", () => {
    const many: RevisionInput[] = Array.from({ length: 200 }, (_, index) => ({
      sha: `sha${index}`,
      date: new Date(Date.UTC(2026, 0, 1) + index * 3600_000).toISOString(),
      text: Array.from({ length: index + 1 }, (_, line) => `line ${line}`).join("\n"),
    }));

    const started = Date.now();
    const timeline = buildTimeline(many);
    expect(timeline.revisions).toHaveLength(200);
    expect(timeline.revisions[199]!.added).toBe(1);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("sparkline", () => {
  it("returns nothing drawable for no values", () => {
    expect(sparkline([], 100, 20)).toEqual({ line: "", area: "", points: [] });
  });

  it("returns nothing drawable for a zero-sized box", () => {
    expect(sparkline([1, 2], 0, 20).points).toEqual([]);
    expect(sparkline([1, 2], 100, 0).points).toEqual([]);
  });

  it("centres a lone value instead of pinning it to the left edge", () => {
    const { points } = sparkline([5], 100, 20);
    expect(points).toEqual([{ x: 50, y: 0 }]);
  });

  it("spreads values evenly across the width", () => {
    const { points } = sparkline([0, 5, 10], 100, 20);
    expect(points.map((p) => p.x)).toEqual([0, 50, 100]);
  });

  it("puts the largest value at the top and zero on the baseline", () => {
    const { points } = sparkline([0, 10], 100, 20);
    expect(points[0]!.y).toBe(20);
    expect(points[1]!.y).toBe(0);
  });

  it("scales against a supplied ceiling so several charts can share an axis", () => {
    const { points } = sparkline([5], 100, 20, 10);
    expect(points[0]!.y).toBe(10);
  });

  it("clamps a value above the ceiling rather than drawing outside the box", () => {
    const { points } = sparkline([50], 100, 20, 10);
    expect(points[0]!.y).toBe(0);
  });

  it("treats an all-zero series as a flat baseline rather than dividing by zero", () => {
    const { points } = sparkline([0, 0, 0], 100, 20);
    expect(points.every((point) => point.y === 20)).toBe(true);
  });

  it("closes the area path back to the baseline", () => {
    const { line, area } = sparkline([0, 10], 100, 20);
    expect(line).toBe("M0 20 L100 0");
    expect(area).toBe("M0 20 L100 0 L100 20 L0 20 Z");
  });
});
