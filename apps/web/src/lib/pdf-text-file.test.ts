import { describe, expect, it } from "vitest";
import { formatPageText, parsePageText, textPathFor } from "./pdf-text-file";

describe("textPathFor", () => {
  it("puts the file beside the document it belongs to", () => {
    expect(textPathFor("papers/attention.pdf")).toBe("papers/attention.text.md");
  });

  it("works for a document at the top of the repository", () => {
    expect(textPathFor("scan.pdf")).toBe("scan.text.md");
  });
});

describe("parsePageText", () => {
  it("reads a page per heading", () => {
    const file = [
      "# Text of scan",
      "",
      "## Page 1",
      "",
      "The first page.",
      "",
      "## Page 2",
      "",
      "The second.",
    ].join("\n");

    expect(parsePageText(file)).toEqual([
      { page: 1, text: "The first page." },
      { page: 2, text: "The second." },
    ]);
  });

  it("keeps every line of a page, blank lines and all", () => {
    const file = "## Page 1\n\nOne.\n\nTwo.\n";
    expect(parsePageText(file)[0]?.text).toBe("One.\n\nTwo.");
  });

  /**
   * Somebody will make these with `ocrmypdf` or by hand and will annotate
   * them. Refusing to read a file over a note somebody left themselves would
   * be the wrong way round.
   */
  it("tolerates a heading that says more than the page number", () => {
    expect(parsePageText("## Page 12 (the fold-out)\n\nWords.")).toEqual([
      { page: 12, text: "Words." },
    ]);
  });

  it("ignores whatever comes before the first page", () => {
    const file = "# Text of scan\n\nMade with ocrmypdf.\n\n## Page 1\n\nWords.";
    expect(parsePageText(file)).toEqual([{ page: 1, text: "Words." }]);
  });

  it("drops a page with nothing on it, which a blank scan really has", () => {
    expect(parsePageText("## Page 1\n\n## Page 2\n\nWords.")).toEqual([
      { page: 2, text: "Words." },
    ]);
  });

  it("finds nothing in a file that is not one of these", () => {
    expect(parsePageText("# A note\n\nAbout something else.")).toEqual([]);
  });
});

describe("formatPageText", () => {
  it("writes a file the parser reads back exactly", () => {
    const pages = [
      { page: 2, text: "The second." },
      { page: 1, text: "The first." },
    ];

    const file = formatPageText("attention", pages);

    // In page order, whatever order they arrived in: the file is read by
    // people as well as by this app.
    expect(parsePageText(file)).toEqual([
      { page: 1, text: "The first." },
      { page: 2, text: "The second." },
    ]);
    expect(file).toContain("# Text of attention");
  });
});
