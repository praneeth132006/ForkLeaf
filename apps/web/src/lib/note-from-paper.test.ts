import { describe, expect, it } from "vitest";
import type { PdfMetadata, PdfOutlineItem } from "@forkleaf/pdf";
import { paperNote } from "./note-from-paper";

const metadata = (over: Partial<PdfMetadata> = {}): PdfMetadata => ({
  title: "Attention Is All You Need",
  author: "Vaswani et al.",
  subject: null,
  keywords: [],
  createdAt: "2017-06-12T00:00:00.000Z",
  modifiedAt: null,
  producer: null,
  ...over,
});

const heading = (title: string, page: number | null, children: PdfOutlineItem[] = []) =>
  ({ title, page, children }) as PdfOutlineItem;

const build = (over: Partial<Parameters<typeof paperNote>[0]> = {}) =>
  paperNote({
    metadata: metadata(),
    filename: "attention.pdf",
    outline: [heading("Introduction", 1), heading("Method", 3), heading("Results", 8)],
    pageCount: 15,
    pdfPath: "papers/attention.pdf",
    notePath: "reading/attention-is-all-you-need.md",
    ...over,
  });

describe("paperNote — what it fills in", () => {
  it("takes the title from the paper, not from the filename", () => {
    expect(build().title).toBe("Attention Is All You Need");
    expect(build().frontmatter.title).toBe("Attention Is All You Need");
  });

  it("falls back to the filename for a paper whose metadata has no title", () => {
    expect(build({ metadata: metadata({ title: null }) }).title).toBe("attention");
  });

  it("records the author and the date the paper carries", () => {
    const { frontmatter } = build();

    expect(frontmatter.author).toBe("Vaswani et al.");
    // The paper's date, not today's: `created` already records when the note
    // was started, and the two are different facts.
    expect(frontmatter.published).toBe("2017-06-12");
    expect(frontmatter.tags).toEqual(["paper"]);
  });

  it("leaves out what the paper does not say", () => {
    const { frontmatter } = build({
      metadata: metadata({ author: null, createdAt: null }),
    });

    expect("author" in frontmatter).toBe(false);
    expect("published" in frontmatter).toBe(false);
  });
});

describe("paperNote — the headings", () => {
  it("turns the paper's contents into headings, each linked to its page", () => {
    const { content } = build();

    expect(content).toContain("## Introduction");
    expect(content).toContain("## Method");
    expect(content).toContain("[p. 3](../papers/attention.pdf#page=3)");
  });

  it("writes links relative to the note, so they resolve on github.com too", () => {
    const { content } = build({ notePath: "a/b/c/note.md" });
    expect(content).toContain("(../../../papers/attention.pdf#page=1)");
  });

  it("invents no structure for a paper that has no contents list", () => {
    const { content } = build({ outline: [] });

    expect(content).toContain("## Notes");
    expect(content).not.toContain("## Introduction");
  });

  it("goes one level deeper when everything hangs off a single root", () => {
    const { content } = build({
      outline: [heading("Contents", null, [heading("One", 1), heading("Two", 4)])],
    });

    expect(content).toContain("## One");
    expect(content).toContain("## Two");
  });

  it("does not open with ninety empty headings", () => {
    const many = Array.from({ length: 90 }, (_, index) => heading(`Section ${index}`, index + 1));
    const headings = build({ outline: many }).content.match(/^## /gm) ?? [];

    expect(headings.length).toBeLessThanOrEqual(24);
  });

  it("names a page it could not link to rather than dropping it", () => {
    // A heading whose destination the document does not resolve.
    const { content } = build({ outline: [heading("Preface", null), heading("One", 2)] });

    expect(content).toContain("## Preface");
    expect(content).not.toContain("#page=null");
  });
});

describe("paperNote — a document from a desktop", () => {
  it("names the paper instead of linking to a file that is not in the notebook", () => {
    const { content, frontmatter } = build({ pdfPath: null });

    expect(content).not.toContain("](");
    expect(content).toContain("Attention Is All You Need · Vaswani et al. · 15 pages");
    expect("source" in frontmatter).toBe(false);
  });
});
