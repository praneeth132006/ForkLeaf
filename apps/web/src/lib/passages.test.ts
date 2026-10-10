// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findQuoteRange, passageStatus, quoteFromSelection } from "./passages";

describe("quoteFromSelection", () => {
  it("makes one line of words", () => {
    expect(quoteFromSelection("  Rotate the keys\n\n monthly.  ")).toBe("Rotate the keys monthly.");
  });

  it("refuses an empty selection", () => {
    expect(quoteFromSelection("   ")).toBeNull();
    expect(quoteFromSelection("a")).toBeNull();
  });

  it("cuts a long one at a word, within the limit", () => {
    const long = `${"word ".repeat(200)}end`;
    const quote = quoteFromSelection(long)!;
    expect(quote.length).toBeLessThanOrEqual(500);
    expect(quote.endsWith("word")).toBe(true);
  });
});

describe("passageStatus", () => {
  const note = "# Keys\n\nWe **rotate the keys** every\nmonth, using [[rotate-script]].";

  it("finds a passage selected in rich text, across formatting and line breaks", () => {
    expect(passageStatus(note, "We rotate the keys every month")).toBe("here");
    expect(passageStatus(note, "using rotate-script")).toBe("here");
  });

  it("finds a passage selected in the source view", () => {
    expect(passageStatus(note, "We **rotate the keys** every month")).toBe("here");
  });

  it("says when the words have been rewritten", () => {
    expect(passageStatus(note, "We rotate the keys every week")).toBe("changed");
    expect(passageStatus(note, "")).toBe("changed");
  });
});

describe("findQuoteRange", () => {
  function page(html: string) {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.append(root);
    return root;
  }

  it("finds words split across formatting", () => {
    const root = page("<p>We <strong>rotate the keys</strong> every\n   month.</p>");
    const range = findQuoteRange(root, "rotate the keys every month");
    expect(range?.toString()).toBe("rotate the keys every\n   month");
  });

  it("keeps separate paragraphs separate words", () => {
    const root = page("<p>end of one</p><p>start of two</p>");
    expect(findQuoteRange(root, "one start")?.toString()).toBe("onestart");
    expect(findQuoteRange(root, "onestart")).toBeNull();
  });

  it("is null when the words are not there", () => {
    expect(findQuoteRange(page("<p>Hello</p>"), "Goodbye")).toBeNull();
    expect(findQuoteRange(page("<p>Hello</p>"), "  ")).toBeNull();
  });
});
