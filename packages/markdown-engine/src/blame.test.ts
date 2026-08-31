import { describe, it, expect } from "vitest";
import {
  buildBlame,
  priorWording,
  replacedWithin,
  toBlocks,
  ageRatio,
  type BlameRevision,
} from "./blame";

const at = (day: number) => `2026-03-${String(day).padStart(2, "0")}T10:00:00.000Z`;

function rev(sha: string, day: number, text: string | null): BlameRevision {
  return { sha, date: at(day), text };
}

/** Shorthand: the SHA blamed for each line, in order. */
const shas = (input: readonly BlameRevision[]) => buildBlame(input).lines.map((line) => line.sha);

describe("buildBlame", () => {
  it("returns an empty result for nothing at all", () => {
    const blame = buildBlame([]);
    expect(blame.empty).toBe(true);
    expect(blame.lines).toEqual([]);
    expect(blame.blocks).toEqual([]);
  });

  it("returns an empty result when no revision could be read", () => {
    expect(buildBlame([rev("a", 1, null), rev("b", 2, null)]).empty).toBe(true);
  });

  it("attributes a single revision to itself, flagged as possibly older", () => {
    const blame = buildBlame([rev("a", 1, "one\ntwo")]);
    expect(blame.lines.map((line) => [line.number, line.text, line.sha])).toEqual([
      [1, "one", "a"],
      [2, "two", "a"],
    ]);
    // We cannot see before the oldest revision we were given, so we do not
    // claim this is where the lines were written.
    expect(blame.lines.every((line) => line.atOrBefore)).toBe(true);
  });

  it("credits a new line to the revision that introduced it", () => {
    const blame = buildBlame([rev("a", 1, "one"), rev("b", 2, "one\ntwo")]);
    expect(shas([rev("a", 1, "one"), rev("b", 2, "one\ntwo")])).toEqual(["a", "b"]);
    expect(blame.lines[1]!.atOrBefore).toBe(false);
  });

  it("leaves an untouched line with its original commit across many revisions", () => {
    const revisions = [
      rev("a", 1, "the original line"),
      rev("b", 2, "the original line\nsecond"),
      rev("c", 3, "the original line\nsecond\nthird"),
      rev("d", 4, "the original line\nsecond edited\nthird"),
    ];
    expect(shas(revisions)).toEqual(["a", "d", "c"]);
  });

  it("blames the rewrite, not the original, when a line is edited", () => {
    const revisions = [rev("a", 1, "before"), rev("b", 2, "after")];
    expect(shas(revisions)).toEqual(["b"]);
  });

  it("forgets a line that was deleted, without shifting its neighbours", () => {
    const revisions = [
      rev("a", 1, "keep one\ndrop me\nkeep two"),
      rev("b", 2, "keep one\nkeep two"),
    ];
    const blame = buildBlame(revisions);
    expect(blame.lines.map((line) => line.text)).toEqual(["keep one", "keep two"]);
    expect(blame.lines.map((line) => line.sha)).toEqual(["a", "a"]);
  });

  it("keeps attribution correct when a line is inserted in the middle", () => {
    const revisions = [rev("a", 1, "first\nlast"), rev("b", 2, "first\nmiddle\nlast")];
    expect(shas(revisions)).toEqual(["a", "b", "a"]);
  });

  it("re-blames a line that was deleted and later written again", () => {
    const revisions = [rev("a", 1, "one\ntwo"), rev("b", 2, "one"), rev("c", 3, "one\ntwo")];
    // The text is identical to revision a, but this "two" is not that "two".
    expect(shas(revisions)).toEqual(["a", "c"]);
  });

  it("sorts revisions oldest first whatever order they arrive in", () => {
    const newestFirst = [
      rev("c", 3, "one\ntwo\nthree"),
      rev("b", 2, "one\ntwo"),
      rev("a", 1, "one"),
    ];
    expect(shas(newestFirst)).toEqual(["a", "b", "c"]);
  });

  it("keeps input order for revisions sharing a timestamp", () => {
    const revisions: BlameRevision[] = [
      { sha: "first", date: at(1), text: "one" },
      { sha: "second", date: at(1), text: "one\ntwo" },
    ];
    expect(shas(revisions)).toEqual(["first", "second"]);
  });

  it("skips an unreadable revision instead of treating it as an empty file", () => {
    const revisions = [rev("a", 1, "one\ntwo"), rev("b", 2, null), rev("c", 3, "one\ntwo\nthree")];
    // Had the gap been read as empty, every line would be blamed on c.
    expect(shas(revisions)).toEqual(["a", "a", "c"]);
  });

  it("attributes everything to the newest revision when only it is readable", () => {
    const revisions = [rev("a", 1, null), rev("b", 2, "only this")];
    const blame = buildBlame(revisions);
    expect(blame.lines.map((line) => line.sha)).toEqual(["b"]);
    expect(blame.lines[0]!.atOrBefore).toBe(true);
  });

  it("handles a note emptied and then rewritten", () => {
    const revisions = [rev("a", 1, "old text"), rev("b", 2, ""), rev("c", 3, "new text")];
    expect(shas(revisions)).toEqual(["c"]);
  });

  it("reports an empty newest revision as nothing to attribute", () => {
    const blame = buildBlame([rev("a", 1, "something"), rev("b", 2, "")]);
    expect(blame.lines).toEqual([]);
    expect(blame.empty).toBe(true);
  });

  it("normalises CRLF so a line ending change is not a rewrite", () => {
    const revisions = [rev("a", 1, "one\ntwo"), rev("b", 2, "one\r\ntwo")];
    expect(shas(revisions)).toEqual(["a", "a"]);
  });

  it("carries the commit's own details onto the lines it wrote", () => {
    const revisions: BlameRevision[] = [
      { sha: "a", date: at(1), text: "one", message: "Start", authorName: "Ada" },
      {
        sha: "b",
        date: at(2),
        text: "one\ntwo",
        message: "Add the second",
        authorName: "Grace",
        authorLogin: "grace",
      },
    ];
    const blame = buildBlame(revisions);
    expect(blame.lines[1]).toMatchObject({
      message: "Add the second",
      authorName: "Grace",
      authorLogin: "grace",
      date: at(2),
    });
  });

  it("tallies distinct commits newest first", () => {
    const revisions = [
      rev("a", 1, "one\ntwo"),
      rev("b", 2, "one\ntwo\nthree"),
      rev("c", 3, "one\ntwo\nthree\nfour"),
    ];
    expect(buildBlame(revisions).commits).toEqual([
      { sha: "c", date: at(3), lineCount: 1 },
      { sha: "b", date: at(2), lineCount: 1 },
      { sha: "a", date: at(1), lineCount: 2 },
    ]);
  });

  it("stays quick over a long history", () => {
    const revisions: BlameRevision[] = Array.from({ length: 120 }, (_, index) => ({
      sha: `sha${index}`,
      date: new Date(Date.UTC(2026, 0, 1) + index * 3600_000).toISOString(),
      text: Array.from({ length: index + 1 }, (_, line) => `line ${line}`).join("\n"),
    }));

    const started = Date.now();
    const blame = buildBlame(revisions);
    expect(blame.lines).toHaveLength(120);
    // Each revision appended exactly one line, so each owns exactly one.
    expect(blame.lines[119]!.sha).toBe("sha119");
    expect(blame.lines[0]!.sha).toBe("sha0");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("toBlocks", () => {
  const lines = (spec: [string, string, number][]) =>
    spec.map(([text, sha, day], index) => ({
      number: index + 1,
      text,
      sha,
      date: at(day),
      atOrBefore: false,
    }));

  it("returns nothing for no lines", () => {
    expect(toBlocks([])).toEqual([]);
  });

  it("groups consecutive lines and breaks on blank ones", () => {
    const blocks = toBlocks(
      lines([
        ["# Heading", "a", 1],
        ["", "a", 1],
        ["First paragraph", "a", 1],
        ["wrapped onto two lines", "b", 2],
        ["", "b", 2],
        ["Second paragraph", "c", 3],
      ]),
    );

    expect(blocks.map((block) => block.text)).toEqual([
      "# Heading",
      "First paragraph\nwrapped onto two lines",
      "Second paragraph",
    ]);
    expect(blocks.map((block) => [block.start, block.end])).toEqual([
      [1, 1],
      [3, 4],
      [6, 6],
    ]);
  });

  it("gives no block to a blank line", () => {
    // A gap between paragraphs carries no writing, so attributing it would
    // paint a stripe between every two paragraphs for a change nobody made.
    expect(toBlocks(lines([["", "a", 1]]))).toEqual([]);
  });

  it("treats a whitespace-only line as a boundary", () => {
    const blocks = toBlocks(
      lines([
        ["one", "a", 1],
        ["   ", "a", 1],
        ["two", "a", 1],
      ]),
    );
    expect(blocks).toHaveLength(2);
  });

  it("reports when a block last changed and when it first appeared", () => {
    const [block] = toBlocks(
      lines([
        ["written first", "a", 1],
        ["edited last", "c", 9],
        ["in between", "b", 4],
      ]),
    );

    expect(block!.newest.sha).toBe("c");
    expect(block!.oldest.sha).toBe("a");
    expect(block!.commitCount).toBe(3);
  });

  it("counts a single-commit block as one", () => {
    const [block] = toBlocks(
      lines([
        ["one", "a", 1],
        ["two", "a", 1],
      ]),
    );
    expect(block!.commitCount).toBe(1);
    expect(block!.newest.sha).toBe("a");
    expect(block!.oldest.sha).toBe("a");
  });

  it("closes the last block at the end of the document", () => {
    const blocks = toBlocks(lines([["trailing", "a", 1]]));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.end).toBe(1);
  });
});

describe("ageRatio", () => {
  const OLD = at(1);
  const NEW = at(11);

  it("puts the oldest at 0 and the newest at 1", () => {
    expect(ageRatio(OLD, OLD, NEW)).toBe(0);
    expect(ageRatio(NEW, OLD, NEW)).toBe(1);
  });

  it("places the middle in the middle", () => {
    expect(ageRatio(at(6), OLD, NEW)).toBeCloseTo(0.5, 5);
  });

  it("reads a document written all at once as new, not ancient", () => {
    expect(ageRatio(OLD, OLD, OLD)).toBe(1);
  });

  it("clamps anything outside the range", () => {
    expect(ageRatio(at(1), at(5), NEW)).toBe(0);
    expect(ageRatio(at(20), OLD, NEW)).toBe(1);
  });

  it("does not produce NaN for an unparseable date", () => {
    expect(Number.isFinite(ageRatio("nonsense", OLD, NEW))).toBe(true);
  });
});

/**
 * The question after "when did I write this?", and the more interesting one:
 * what did it say before? A paragraph rewritten in March is one you changed
 * your mind about, and what you changed it *from* is usually the point.
 */
describe("priorWording", () => {
  const revisions = (texts: [sha: string, date: string, text: string | null][]): BlameRevision[] =>
    texts.map(([sha, date, text]) => ({ sha, date, text }));

  it("shows what a rewritten paragraph used to say", () => {
    const before = "# Title\n\nThe answer is obviously yes.\n";
    const after = "# Title\n\nThe answer is obviously no.\n";

    const input = revisions([
      ["a", "2026-01-01T00:00:00Z", before],
      ["b", "2026-03-01T00:00:00Z", after],
    ]);
    const blame = buildBlame(input);
    const block = blame.blocks.find((candidate) => candidate.text.includes("obviously no"))!;

    const prior = priorWording(input, after, block);

    expect(prior?.text).toBe("The answer is obviously yes.");
    expect(prior?.sha).toBe("a");
  });

  it("says nothing for a paragraph that was added rather than rewritten", () => {
    const before = "# Title\n\nOne.\n";
    const after = "# Title\n\nOne.\n\nTwo, which is new.\n";

    const input = revisions([
      ["a", "2026-01-01T00:00:00Z", before],
      ["b", "2026-03-01T00:00:00Z", after],
    ]);
    const blame = buildBlame(input);
    const block = blame.blocks.find((candidate) => candidate.text.includes("Two"))!;

    // "You wrote this in March" and "in March you replaced something with
    // this" are different facts, and inventing the second would be a lie.
    expect(priorWording(input, after, block)).toBeNull();
  });

  it("says nothing when the change is older than the history we can see", () => {
    const text = "# Title\n\nAs it has always been.\n";
    const input = revisions([["a", "2026-01-01T00:00:00Z", text]]);
    const blame = buildBlame(input);

    expect(priorWording(input, text, blame.blocks[0]!)).toBeNull();
  });

  it("skips a revision that could not be read rather than diffing against nothing", () => {
    const first = "# Title\n\nOriginal wording.\n";
    const second = "# Title\n\nReplaced wording.\n";

    const input = revisions([
      ["a", "2026-01-01T00:00:00Z", first],
      ["b", "2026-02-01T00:00:00Z", null],
      ["c", "2026-03-01T00:00:00Z", second],
    ]);
    const blame = buildBlame(input);
    const block = blame.blocks.find((candidate) => candidate.text.includes("Replaced"))!;

    expect(priorWording(input, second, block)?.text).toBe("Original wording.");
  });
});

describe("replacedWithin", () => {
  it("takes only the lines this paragraph replaced, not the note's others", () => {
    const before = ["First para, old.", "", "Second para, old."].join("\n");
    const after = ["First para, new.", "", "Second para, new."].join("\n");

    expect(replacedWithin(before, after, { start: 1, end: 1 })).toBe("First para, old.");
    expect(replacedWithin(before, after, { start: 3, end: 3 })).toBe("Second para, old.");
  });

  it("joins the lines of a paragraph that was several", () => {
    const before = "One.\nTwo.\nThree.";
    const after = "Rewritten.";

    expect(replacedWithin(before, after, { start: 1, end: 1 })).toBe("One.\nTwo.\nThree.");
  });

  it("returns nothing when the two revisions are the same", () => {
    const text = "Unchanged.";
    expect(replacedWithin(text, text, { start: 1, end: 1 })).toBeNull();
  });
});
