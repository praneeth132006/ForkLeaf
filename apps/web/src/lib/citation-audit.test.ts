import { describe, expect, it, vi } from "vitest";
import type { PdfPageText } from "@forkleaf/pdf";
import { auditCitations, checkAgainst, summarise, withCorrectedPage } from "./citation-audit";
import { allPdfMentions } from "./pdf-mentions";

const page = (number: number, text: string): PdfPageText => ({ page: number, text, runs: [] });

/** A note citing one passage of one paper, the way ForkLeaf writes them. */
function citing(options: {
  quote: string;
  page: number;
  path?: string;
  notePath?: string;
  prefix?: string;
  suffix?: string;
}) {
  const fragment = [
    `page=${options.page}`,
    `q=${encodeURIComponent(options.quote)}`,
    options.prefix ? `pre=${encodeURIComponent(options.prefix)}` : "",
    options.suffix ? `suf=${encodeURIComponent(options.suffix)}` : "",
  ]
    .filter(Boolean)
    .join("&");

  return {
    path: options.notePath ?? "reading.md",
    content: [
      `> ${options.quote}`,
      ">",
      `> — [Paper, p. ${options.page}](${options.path ?? "papers/attention.pdf"}#${fragment})`,
    ].join("\n"),
  };
}

describe("checkAgainst", () => {
  it("says a quotation is exactly where the note claims", () => {
    const notes = [citing({ quote: "attention is all you need", page: 2 })];
    const pages = [page(1, "Introduction."), page(2, "We show that attention is all you need.")];

    const [check] = checkAgainst(pages, allPdfMentions(notes));

    expect(check?.quality).toBe("exact");
    expect(check?.page).toBe(2);
    expect(check?.stale).toBe(false);
  });

  /**
   * The failure every other tool has silently: the author adds a figure, the
   * passage moves, and the stored page number is now pointing at the wrong
   * paragraph. Here the words are the anchor, so it is found and reported.
   */
  it("finds a passage that has moved, and says the page number is stale", () => {
    const notes = [citing({ quote: "attention is all you need", page: 2 })];
    const pages = [
      page(1, "Introduction."),
      page(2, "A figure that was not here before."),
      page(3, "We show that attention is all you need."),
    ];

    const [check] = checkAgainst(pages, allPdfMentions(notes));

    expect(check?.quality).toBe("moved");
    expect(check?.page).toBe(3);
    expect(check?.stale).toBe(true);
  });

  it("reports a passage that is not in the document any more", () => {
    const notes = [citing({ quote: "a sentence since deleted", page: 2 })];
    const pages = [page(1, "Introduction."), page(2, "Something else entirely.")];

    const [check] = checkAgainst(pages, allPdfMentions(notes));

    expect(check?.quality).toBe("lost");
    expect(check?.page).toBeNull();
  });

  it("skips a link that records no words, since there is nothing to check", () => {
    // `#page=4` is a perfectly good link and makes no claim this could test.
    const notes = [{ path: "a.md", content: "[the paper](papers/attention.pdf#page=4)" }];

    expect(checkAgainst([page(1, "x")], allPdfMentions(notes))).toEqual([]);
  });
});

describe("auditCitations", () => {
  it("reads each document once, however many notes quote it", async () => {
    const notes = [
      citing({ quote: "first passage", page: 1, notePath: "one.md" }),
      citing({ quote: "second passage", page: 2, notePath: "two.md" }),
    ];

    const pagesFor = vi.fn(async () => [page(1, "first passage"), page(2, "second passage")]);
    const summary = await auditCitations(notes, pagesFor);

    expect(pagesFor).toHaveBeenCalledTimes(1);
    expect(summary.checked).toBe(2);
    expect(summary.lost).toBe(0);
  });

  it("counts what is wrong, across every document", async () => {
    const notes = [
      citing({ quote: "still here", page: 1 }),
      citing({ quote: "has moved", page: 1, notePath: "b.md" }),
      citing({ quote: "gone entirely", page: 1, notePath: "c.md" }),
    ];

    const summary = await auditCitations(notes, async () => [
      page(1, "still here"),
      page(2, "has moved"),
    ]);

    expect(summary.checked).toBe(3);
    expect(summary.moved).toBe(1);
    expect(summary.lost).toBe(1);
  });

  /**
   * A document that cannot be read is not a document full of broken
   * citations. Treating a failed fetch as "no pages" would report every
   * quotation in it as lost, which is the one message that must never be
   * wrong.
   */
  it("reports a document it could not read as unread, not as broken", async () => {
    const notes = [citing({ quote: "still here", page: 1 })];

    const summary = await auditCitations(notes, async () => {
      throw new Error("That PDF could not be read from the repository.");
    });

    expect(summary.unreadable).toBe(1);
    expect(summary.lost).toBe(0);
    expect(summary.checked).toBe(0);
    expect(summary.documents[0]?.error).toMatch(/could not be read/);
  });

  it("opens nothing at all for a notebook with no citations in it", async () => {
    const pagesFor = vi.fn();
    const summary = await auditCitations([{ path: "a.md", content: "# nothing here" }], pagesFor);

    expect(pagesFor).not.toHaveBeenCalled();
    expect(summary.documents).toEqual([]);
  });

  it("says which document it is on, and when it has finished", async () => {
    const seen: string[] = [];
    const notes = [
      citing({ quote: "a", page: 1, path: "papers/one.pdf" }),
      citing({ quote: "b", page: 1, path: "papers/two.pdf", notePath: "b.md" }),
    ];

    await auditCitations(notes, async () => [page(1, "a b")], {
      onProgress: (done, total, pdfPath) => seen.push(`${done}/${total} ${pdfPath}`),
    });

    expect(seen).toEqual([
      "0/2 papers/one.pdf",
      "1/2 papers/one.pdf",
      "1/2 papers/two.pdf",
      "2/2 papers/two.pdf",
    ]);
  });
});

describe("withCorrectedPage", () => {
  it("moves the page number on and leaves the quotation alone", () => {
    const note = citing({ quote: "attention is all you need", page: 2 });
    const [check] = checkAgainst(
      [page(1, "x"), page(2, "y"), page(3, "attention is all you need")],
      allPdfMentions([note]),
    );

    const fixed = withCorrectedPage(note.content, check!);

    expect(fixed).toContain("page=3");
    expect(fixed).toContain(`q=${encodeURIComponent("attention is all you need")}`);
    // The words of the note are the reader's, not ours to rewrite.
    expect(fixed).toContain("> attention is all you need");
  });

  it("rewrites the citation that moved, not its neighbour on the same line", () => {
    const content = "[A](papers/x.pdf#page=2&q=alpha) and [B](papers/x.pdf#page=9&q=beta)";
    const [alpha] = checkAgainst(
      [page(1, "alpha"), page(9, "beta")],
      allPdfMentions([{ path: "n.md", content }]),
    );

    const fixed = withCorrectedPage(content, alpha!);

    expect(fixed).toContain("page=1&q=alpha");
    expect(fixed).toContain("page=9&q=beta");
  });

  it("changes nothing for a passage that is nowhere to be found", () => {
    const note = citing({ quote: "gone", page: 2 });
    const [check] = checkAgainst([page(1, "something else")], allPdfMentions([note]));

    expect(withCorrectedPage(note.content, check!)).toBe(note.content);
  });
});

describe("summarise", () => {
  it("adds nothing up when there is nothing to add up", () => {
    expect(summarise([])).toEqual({
      documents: [],
      checked: 0,
      lost: 0,
      moved: 0,
      fuzzy: 0,
      unreadable: 0,
    });
  });
});
