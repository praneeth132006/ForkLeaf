import { describe, expect, it } from "vitest";
import type { PdfCitation } from "@forkleaf/pdf";
import {
  highlightsPathFor,
  parseHighlights,
  withHighlight,
  withoutHighlight,
} from "./pdf-highlights";

const cite = (page: number, quote: string): PdfCitation => ({
  page,
  quote,
  prefix: "",
  suffix: "",
});

const options = { pdfPath: "papers/attention.pdf", title: "attention" };

describe("highlightsPathFor", () => {
  it("puts the file beside the document it belongs to", () => {
    expect(highlightsPathFor("papers/attention.pdf")).toBe("papers/attention.highlights.md");
  });

  it("works for a document at the top of the repository", () => {
    expect(highlightsPathFor("attention.pdf")).toBe("attention.highlights.md");
  });
});

describe("withHighlight", () => {
  it("writes a line anybody could read without this app", () => {
    const file = withHighlight("", { ...options, citation: cite(12, "attention is all you need") });

    expect(file).toContain("# Highlights — attention");
    // The document's own name: the file sits beside it, so the link resolves
    // on github.com too.
    expect(file).toContain("- [p. 12](attention.pdf#page=12");
    expect(file).toContain("— attention is all you need");
  });

  it("keeps them in page order, however they were made", () => {
    let file = withHighlight("", { ...options, citation: cite(12, "later") });
    file = withHighlight(file, { ...options, citation: cite(3, "earlier") });

    expect(file.indexOf("earlier")).toBeLessThan(file.indexOf("later"));
  });

  it("does not mark the same passage twice", () => {
    const once = withHighlight("", { ...options, citation: cite(4, "the same words") });
    const twice = withHighlight(once, { ...options, citation: cite(4, "the  same words ") });

    // Highlighting a sentence again is somebody checking it is there.
    expect(twice).toBe(once);
  });

  it("keeps what was already in the file", () => {
    const first = withHighlight("", { ...options, citation: cite(1, "one") });
    const second = withHighlight(first, { ...options, citation: cite(2, "two") });

    expect(parseHighlights(second).map((held) => held.text)).toEqual(["one", "two"]);
  });
});

describe("parseHighlights", () => {
  it("reads back what it wrote, citation and all", () => {
    const file = withHighlight("", {
      ...options,
      citation: { page: 12, quote: "attention is all", prefix: "We show that", suffix: ", and" },
    });

    const [held] = parseHighlights(file);

    expect(held?.citation.page).toBe(12);
    expect(held?.citation.quote).toBe("attention is all");
    // The context is what tells two occurrences of a phrase apart, so it has
    // to survive the round trip.
    expect(held?.citation.prefix).toBe("We show that");
  });

  it("ignores prose somebody has added around the list", () => {
    const file = [
      "# Highlights — attention",
      "",
      "Some notes I typed in here by hand.",
      "",
      "- [p. 2](attention.pdf#page=2&q=a%20passage) — a passage",
    ].join("\n");

    expect(parseHighlights(file)).toHaveLength(1);
  });

  it("finds nothing in a file that has none", () => {
    expect(parseHighlights("# Just a note\n\nNothing marked.")).toEqual([]);
  });
});

describe("withoutHighlight", () => {
  it("takes one out and leaves the rest", () => {
    let file = withHighlight("", { ...options, citation: cite(1, "keep me") });
    file = withHighlight(file, { ...options, citation: cite(2, "remove me") });

    const after = withoutHighlight(file, { ...options, quote: "remove me" });

    expect(parseHighlights(after).map((held) => held.text)).toEqual(["keep me"]);
  });

  it("leaves a file that still says what it is when the last one goes", () => {
    const file = withHighlight("", { ...options, citation: cite(1, "only one") });
    const after = withoutHighlight(file, { ...options, quote: "only one" });

    // Not an empty file: a heading says what the file is for, and the next
    // highlight has somewhere to go.
    expect(after.trim()).toBe("# Highlights — attention");
  });
});
