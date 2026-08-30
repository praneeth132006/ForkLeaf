import { describe, expect, it } from "vitest";
import type { PdfTextEntry } from "@forkleaf/types";
import { entryFrom, pagesOf, pdfTextId, searchDocuments } from "./pdf-index";

const entry = (path: string, pages: string[]): PdfTextEntry =>
  entryFrom(
    "w",
    path,
    pages.map((text, index) => ({ page: index + 1, text })),
  );

describe("entryFrom", () => {
  it("keys a document by workspace and path, like everything else stored here", () => {
    expect(entryFrom("w", "papers/x.pdf", []).id).toBe(pdfTextId("w", "papers/x.pdf"));
  });

  it("records when it was read, so a stale copy can be recognised", () => {
    const at = new Date("2026-03-14T10:00:00.000Z");
    expect(entryFrom("w", "papers/x.pdf", [], at).indexedAt).toBe("2026-03-14T10:00:00.000Z");
  });
});

describe("pagesOf", () => {
  it("hands back pages the search and citation code can take", () => {
    const pages = pagesOf(entry("papers/x.pdf", ["hello"]));
    expect(pages).toEqual([{ page: 1, text: "hello", runs: [] }]);
  });
});

describe("searchDocuments", () => {
  const shelf = [
    entry("papers/attention.pdf", ["Attention is all you need.", "A second page of it."]),
    entry("papers/other.pdf", ["Nothing about attention here — well, one mention."]),
  ];

  it("finds a phrase inside a document, and says which page", () => {
    const [hit] = searchDocuments(shelf, "all you need");

    expect(hit?.path).toBe("papers/attention.pdf");
    expect(hit?.page).toBe(1);
    expect(hit?.snippet).toContain("all you need");
  });

  it("reaches every document, not just the first", () => {
    const paths = searchDocuments(shelf, "attention").map((hit) => hit.path);
    expect(new Set(paths)).toEqual(new Set(["papers/attention.pdf", "papers/other.pdf"]));
  });

  /**
   * A three-hundred-page paper using the word "model" on every page would
   * otherwise fill the list before the second document was reached — and
   * somebody searching their notebook is looking for *which* document, not for
   * four hundred occurrences in one of them.
   */
  it("takes only a few hits from any one document", () => {
    const repetitive = entry(
      "papers/repeat.pdf",
      Array.from({ length: 20 }, () => "model model model"),
    );

    expect(searchDocuments([repetitive], "model", { perDocument: 2 })).toHaveLength(2);
  });

  it("stops at the overall limit", () => {
    expect(searchDocuments(shelf, "attention", { limit: 1 })).toHaveLength(1);
  });

  it("says nothing at all until there is a question", () => {
    expect(searchDocuments(shelf, "")).toEqual([]);
    expect(searchDocuments(shelf, " ")).toEqual([]);
    // One character is still typing, not searching.
    expect(searchDocuments(shelf, "a")).toEqual([]);
  });

  it("finds a word the document broke across a line", () => {
    // The reason searching PDFs is done through the normaliser: a literal
    // search finds none of these, and the reader concludes the phrase is not
    // in a document that says it twice.
    const hyphenated = entry("papers/typeset.pdf", ["the regu-\nlar expression"]);

    expect(searchDocuments([hyphenated], "regular")).toHaveLength(1);
  });
});
