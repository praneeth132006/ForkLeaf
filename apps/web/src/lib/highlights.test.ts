import { describe, expect, it } from "vitest";
import { appendHighlight, highlightLine, highlightsIn, inboxNote, parseSaveRequest } from "./inbox";
import { findDuplicate, findHighlights, grownEntry, type SavedEntry } from "./saves";
import { passagesIn } from "./spaced-reading";

const params = (values: Record<string, string>) =>
  new URLSearchParams({ save: "1", kind: "highlight", ...values });

const entry = (overrides: Partial<SavedEntry> = {}): SavedEntry => ({
  path: "highlights/2026/10/2026-10-01-rivers.md",
  title: "Rivers",
  kind: "highlight",
  url: "https://example.com/rivers",
  site: "example.com",
  saved: "2026-10-01",
  savedAt: "2026-10-01T10:00:00.000Z",
  excerpt: "",
  ...overrides,
});

describe("highlight saves", () => {
  it("needs the page and the words", () => {
    expect(parseSaveRequest(params({ text: "Rivers move slowly" }))).toBeNull();
    expect(parseSaveRequest(params({ url: "https://example.com/rivers" }))).toBeNull();
    expect(
      parseSaveRequest(params({ url: "https://example.com/rivers", text: "Rivers move" })),
    ).toMatchObject({ kind: "highlight", url: "https://example.com/rivers", text: "Rivers move" });
  });

  it("writes the first highlight as a marked line under a link to the page", () => {
    const made = inboxNote(
      {
        kind: "highlight",
        url: "https://example.com/rivers",
        title: "Rivers",
        text: "Rivers move\nslowly",
      },
      new Date("2026-10-01T10:00:00Z"),
    );

    expect(made.content).toBe("[Rivers](https://example.com/rivers)\n\n- ==Rivers move slowly==\n");
    expect(made.frontmatter).toMatchObject({
      type: "highlight",
      url: "https://example.com/rivers",
    });
  });

  it("adds later highlights to the end, once each", () => {
    const first = "# Rivers\n\n[Rivers](https://example.com/rivers)\n\n- ==Rivers move slowly==\n";
    const second = appendHighlight(first, "Deltas build land over centuries");

    expect(second).toBe(`${first}- ==Deltas build land over centuries==\n`);
    expect(appendHighlight(second, "  Deltas build land\nover centuries ")).toBe(second);
    expect(highlightsIn(second)).toEqual([
      "Rivers move slowly",
      "Deltas build land over centuries",
    ]);
  });

  it("cannot close the mark early", () => {
    expect(highlightLine("a == b")).toBe("- ==a = = b==");
  });

  it("collects into the page's note instead of counting as a duplicate", () => {
    const request = {
      kind: "highlight" as const,
      url: "https://example.com/rivers",
      title: "Rivers",
      text: "More",
    };

    expect(findDuplicate([entry()], request)).toBeNull();
    expect(findHighlights([entry({ kind: "quote" }), entry()], request)?.kind).toBe("highlight");
    expect(findHighlights([entry({ url: "https://example.com/other" })], request)).toBeNull();
  });

  it("refreshes the index entry when the note grows", () => {
    const grown = grownEntry(
      entry(),
      "---\ntitle: Rivers\n---\n\n# Rivers\n\n- ==Deltas build land==\n",
      new Date("2026-10-02T00:00:00Z"),
    );

    expect(grown.savedAt).toBe("2026-10-02T00:00:00.000Z");
    expect(grown.excerpt).toContain("Deltas build land");
    expect(grown.excerpt).not.toContain("title:");
  });

  it("comes back in spaced reading", () => {
    const passages = passagesIn({
      path: "highlights/2026/10/2026-10-01-rivers.md",
      title: "Rivers",
      content: "# Rivers\n\n- ==Rivers move slowly to the sea==\n",
      frontmatter: { type: "highlight", url: "https://example.com/rivers", site: "example.com" },
    });

    expect(passages.map((passage) => passage.text)).toEqual(["Rivers move slowly to the sea"]);
  });
});
