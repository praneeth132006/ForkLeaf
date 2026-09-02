import { describe, expect, it } from "vitest";
import { anchorsFor, lineForPage, pageForLine, type Anchor } from "./pdf-follow";
import type { PdfMention } from "./pdf-mentions";

const mention = (over: Partial<PdfMention>): PdfMention => ({
  notePath: "reading.md",
  pdfPath: "papers/x.pdf",
  citation: null,
  line: 1,
  label: "x",
  page: 1,
  quote: null,
  context: "",
  ...over,
});

const anchors: Anchor[] = [
  { line: 5, page: 2 },
  { line: 20, page: 7 },
  { line: 40, page: 12 },
];

describe("anchorsFor", () => {
  it("takes this note's citations, in the order they are written", () => {
    const found = anchorsFor(
      [
        mention({ line: 20, page: 7 }),
        mention({ line: 5, page: 2 }),
        mention({ notePath: "elsewhere.md", line: 1, page: 99 }),
      ],
      "reading.md",
    );

    expect(found).toEqual([
      { line: 5, page: 2 },
      { line: 20, page: 7 },
    ]);
  });

  it("ignores a link that names no page, since it points at no part of it", () => {
    expect(anchorsFor([mention({ page: null })], "reading.md")).toEqual([]);
  });
});

describe("pageForLine", () => {
  it("follows the nearest citation above the caret", () => {
    expect(pageForLine(anchors, 25)).toBe(7);
    expect(pageForLine(anchors, 40)).toBe(12);
    expect(pageForLine(anchors, 1000)).toBe(12);
  });

  it("takes the citation the caret is on, not the one before it", () => {
    expect(pageForLine(anchors, 20)).toBe(7);
  });

  /**
   * A caret in the note's introduction is not a statement about any page.
   * Turning the document because somebody clicked in a heading is the kind of
   * helpfulness people switch off.
   */
  it("follows nothing above the first citation", () => {
    expect(pageForLine(anchors, 1)).toBeNull();
    expect(pageForLine([], 10)).toBeNull();
  });
});

describe("lineForPage", () => {
  it("finds the paragraph written about the part now on screen", () => {
    expect(lineForPage(anchors, 7)).toBe(20);
    expect(lineForPage(anchors, 9)).toBe(20);
    expect(lineForPage(anchors, 400)).toBe(40);
  });

  it("follows nothing before the first cited page", () => {
    expect(lineForPage(anchors, 1)).toBeNull();
  });

  it("orders by page, not by where the citations happen to sit in the note", () => {
    // A note that quotes page 12 before page 2 is a note somebody wrote out of
    // order, which is normal and must not confuse the mapping.
    const jumbled: Anchor[] = [
      { line: 5, page: 12 },
      { line: 30, page: 2 },
    ];

    expect(lineForPage(jumbled, 3)).toBe(30);
    expect(lineForPage(jumbled, 12)).toBe(5);
  });
});
