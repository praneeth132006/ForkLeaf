import { describe, expect, it } from "vitest";
import { parseCitation, splitTarget } from "@forkleaf/pdf";
import { insertionFor, quoteMarkdown, referenceMarkdown } from "@/lib/pdf-quote";

const citation = {
  quote: "The key result is that latency fell by half.",
  prefix: "Filler about method.",
  suffix: "More filler.",
  page: 12,
};

describe("quoteMarkdown", () => {
  it("produces a blockquote whose attribution is inside it", () => {
    const markdown = quoteMarkdown({
      target: "papers/attention.pdf",
      title: "On Attention",
      citation,
    });

    expect(markdown.split("\n").every((line) => line.startsWith(">"))).toBe(true);
    expect(markdown).toContain("> The key result is that latency fell by half.");
    expect(markdown).toContain("— [On Attention, p. 12](papers/attention.pdf#page=12");
  });

  it("writes a link that another PDF reader would still open at the right page", () => {
    const markdown = quoteMarkdown({ target: "a.pdf", title: "A", citation });
    // Adobe's own open parameter, so the link degrades rather than breaking.
    expect(markdown).toMatch(/\(a\.pdf#page=12&/);
  });

  it("round-trips the citation through the link it writes", () => {
    const markdown = quoteMarkdown({ target: "a.pdf", title: "A", citation });
    const href = /\]\(([^)]+)\)/.exec(markdown)![1]!;

    expect(parseCitation(splitTarget(href).fragment)).toEqual(citation);
  });

  it("quotes every line of a multi-line passage", () => {
    const markdown = quoteMarkdown({
      target: "a.pdf",
      title: "A",
      citation: { ...citation, quote: "first line\nsecond line" },
    });

    expect(markdown).toContain("> first line\n> second line");
  });

  it("gives a bare reference when the quotation is not wanted", () => {
    const markdown = quoteMarkdown({
      target: "a.pdf",
      title: "A",
      citation,
      includeQuote: false,
    });

    expect(markdown.startsWith("[")).toBe(true);
    expect(markdown).not.toContain(">");
  });

  it("gives a bare reference when there is nothing quoted", () => {
    const markdown = quoteMarkdown({
      target: "a.pdf",
      title: "A",
      citation: { ...citation, quote: "" },
    });

    expect(markdown.startsWith("[")).toBe(true);
  });

  it("escapes a title containing brackets rather than breaking the link", () => {
    const markdown = referenceMarkdown({
      target: "a.pdf",
      title: "Results [draft]",
      citation,
    });

    expect(markdown).toBe(
      `[Results \\[draft\\], p. 12](a.pdf#page=12&q=${encodeURIComponent(citation.quote).replace(/\(/g, "%28")}&pre=Filler%20about%20method.&suf=More%20filler.)`,
    );
  });

  it("escapes parentheses in the quotation so the link does not end early", () => {
    const markdown = quoteMarkdown({
      target: "a.pdf",
      title: "A",
      citation: { ...citation, quote: "a claim (qualified)" },
    });

    const href = /\]\(([^)]+)\)/.exec(markdown)![1]!;
    expect(parseCitation(splitTarget(href).fragment)!.quote).toBe("a claim (qualified)");
  });

  it("flattens a title that arrived with line breaks in it", () => {
    const markdown = referenceMarkdown({ target: "a.pdf", title: "Two\nlines", citation });
    expect(markdown.startsWith("[Two lines, p. 12]")).toBe(true);
  });
});

describe("a document that is not in the notebook", () => {
  it("attributes a quotation instead of linking to a path that resolves nowhere", () => {
    // A link to `/Users/somebody/Downloads/paper.pdf` works on one computer
    // and is broken in the repository it gets committed to.
    const markdown = quoteMarkdown({ target: null, title: "On Attention", citation });

    expect(markdown).toContain("> — On Attention, p. 12");
    expect(markdown).not.toContain("](");
  });

  it("still escapes a title that would break the markdown around it", () => {
    expect(referenceMarkdown({ target: null, title: "Results [draft]", citation })).toBe(
      "Results \\[draft\\], p. 12",
    );
  });
});

describe("insertionFor", () => {
  it("separates a blockquote from the paragraph above it", () => {
    // Without the blank line the renderer welds the quotation onto the
    // sentence that was being written when it was inserted.
    const { text } = insertionFor("A sentence.", 11, "> quoted");
    expect(text).toBe("A sentence.\n\n> quoted\n");
  });

  it("does not add newlines that are already there", () => {
    const { text } = insertionFor("A sentence.\n\n", 13, "> quoted");
    expect(text).toBe("A sentence.\n\n> quoted\n");
  });

  it("adds only the one newline that is missing", () => {
    const { text } = insertionFor("A sentence.\n", 12, "> quoted");
    expect(text).toBe("A sentence.\n\n> quoted\n");
  });

  it("does not open an empty note with blank lines", () => {
    expect(insertionFor("", 0, "> quoted").text).toBe("> quoted\n");
  });

  it("separates the quotation from what follows the caret", () => {
    const { text } = insertionFor("before\nafter", 6, "> quoted");
    expect(text).toBe("before\n\n> quoted\n\nafter");
  });

  it("reports a caret sitting after the inserted text", () => {
    const { text, caret } = insertionFor("A sentence.", 11, "> quoted");
    expect(text.slice(0, caret)).toBe("A sentence.\n\n> quoted\n");
  });

  it("clamps a caret outside the note rather than corrupting it", () => {
    expect(insertionFor("abc", 900, "x").text).toBe("abc\n\nx\n");
    expect(insertionFor("abc", -5, "x").text).toBe("x\n\nabc");
  });
});
