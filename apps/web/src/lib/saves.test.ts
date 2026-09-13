import { describe, expect, it } from "vitest";
import type { SaveRequest } from "@/lib/inbox";
import {
  entryFor,
  findDuplicate,
  indexJson,
  indexMarkdown,
  parseIndex,
  saveDocument,
  savePath,
  slugify,
  withEntry,
} from "./saves";

const now = new Date(2026, 8, 13, 10, 30);

const page: SaveRequest = {
  kind: "page",
  url: "https://example.com/rivers",
  title: "How Rivers Move (and why)",
  text: "",
};

describe("slugify", () => {
  it("makes a short, safe filename from any title", () => {
    expect(slugify("How Rivers Move (and why)")).toBe("how-rivers-move-and-why");
    expect(slugify("Café au lait")).toBe("cafe-au-lait");
    expect(slugify("!!!")).toBe("saved");
    expect(slugify("a".repeat(100)).length).toBe(60);
  });
});

describe("savePath", () => {
  it("files by kind, year and month, with the date first", () => {
    expect(savePath({ ...page, title: "How Rivers Move" }, now, new Set())).toBe(
      "pages/2026/09/2026-09-13-how-rivers-move.md",
    );
    expect(savePath({ kind: "quote", url: null, title: "Cities", text: "x" }, now, new Set())).toBe(
      "quotes/2026/09/2026-09-13-cities.md",
    );
  });

  it("never lands on a file that is already there", () => {
    const taken = new Set(["pages/2026/09/2026-09-13-rivers.md"]);
    expect(savePath({ ...page, title: "Rivers" }, now, taken)).toBe(
      "pages/2026/09/2026-09-13-rivers-2.md",
    );
  });
});

describe("saveDocument", () => {
  it("writes front matter a YAML reader accepts, a heading and the link", () => {
    const document = saveDocument(page, now);
    expect(document.markdown).toMatch(/^---\ntitle: "How Rivers Move \(and why\)"\ntype: "page"\n/);
    expect(document.markdown).toContain("saved: 2026-09-13");
    expect(document.markdown).toContain("\n# How Rivers Move (and why)\n");
    expect(document.markdown).toContain("(https://example.com/rivers)");
  });
});

describe("the index", () => {
  const first = entryFor("pages/2026/09/2026-09-13-rivers.md", page, saveDocument(page, now));
  const quoteRequest: SaveRequest = {
    kind: "quote",
    url: "https://example.org/cities",
    title: "Cities",
    text: "Cities are for [people].",
  };
  const later = new Date(2026, 9, 2, 9, 0);
  const second = entryFor(
    "quotes/2026/10/2026-10-02-cities.md",
    quoteRequest,
    saveDocument(quoteRequest, later),
  );

  it("keeps the newest first, and a path only once", () => {
    const entries = withEntry(withEntry([], first), second);
    expect(entries.map((entry) => entry.path)).toEqual([second.path, first.path]);
    expect(withEntry(entries, first)).toHaveLength(2);
  });

  it("round-trips through index.json and drops malformed entries", () => {
    const json = indexJson([second, first]);
    expect(parseIndex(json)).toEqual([second, first]);
    expect(parseIndex('{"items":[{"path":1},{"path":"a","title":"b","kind":"video"}]}')).toEqual(
      [],
    );
    expect(parseIndex("not json")).toEqual([]);
    expect(parseIndex(null)).toEqual([]);
  });

  it("finds a page saved before, but lets a quote be saved twice", () => {
    expect(findDuplicate([first], page)?.path).toBe(first.path);
    expect(findDuplicate([second], quoteRequest)).toBeNull();
  });

  it("writes INDEX.md grouped by month and kind", () => {
    const markdown = indexMarkdown([second, first]);
    expect(markdown).toContain("2 items, newest first.");
    expect(markdown.indexOf("## October 2026")).toBeLessThan(markdown.indexOf("## September 2026"));
    expect(markdown).toContain("### Quotes\n\n- [Cities](quotes/2026/10/2026-10-02-cities.md)");
    expect(markdown).toContain("— example.com · 2026-09-13");
    expect(second.excerpt).toContain("Cities are for");
  });
});
