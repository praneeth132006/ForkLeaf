import { describe, expect, it } from "vitest";
import { countMatches, pagesMatching, searchPdf } from "./search";
import type { PdfPageText } from "./types";

function page(number: number, text: string): PdfPageText {
  return { page: number, text, runs: [] };
}

const pages = [
  page(1, "The quick brown fox. A fox is quick."),
  page(2, "Nothing of interest here."),
  page(3, "Another fox, and a foxglove too."),
];

describe("searchPdf", () => {
  it("finds every occurrence, in page order", () => {
    const hits = searchPdf(pages, "fox");
    expect(hits.map((hit) => hit.page)).toEqual([1, 1, 3, 3]);
  });

  it("reports ranges that point at the real characters", () => {
    for (const hit of searchPdf(pages, "fox")) {
      const source = pages.find((candidate) => candidate.page === hit.page)!;
      expect(source.text.slice(...hit.range).toLowerCase()).toContain("fox");
    }
  });

  it("ignores case", () => {
    expect(searchPdf(pages, "FOX")).toHaveLength(4);
  });

  it("matches a phrase that a line break interrupts", () => {
    // The failure this prevents: a viewer that searches the raw extracted
    // string reports "not found" for a phrase printed plainly on the page.
    const wrapped = [page(1, "the quick\nbrown fox")];
    expect(searchPdf(wrapped, "quick brown")).toHaveLength(1);
  });

  it("matches through hyphenation", () => {
    expect(searchPdf([page(1, "measured regu-\nlarly")], "regularly")).toHaveLength(1);
  });

  it("matches through ligatures", () => {
    expect(searchPdf([page(1, "we ﬁnd that")], "find")).toHaveLength(1);
  });

  it("can be held to whole words", () => {
    expect(searchPdf(pages, "fox", { wholeWord: true }).map((hit) => hit.page)).toEqual([1, 1, 3]);
  });

  it("builds a snippet with the match marked inside it", () => {
    const [hit] = searchPdf([page(1, "the quick brown fox jumps")], "brown");
    expect(hit!.snippet.slice(...hit!.snippetRange)).toBe("brown");
  });

  it("flattens the layout newlines out of a snippet", () => {
    const [hit] = searchPdf([page(1, "line one\nline two\nline three")], "two");
    expect(hit!.snippet).not.toContain("\n");
  });

  it("marks a snippet that was cut from a longer page", () => {
    const [hit] = searchPdf([page(1, `${"a ".repeat(100)}needle${" b".repeat(100)}`)], "needle");
    expect(hit!.snippet.startsWith("…")).toBe(true);
    expect(hit!.snippet.endsWith("…")).toBe(true);
  });

  it("does not pretend a short page is an excerpt", () => {
    const [hit] = searchPdf([page(1, "needle")], "needle");
    expect(hit!.snippet).toBe("needle");
  });

  it("returns nothing for an empty query", () => {
    expect(searchPdf(pages, "   ")).toEqual([]);
  });

  it("returns nothing when the phrase is absent", () => {
    expect(searchPdf(pages, "elephant")).toEqual([]);
  });

  it("stops at the limit rather than building thousands of snippets", () => {
    const busy = [page(1, "a ".repeat(500))];
    expect(searchPdf(busy, "a", { limit: 10 })).toHaveLength(10);
  });

  it("finds overlapping occurrences", () => {
    expect(searchPdf([page(1, "aaaa")], "aa")).toHaveLength(3);
  });
});

describe("countMatches", () => {
  it("counts without the cost of snippets", () => {
    expect(countMatches(pages, "fox")).toBe(4);
  });

  it("is zero for an empty query", () => {
    expect(countMatches(pages, "")).toBe(0);
  });
});

describe("pagesMatching", () => {
  it("lists only the pages that contain the phrase", () => {
    expect(pagesMatching(pages, "fox")).toEqual([1, 3]);
  });

  it("is empty for an empty query", () => {
    expect(pagesMatching(pages, "")).toEqual([]);
  });
});
