import { describe, expect, it } from "vitest";
import { SearchIndex, bestSnippet, highlightRanges, parseQuery, tokenize } from "./search-index";
import type { SearchDoc } from "./search-index";

const doc = (id: string, over: Partial<SearchDoc> = {}): SearchDoc => ({
  id,
  workspaceId: "ws",
  path: `${id}.md`,
  title: id,
  tags: [],
  content: "",
  ...over,
});

function indexOf(...docs: SearchDoc[]): SearchIndex {
  const index = new SearchIndex();
  for (const d of docs) index.add(d);
  return index;
}

describe("tokenize", () => {
  it("keeps words, numbers and inner punctuation", () => {
    expect(tokenize("Don't ship on Fri-day, v2")).toEqual(["don't", "ship", "on", "fri-day", "v2"]);
  });
});

describe("parseQuery", () => {
  it("pulls quoted phrases out of the terms", () => {
    const parsed = parseQuery('deploy "rolling release" notes');
    expect(parsed.phrases).toEqual(["rolling release"]);
    expect(parsed.terms).toEqual(["deploy", "notes"]);
  });

  it("drops stopwords", () => {
    expect(parseQuery("the plan for the week").terms).toEqual(["plan", "week"]);
  });
});

describe("SearchIndex", () => {
  it("finds a note by a word only in its body", () => {
    const index = indexOf(
      doc("a", {
        title: "Meeting notes",
        content: "We agreed to postpone the kubernetes upgrade.",
      }),
      doc("b", { title: "Shopping", content: "Bread, milk." }),
    );

    expect(index.search("kubernetes").map((hit) => hit.id)).toEqual(["a"]);
  });

  it("requires every term", () => {
    const index = indexOf(
      doc("a", { content: "kubernetes upgrade" }),
      doc("b", { content: "kubernetes rollback" }),
    );

    expect(index.search("kubernetes upgrade", { prefixLast: false }).map((h) => h.id)).toEqual([
      "a",
    ]);
    expect(index.search("kubernetes nowhere", { prefixLast: false })).toEqual([]);
  });

  it("ranks a title match above a passing mention", () => {
    const index = indexOf(
      doc("mention", {
        title: "Weekly notes",
        content: `Mentioned kubernetes once. ${"filler ".repeat(200)}`,
      }),
      doc("about", { title: "Kubernetes", content: "How the cluster is laid out." }),
    );

    expect(index.search("kubernetes", { prefixLast: false })[0]!.id).toBe("about");
  });

  it("matches a prefix while the word is still being typed", () => {
    const index = indexOf(doc("a", { content: "kubernetes" }));
    expect(index.search("kuber").map((h) => h.id)).toEqual(["a"]);
    expect(index.search("kuber", { prefixLast: false })).toEqual([]);
  });

  it("honours quoted phrases in order", () => {
    const index = indexOf(
      doc("a", { content: "we take a note carefully" }),
      doc("b", { content: "note taking is a habit" }),
    );

    expect(index.search('"note taking"').map((h) => h.id)).toEqual(["b"]);
  });

  it("searches tags and paths", () => {
    const index = indexOf(doc("a", { path: "projects/roadmap.md", tags: ["planning"] }));
    expect(index.search("planning", { prefixLast: false }).map((h) => h.id)).toEqual(["a"]);
    expect(index.search("projects", { prefixLast: false }).map((h) => h.id)).toEqual(["a"]);
  });

  it("can be scoped to one repository", () => {
    const index = indexOf(
      doc("a", { workspaceId: "one", content: "shared word" }),
      doc("b", { workspaceId: "two", content: "shared word" }),
    );

    expect(index.search("shared", { workspaceId: "two" }).map((h) => h.id)).toEqual(["b"]);
  });

  it("replaces a note rather than indexing it twice", () => {
    const index = new SearchIndex();
    index.add(doc("a", { content: "before" }));
    index.add(doc("a", { content: "after" }));

    expect(index.size).toBe(1);
    expect(index.search("before", { prefixLast: false })).toEqual([]);
    expect(index.search("after", { prefixLast: false })).toHaveLength(1);
  });

  it("forgets a removed note completely", () => {
    const index = indexOf(doc("a", { content: "unique" }));
    index.remove("a");

    expect(index.size).toBe(0);
    expect(index.search("unique", { prefixLast: false })).toEqual([]);
    // Removing again is not an error, and neither is removing what was never there.
    index.remove("a");
    index.remove("never");
  });

  it("returns nothing for an empty query", () => {
    expect(indexOf(doc("a", { content: "x" })).search("   ")).toEqual([]);
  });

  it("carries a snippet showing why the note matched", () => {
    const index = indexOf(
      doc("a", {
        content: `${"padding ".repeat(40)}The migration to Postgres happens in March.${" tail".repeat(40)}`,
      }),
    );

    const [hit] = index.search("postgres", { prefixLast: false });
    expect(hit!.snippet!.text).toContain("Postgres");
    expect(hit!.snippet!.text.startsWith("…")).toBe(true);
  });
});

describe("bestSnippet", () => {
  it("prefers the window covering the most terms", () => {
    const text = `alpha ${"x ".repeat(60)} alpha beta`;
    expect(bestSnippet(text, ["alpha", "beta"])!.text).toContain("beta");
  });

  it("returns null when nothing matches", () => {
    expect(bestSnippet("nothing here", ["absent"])).toBeNull();
    expect(bestSnippet("", ["a"])).toBeNull();
  });
});

describe("highlightRanges", () => {
  it("merges overlapping matches", () => {
    expect(highlightRanges("noteworthy note", ["note", "noteworthy"])).toEqual([
      [0, 10],
      [11, 15],
    ]);
  });
});
