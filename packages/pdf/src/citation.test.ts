import { describe, expect, it } from "vitest";
import {
  citationLink,
  compose,
  createCitation,
  isPdfTarget,
  MAX_QUOTE_LENGTH,
  parseCitation,
  resolveCitation,
  serializeCitation,
  splitTarget,
  stripPunctuation,
} from "./citation";
import { normalizeForMatch } from "./text";
import type { PdfPageText } from "./types";

/** A page of plain prose, with no geometry — the resolver never looks at it. */
function page(number: number, text: string): PdfPageText {
  return { page: number, text, runs: [] };
}

describe("createCitation", () => {
  const source = page(4, "Before the quote. The important claim goes here. After the quote.");

  it("records the selected text as the quotation", () => {
    const at = source.text.indexOf("The important claim goes here.");
    const citation = createCitation(source, at, at + "The important claim goes here.".length);

    expect(citation.quote).toBe("The important claim goes here.");
    expect(citation.page).toBe(4);
  });

  it("records the words either side, which is what tells occurrences apart", () => {
    const at = source.text.indexOf("The important claim");
    const citation = createCitation(source, at, at + "The important claim".length);

    expect(citation.prefix).toBe("Before the quote.");
    expect(citation.suffix).toBe("goes here. After the quote.");
  });

  it("flattens the layout whitespace a PDF selection drags in", () => {
    const wrapped = page(1, "a claim\nsplit   across\nlines");
    expect(createCitation(wrapped, 0, wrapped.text.length).quote).toBe(
      "a claim split across lines",
    );
  });

  it("accepts a backwards selection", () => {
    const at = source.text.indexOf("important");
    const forwards = createCitation(source, at, at + 9);
    const backwards = createCitation(source, at + 9, at);
    expect(backwards).toEqual(forwards);
  });

  it("clamps a range that runs past the end of the page", () => {
    const citation = createCitation(source, 0, 10_000);
    expect(citation.quote).toBe(source.text);
    expect(citation.suffix).toBe("");
  });

  it("truncates a quotation nobody wants inside a URL", () => {
    const long = page(1, "x".repeat(2000));
    expect(createCitation(long, 0, 2000).quote).toHaveLength(MAX_QUOTE_LENGTH);
  });

  it("has no context at the very start of a page", () => {
    expect(createCitation(source, 0, 6).prefix).toBe("");
  });
});

describe("serializeCitation and parseCitation", () => {
  it("round-trips a full citation", () => {
    const citation = {
      quote: "the important claim",
      prefix: "before it",
      suffix: "after it",
      page: 12,
    };
    expect(parseCitation(serializeCitation(citation))).toEqual(citation);
  });

  it("round-trips text that would otherwise break a markdown link", () => {
    const citation = {
      quote: "a claim (with parentheses) and 100% of the ampersands & spaces",
      prefix: "",
      suffix: "",
      page: 1,
    };

    const link = citationLink("papers/paper.pdf", citation);
    expect(link).not.toMatch(/[()]/);
    expect(parseCitation(splitTarget(link).fragment)).toEqual(citation);
  });

  it("leads with the parameter every other PDF reader understands", () => {
    expect(serializeCitation({ quote: "x", prefix: "", suffix: "", page: 9 })).toMatch(/^page=9&/);
  });

  it("omits context that is not there", () => {
    const fragment = serializeCitation({ quote: "x", prefix: "", suffix: "", page: 2 });
    expect(fragment).toBe("page=2&q=x");
  });

  it("reads a plain page fragment written by another tool", () => {
    expect(parseCitation("#page=7")).toEqual({ quote: "", prefix: "", suffix: "", page: 7 });
  });

  it("reads the bare number a person types", () => {
    expect(parseCitation("#12")?.page).toBe(12);
  });

  it("accepts the short spelling of the page key", () => {
    expect(parseCitation("p=3&q=hi")?.page).toBe(3);
  });

  it("is not fooled into claiming a heading anchor", () => {
    expect(parseCitation("#results-and-discussion")).toBeNull();
  });

  it("returns null for an empty fragment", () => {
    expect(parseCitation("")).toBeNull();
  });

  it("survives a malformed percent escape rather than losing the citation", () => {
    expect(parseCitation("page=2&q=100%zz")?.quote).toBe("100%zz");
  });

  it("falls back to page one when the page is nonsense but a quote is there", () => {
    expect(parseCitation("page=abc&q=hello")?.page).toBe(1);
  });

  it("refuses page zero, which no document has", () => {
    expect(parseCitation("#0")).toBeNull();
  });
});

describe("splitTarget and isPdfTarget", () => {
  it("splits on the last hash, so a file may contain one", () => {
    expect(splitTarget("q&a#1.pdf#page=2")).toEqual({ path: "q&a#1.pdf", fragment: "page=2" });
  });

  it("handles a target with no fragment", () => {
    expect(splitTarget("a.pdf")).toEqual({ path: "a.pdf", fragment: "" });
  });

  it("recognises a PDF with and without a fragment", () => {
    expect(isPdfTarget("papers/x.PDF")).toBe(true);
    expect(isPdfTarget("papers/x.pdf#page=2&q=hi")).toBe(true);
    expect(isPdfTarget("notes/x.md#pdf")).toBe(false);
  });
});

describe("resolveCitation", () => {
  const pages = [
    page(1, "An introduction, which mentions the key result in passing."),
    page(2, "Filler about method. The key result is that latency fell by half. More filler."),
    page(3, "A conclusion restating that the key result is important."),
  ];

  const citation = {
    quote: "The key result is that latency fell by half.",
    prefix: "Filler about method.",
    suffix: "More filler.",
    page: 2,
  };

  it("finds a quotation exactly where it was left", () => {
    const match = resolveCitation(pages, citation);

    expect(match.quality).toBe("exact");
    expect(match.page).toBe(2);
    expect(pages[1]!.text.slice(...match.range!)).toBe(citation.quote);
  });

  it("follows a quotation that moved to another page", () => {
    // The case a second edition creates, and the case a page number cannot
    // survive: the words are unchanged, the pagination is not.
    const reprinted = [
      page(1, "An introduction, which mentions the key result in passing."),
      page(2, "A newly inserted figure and its caption."),
      page(3, "Filler about method. The key result is that latency fell by half. More filler."),
    ];

    const match = resolveCitation(reprinted, citation);
    expect(match.quality).toBe("moved");
    expect(match.page).toBe(3);
  });

  it("uses context to pick between two identical occurrences", () => {
    const repeated = [
      page(1, "As noted, see below. The same sentence appears twice. Once here."),
      page(2, "Different lead-in. The same sentence appears twice. And again there."),
    ];

    const match = resolveCitation(repeated, {
      quote: "The same sentence appears twice.",
      prefix: "Different lead-in.",
      suffix: "And again there.",
      page: 2,
    });

    expect(match.page).toBe(2);
    expect(repeated[1]!.text.slice(...match.range!)).toBe("The same sentence appears twice.");
  });

  it("lets context beat a stale page hint", () => {
    // The hint says page 1; the surrounding words say page 2. The words win,
    // because they identify the passage and the number only says where it was.
    const repeated = [
      page(1, "As noted, see below. The same sentence appears twice. Once here."),
      page(2, "Different lead-in. The same sentence appears twice. And again there."),
    ];

    const match = resolveCitation(repeated, {
      quote: "The same sentence appears twice.",
      prefix: "Different lead-in.",
      suffix: "And again there.",
      page: 1,
    });

    expect(match.page).toBe(2);
  });

  it("finds a quotation through hyphenation the reader never saw", () => {
    const typeset = [page(1, "the measurements were regu-\nlar and repeatable")];
    const match = resolveCitation(typeset, {
      quote: "regular and repeatable",
      prefix: "",
      suffix: "",
      page: 1,
    });

    expect(match.quality).toBe("exact");
    expect(typeset[0]!.text.slice(...match.range!)).toBe("regu-\nlar and repeatable");
  });

  it("finds a quotation through ligatures and smart quotes", () => {
    const typeset = [page(1, "we “ﬁnd” a diﬀerence")];
    const match = resolveCitation(typeset, {
      quote: '"find" a difference',
      prefix: "",
      suffix: "",
      page: 1,
    });

    expect(match.quality).toBe("exact");
  });

  it("falls back to matching without punctuation when a document is re-typeset", () => {
    const reset = [page(1, "the result-set, however, was empty")];
    const match = resolveCitation(reset, {
      quote: "the result set however was empty",
      prefix: "",
      suffix: "",
      page: 1,
    });

    expect(match.quality).toBe("fuzzy");
    expect(reset[0]!.text.slice(...match.range!)).toContain("result-set");
  });

  it("keeps hold of a passage whose tail was edited away", () => {
    const edited = [page(1, "The key result is that latency fell substantially in every trial.")];
    const match = resolveCitation(edited, citation);

    expect(match.quality).toBe("fuzzy");
    expect(edited[0]!.text.slice(...match.range!)).toBe("The key result is that latency fell");
  });

  it("admits when the passage is simply gone", () => {
    const rewritten = [page(1, "This document is about something else entirely.")];
    expect(resolveCitation(rewritten, citation)).toEqual({
      quality: "lost",
      page: null,
      range: null,
    });
  });

  it("does not invent a match out of a couple of common words", () => {
    // "of the" would match almost any document. A citation that lands on the
    // wrong paragraph is worse than one that says it could not be found.
    const unrelated = [page(1, "Some of the other things discussed in this report.")];
    expect(
      resolveCitation(unrelated, {
        quote: "of the specific mechanism described in section four",
        prefix: "",
        suffix: "",
        page: 1,
      }).quality,
    ).toBe("lost");
  });

  it("treats a citation with no quotation as a page link", () => {
    const match = resolveCitation(pages, { quote: "", prefix: "", suffix: "", page: 3 });
    expect(match).toEqual({ quality: "exact", page: 3, range: [0, 0] });
  });

  it("reports a page link past the end of the document as lost", () => {
    expect(resolveCitation(pages, { quote: "", prefix: "", suffix: "", page: 99 }).quality).toBe(
      "lost",
    );
  });

  it("survives an empty document", () => {
    expect(resolveCitation([], citation).quality).toBe("lost");
  });

  it("survives a whitespace-only quotation", () => {
    expect(resolveCitation(pages, { quote: "   ", prefix: "", suffix: "", page: 1 }).quality).toBe(
      "exact",
    );
  });

  it("round-trips a citation built from a page and then resolved against it", () => {
    // The property that matters most: anything this package writes, it can
    // read back and point at the same characters.
    const at = pages[1]!.text.indexOf("latency fell by half");
    const built = createCitation(pages[1]!, at, at + "latency fell by half".length);

    const parsed = parseCitation(serializeCitation(built))!;
    const match = resolveCitation(pages, parsed);

    expect(match.quality).toBe("exact");
    expect(pages[1]!.text.slice(...match.range!)).toBe("latency fell by half");
  });
});

describe("stripPunctuation", () => {
  it("keeps letters, digits and word gaps and nothing else", () => {
    expect(stripPunctuation("Hello, world! (42)").text).toBe("Hello world 42");
  });

  it("does not leave a leading or trailing gap", () => {
    expect(stripPunctuation("...middle...").text).toBe("middle");
  });

  it("maps back to the original offsets", () => {
    const source = "a, b";
    const stripped = stripPunctuation(source);
    expect(stripped.text).toBe("a b");
    expect(stripped.map[2]).toBe(3);
  });
});

describe("compose", () => {
  it("chains two normalisations back to the original text", () => {
    const source = "The  ﬁrst, result.";
    const outer = normalizeForMatch(source);
    const inner = stripPunctuation(outer.text);
    const chained = compose(outer, inner);

    expect(chained.text).toBe("the first result");

    const at = chained.text.indexOf("first");
    // Offsets survive both passes and still land on the ligature in the source.
    expect(source[chained.map[at]!]).toBe("ﬁ");
  });
});
