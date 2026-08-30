import { describe, expect, it } from "vitest";
import { mentionsOfPdf } from "./pdf-mentions";

const cited = (page: number, quote: string, prefix = "", suffix = "") =>
  `page=${page}&q=${encodeURIComponent(quote)}` +
  (prefix ? `&p=${encodeURIComponent(prefix)}` : "") +
  (suffix ? `&s=${encodeURIComponent(suffix)}` : "");

describe("mentionsOfPdf — finding them", () => {
  it("finds a quotation written by the reader, passage and all", () => {
    const notes = [
      {
        path: "reading/attention.md",
        content: [
          "# Notes on the paper",
          "",
          "> Attention is all you need, and the rest is",
          "> engineering.",
          ">",
          `> — [Attention, p. 12](../papers/attention.pdf#${cited(12, "Attention is all")})`,
          "",
          "Which I think is overstated.",
        ].join("\n"),
      },
    ];

    const [mention, ...rest] = mentionsOfPdf(notes, "papers/attention.pdf");

    expect(rest).toEqual([]);
    expect(mention?.notePath).toBe("reading/attention.md");
    expect(mention?.page).toBe(12);
    expect(mention?.label).toBe("Attention, p. 12");
    expect(mention?.quote).toBe("Attention is all you need, and the rest is\nengineering.");
    expect(mention?.line).toBe(6);
  });

  it("finds a bare reference in a sentence, and keeps the sentence", () => {
    const notes = [
      {
        path: "index.md",
        content: `The argument comes from [the paper](papers/attention.pdf#page=4), roughly.`,
      },
    ];

    const [mention] = mentionsOfPdf(notes, "papers/attention.pdf");

    expect(mention?.quote).toBeNull();
    expect(mention?.page).toBe(4);
    expect(mention?.context).toBe("The argument comes from the paper, roughly.");
  });

  it("resolves the link against the note holding it, not the repository root", () => {
    const notes = [
      { path: "a/b/note.md", content: "[here](../../papers/x.pdf#page=1)" },
      { path: "note.md", content: "[here](papers/x.pdf#page=2)" },
      { path: "other.md", content: "[elsewhere](papers/y.pdf#page=3)" },
    ];

    expect(mentionsOfPdf(notes, "papers/x.pdf").map((m) => m.notePath)).toEqual([
      "a/b/note.md",
      "note.md",
    ]);
  });

  it("reads the pages in order, and puts pageless mentions last", () => {
    const notes = [
      {
        path: "note.md",
        content: [
          "[c](papers/x.pdf#page=30)",
          "[a](papers/x.pdf#page=2)",
          "[none](papers/x.pdf)",
          "[b](papers/x.pdf#page=9)",
        ].join("\n"),
      },
    ];

    expect(mentionsOfPdf(notes, "papers/x.pdf").map((m) => m.label)).toEqual([
      "a",
      "b",
      "c",
      "none",
    ]);
  });
});

describe("mentionsOfPdf — what is not a mention", () => {
  it("ignores links to other documents", () => {
    const notes = [{ path: "note.md", content: "[other](papers/other.pdf#page=1)" }];
    expect(mentionsOfPdf(notes, "papers/x.pdf")).toEqual([]);
  });

  it("ignores an image whose source happens to be a PDF", () => {
    const notes = [{ path: "note.md", content: "![figure](papers/x.pdf)" }];
    expect(mentionsOfPdf(notes, "papers/x.pdf")).toEqual([]);
  });

  it("ignores a document on somebody else's website", () => {
    // Claiming these would mean fetching them, which would mean telling this
    // app's server which papers somebody is reading.
    const notes = [{ path: "note.md", content: "[web](https://example.com/x.pdf#page=2)" }];
    expect(mentionsOfPdf(notes, "papers/x.pdf")).toEqual([]);
  });

  it("does not mistake the attribution's own line for a quotation", () => {
    const notes = [{ path: "note.md", content: "> — [x, p. 2](papers/x.pdf#page=2)" }];
    expect(mentionsOfPdf(notes, "papers/x.pdf")[0]?.quote).toBeNull();
  });
});

describe("mentionsOfPdf — labels", () => {
  it("unescapes a title that had brackets in it", () => {
    const notes = [
      { path: "note.md", content: "[Results \\[draft\\], p. 3](papers/x.pdf#page=3)" },
    ];

    expect(mentionsOfPdf(notes, "papers/x.pdf")[0]?.label).toBe("Results [draft], p. 3");
  });
});
