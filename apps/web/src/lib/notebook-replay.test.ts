import { describe, expect, it } from "vitest";
import type { TreeNode } from "@forkleaf/types";
import {
  REPLAY_SPANS,
  diffFrames,
  dotSize,
  notesInTree,
  replayDates,
  replayOrder,
  type ReplayFrame,
} from "./notebook-replay";

const frame = (date: string, notes: [string, number][]): ReplayFrame => ({
  date,
  sha: "abc",
  notes: notes.map(([path, size]) => ({ path, size })),
});

describe("replayDates", () => {
  it("steps back from today, oldest first, ending today", () => {
    const span = REPLAY_SPANS.find((each) => each.id === "quarter")!;
    const dates = replayDates("2026-10-06", span);

    expect(dates).toHaveLength(span.steps);
    expect(dates.at(-1)).toBe("2026-10-06");
    expect(dates.at(-2)).toBe("2026-09-29");
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("notesInTree", () => {
  it("keeps markdown outside hidden folders, with sizes", () => {
    const tree: TreeNode[] = [
      { path: "b.md", name: "b.md", kind: "file", size: 20 },
      {
        path: "docs",
        name: "docs",
        kind: "folder",
        children: [
          { path: "docs/a.md", name: "a.md", kind: "file", size: 10 },
          { path: "docs/pic.png", name: "pic.png", kind: "file", size: 999 },
        ],
      },
      {
        path: ".github",
        name: ".github",
        kind: "folder",
        children: [{ path: ".github/x.md", name: "x.md", kind: "file", size: 5 }],
      },
      { path: "unsized.md", name: "unsized.md", kind: "file" },
    ];

    expect(notesInTree(tree)).toEqual([
      { path: "b.md", size: 20 },
      { path: "docs/a.md", size: 10 },
      { path: "unsized.md", size: 0 },
    ]);
  });
});

describe("diffFrames", () => {
  it("says what appeared, grew, shrank and went", () => {
    const before = frame("2026-01-01", [
      ["a.md", 10],
      ["b.md", 10],
      ["c.md", 10],
      ["gone.md", 3],
    ]);
    const after = frame("2026-02-01", [
      ["a.md", 10],
      ["b.md", 50],
      ["c.md", 2],
      ["new.md", 7],
    ]);

    const diff = diffFrames(before, after);

    expect(Object.fromEntries(diff.notes.map((note) => [note.path, note.change]))).toEqual({
      "a.md": "same",
      "b.md": "grew",
      "c.md": "shrank",
      "new.md": "new",
    });
    expect(diff.removed).toEqual(["gone.md"]);
    expect(diff.totalBytes).toBe(69);
  });

  it("does not call the whole first frame new", () => {
    const diff = diffFrames(null, frame("2026-01-01", [["a.md", 10]]));
    expect(diff.notes[0]!.change).toBe("same");
  });
});

describe("replayOrder", () => {
  it("orders by first appearance, so notes keep their place", () => {
    const frames = [
      frame("1", [["m.md", 1]]),
      frame("2", [
        ["a.md", 1],
        ["m.md", 1],
      ]),
      frame("3", [
        ["a.md", 1],
        ["z.md", 1],
      ]),
    ];

    expect(replayOrder(frames)).toEqual(["m.md", "a.md", "z.md"]);
  });
});

describe("dotSize", () => {
  it("grows with size, within bounds", () => {
    expect(dotSize(0)).toBe(6);
    expect(dotSize(2000)).toBeGreaterThan(dotSize(500));
    expect(dotSize(10_000_000)).toBe(34);
  });
});
