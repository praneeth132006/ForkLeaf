import { describe, expect, it } from "vitest";
import {
  assemblePageText,
  normalizeForMatch,
  rectsForRange,
  toSourceRange,
  type RawTextItem,
} from "./text";

/** A pdf.js-shaped run at a position, so the tests read like a page layout. */
function run(
  str: string,
  x: number,
  y: number,
  width: number,
  options: { hasEOL?: boolean; height?: number } = {},
): RawTextItem {
  return {
    str,
    hasEOL: options.hasEOL ?? false,
    transform: [1, 0, 0, 1, x, y],
    width,
    height: options.height ?? 10,
  };
}

describe("assemblePageText", () => {
  it("keeps runs that already touch as one word", () => {
    const page = assemblePageText(1, [run("Fork", 0, 700, 20), run("Leaf", 20, 700, 20)]);
    expect(page.text).toBe("ForkLeaf");
  });

  it("infers a space across a visible gap", () => {
    const page = assemblePageText(1, [run("hello", 0, 700, 30), run("world", 36, 700, 30)]);
    expect(page.text).toBe("hello world");
  });

  it("breaks the line where the run says the line ends", () => {
    const page = assemblePageText(1, [
      run("the end", 0, 700, 40, { hasEOL: true }),
      run("Chapter two", 0, 686, 60),
    ]);
    // The bug this guards: without the break, phrase search for "end chapter"
    // matches and search for "the end" at a line end does not.
    expect(page.text).toBe("the end\nChapter two");
  });

  it("treats a changed baseline as a line break the run forgot to flag", () => {
    const page = assemblePageText(1, [run("first", 0, 700, 30), run("second", 0, 686, 30)]);
    expect(page.text).toBe("first second");
  });

  it("does not double a space the runs already supply", () => {
    const page = assemblePageText(1, [run("hello ", 0, 700, 34), run("world", 40, 700, 30)]);
    expect(page.text).toBe("hello world");
  });

  it("ignores marked-content items that carry no text", () => {
    const page = assemblePageText(1, [run("a", 0, 700, 6), { str: "" }, run("b", 10, 700, 6)]);
    expect(page.text).toBe("a b");
    expect(page.runs).toHaveLength(2);
  });

  it("records a range for every run that lines up with the text", () => {
    const page = assemblePageText(1, [run("hello", 0, 700, 30), run("world", 36, 700, 30)]);
    for (const item of page.runs) {
      expect(page.text.slice(item.start, item.end)).not.toBe("");
    }
    expect(page.text.slice(page.runs[1]!.start, page.runs[1]!.end)).toBe("world");
  });

  it("carries the page number through", () => {
    expect(assemblePageText(7, [run("x", 0, 0, 5)]).page).toBe(7);
  });

  it("handles a page with no text at all", () => {
    const page = assemblePageText(3, []);
    expect(page).toEqual({ page: 3, text: "", runs: [] });
  });
});

describe("normalizeForMatch", () => {
  it("folds ligatures into the letters a reader would type", () => {
    expect(normalizeForMatch("ﬁnd the diﬀerence").text).toBe("find the difference");
  });

  it("folds typographic quotes and dashes", () => {
    expect(normalizeForMatch("“don’t”—really").text).toBe('"don\'t"-really');
  });

  it("rejoins a word hyphenated across a line break", () => {
    expect(normalizeForMatch("regu-\nlar expression").text).toBe("regular expression");
  });

  it("leaves an ordinary hyphenated compound alone", () => {
    expect(normalizeForMatch("well-known result").text).toBe("well-known result");
  });

  it("leaves a hyphen that is not followed by a letter alone", () => {
    expect(normalizeForMatch("page 3 -\n4").text).toBe("page 3 - 4");
  });

  it("collapses the whitespace that column layout leaves behind", () => {
    expect(normalizeForMatch("one   \n\n  two").text).toBe("one two");
  });

  it("drops soft hyphens and zero-width characters", () => {
    expect(normalizeForMatch("in­visible​here").text).toBe("invisiblehere");
  });

  it("folds case", () => {
    expect(normalizeForMatch("MixedCase").text).toBe("mixedcase");
  });

  it("does not emit a leading space for text that starts with whitespace", () => {
    expect(normalizeForMatch("   leading").text).toBe("leading");
  });

  it("does not emit a trailing space for text that ends with whitespace", () => {
    expect(normalizeForMatch("trailing   ").text).toBe("trailing");
  });

  it("maps every normalised character back to where it came from", () => {
    const source = "ﬁne  print";
    const normalized = normalizeForMatch(source);

    expect(normalized.text).toBe("fine print");
    // Both letters of the expanded ligature point at the one source character.
    expect(normalized.map[0]).toBe(0);
    expect(normalized.map[1]).toBe(0);
    expect(normalized.map[2]).toBe(1);
    expect(normalized.map[normalized.text.length]).toBe(source.length);
  });

  it("maps back across a rejoined hyphenation", () => {
    const source = "regu-\nlar";
    const normalized = normalizeForMatch(source);
    const [start, end] = toSourceRange(normalized, 0, normalized.text.length);

    expect(normalized.text).toBe("regular");
    expect(source.slice(start, end)).toBe(source);
  });

  it("is idempotent on text it has already normalised", () => {
    const once = normalizeForMatch("ﬁrst   line-\nbreak").text;
    expect(normalizeForMatch(once).text).toBe(once);
  });
});

describe("toSourceRange", () => {
  it("recovers the exact source substring of a normalised match", () => {
    const source = "The ﬁnal   answer";
    const normalized = normalizeForMatch(source);
    const at = normalized.text.indexOf("final");

    const [start, end] = toSourceRange(normalized, at, at + "final".length);
    expect(source.slice(start, end)).toBe("ﬁnal");
  });

  it("never returns an inverted range", () => {
    const normalized = normalizeForMatch("abc");
    const [start, end] = toSourceRange(normalized, 2, 0);
    expect(end).toBeGreaterThanOrEqual(start);
  });
});

describe("rectsForRange", () => {
  const page = assemblePageText(1, [run("hello", 0, 700, 50), run("world", 60, 700, 50)]);

  it("returns one rectangle per run the range touches", () => {
    expect(rectsForRange(page, 0, page.text.length)).toHaveLength(2);
  });

  it("clips a rectangle to the part of a run actually covered", () => {
    // "he" — the first two of five characters of a 50-point-wide run.
    const [rect] = rectsForRange(page, 0, 2);
    expect(rect!.x).toBeCloseTo(0);
    expect(rect!.width).toBeCloseTo(20);
  });

  it("offsets a rectangle that starts partway into a run", () => {
    const [rect] = rectsForRange(page, 3, 5);
    expect(rect!.x).toBeCloseTo(30);
    expect(rect!.width).toBeCloseTo(20);
  });

  it("returns nothing for a range outside the text", () => {
    expect(rectsForRange(page, 500, 600)).toEqual([]);
  });

  it("returns nothing for an empty range", () => {
    expect(rectsForRange(page, 3, 3)).toEqual([]);
  });
});
