import { describe, expect, it } from "vitest";
import { diffLines, diffStats, diffWords, toHunks } from "./diff";

const kinds = (a: string, b: string) => diffLines(a, b).map((l) => `${l.kind[0]}:${l.text}`);

describe("diffLines", () => {
  it("reports nothing for identical text", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines.every((l) => l.kind === "context")).toBe(true);
    expect(diffStats(lines)).toEqual({ added: 0, removed: 0, identical: true });
  });

  it("finds an inserted line without rewriting its neighbours", () => {
    expect(kinds("a\nc", "a\nb\nc")).toEqual(["c:a", "a:b", "c:c"]);
  });

  it("finds a deleted line", () => {
    expect(kinds("a\nb\nc", "a\nc")).toEqual(["c:a", "d:b", "c:c"]);
  });

  it("represents a modified line as a delete plus an add", () => {
    const lines = diffLines("title: old", "title: new");
    expect(diffStats(lines)).toMatchObject({ added: 1, removed: 1, identical: false });
  });

  it("numbers lines against the correct side", () => {
    const lines = diffLines("a\nc", "a\nb\nc");
    expect(lines.map((l) => [l.oldNumber, l.newNumber])).toEqual([
      [1, 1],
      [null, 2],
      [2, 3],
    ]);
  });

  it("handles an empty side", () => {
    expect(diffStats(diffLines("", "a\nb"))).toMatchObject({ added: 2, removed: 0 });
    expect(diffStats(diffLines("a\nb", ""))).toMatchObject({ added: 0, removed: 2 });
  });

  it("treats CRLF as the same text as LF", () => {
    expect(diffStats(diffLines("a\r\nb", "a\nb")).identical).toBe(true);
  });

  it("does not invent a trailing empty line", () => {
    expect(diffLines("a\n", "a").length).toBe(1);
  });

  it("keeps the change small for a one-line edit in a long note", () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    const edited = long.replace("line 250", "line 250 edited");
    expect(diffStats(diffLines(long, edited))).toMatchObject({ added: 1, removed: 1 });
  });
});

describe("toHunks", () => {
  it("collapses long unchanged runs", () => {
    const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const edited = long.replace("line 100", "changed");
    const hunks = toHunks(diffLines(long, edited));

    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines.length).toBeLessThan(12);
  });

  it("separates changes that are far apart", () => {
    const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    const edited = long.replace("line 10", "x").replace("line 150", "y");
    expect(toHunks(diffLines(long, edited))).toHaveLength(2);
  });

  it("returns no hunks when nothing changed", () => {
    expect(toHunks(diffLines("a\nb", "a\nb"))).toEqual([]);
  });
});

describe("diffWords", () => {
  it("marks only the words that differ", () => {
    const [before, after] = diffWords("the quick brown fox", "the slow brown fox");
    expect(before.filter((s) => s.changed).map((s) => s.text)).toEqual(["quick"]);
    expect(after.filter((s) => s.changed).map((s) => s.text)).toEqual(["slow"]);
  });

  it("marks nothing when the lines match", () => {
    const [before, after] = diffWords("same line", "same line");
    expect(before.some((s) => s.changed)).toBe(false);
    expect(after.some((s) => s.changed)).toBe(false);
  });

  it("reassembles the original text exactly", () => {
    const [before, after] = diffWords("alpha beta gamma", "alpha delta gamma epsilon");
    expect(before.map((s) => s.text).join("")).toBe("alpha beta gamma");
    expect(after.map((s) => s.text).join("")).toBe("alpha delta gamma epsilon");
  });
});
