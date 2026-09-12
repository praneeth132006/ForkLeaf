import { describe, expect, it } from "vitest";
import { countByKind, filterMind, mindItems, plainText } from "./mind";
import { inboxNote } from "./inbox";

const NOW = new Date(2026, 8, 13);

function saved(path: string, request: Parameters<typeof inboxNote>[0], extra: Record<string, unknown> = {}) {
  const note = inboxNote(request, NOW);
  return { path, title: note.title, content: note.content, frontmatter: { ...note.frontmatter, ...extra } };
}

const NOTES = [
  saved("inbox/lisbon.md", {
    kind: "quote",
    url: "https://en.wikipedia.org/wiki/Lisbon_(city)",
    title: "Lisbon",
    text: "Lisbon is the **capital** of Portugal.",
  }),
  saved("inbox/tram.md", { kind: "image", url: "https://a.com/tram.jpg", title: "Tram 28", text: "" }, {
    saved: "2026-09-10",
    tags: ["travel", 3],
  }),
  saved("inbox/rust.md", { kind: "link", url: "https://blog.rust-lang.org/", title: "Rust blog", text: "" }, {
    saved: "2026-09-12",
  }),
  { path: "inbox/typed.md", title: "Typed by hand", content: "# Heading\n\nSee [the site](https://x.com) and [[other note|Other]].", frontmatter: { type: "weird" } },
  { path: "work/plan.md", title: "Plan", content: "not in the inbox", frontmatter: { type: "page" } },
];

describe("plainText", () => {
  it("keeps the words and drops the markup", () => {
    expect(plainText("# Title\n\n> A **bold** [link](https://x.com) and `code`\n\n![pic](https://x.com/p.png) [[a|b]]")).toBe(
      "Title A bold link and code b",
    );
    expect(plainText("On \\[brackets\\]")).toBe("On [brackets]");
  });
});

describe("mindItems", () => {
  const items = mindItems(NOTES);

  it("reads only the inbox, newest first", () => {
    expect(items.map((item) => item.path)).toEqual([
      "inbox/lisbon.md",
      "inbox/rust.md",
      "inbox/tram.md",
      "inbox/typed.md",
    ]);
  });

  it("turns each note back into what was saved", () => {
    const [lisbon, rust, tram, typed] = items;
    expect(lisbon).toMatchObject({
      kind: "quote",
      site: "en.wikipedia.org",
      saved: "2026-09-13",
      excerpt: "Lisbon is the capital of Portugal.",
      image: null,
    });
    expect(rust).toMatchObject({ kind: "link", excerpt: "Rust blog" });
    expect(tram).toMatchObject({ kind: "image", image: "https://a.com/tram.jpg", tags: ["travel"] });
    expect(typed).toMatchObject({ kind: "page", url: null, saved: null, excerpt: "Heading See the site and Other." });
  });

  it("does not offer a picture that is not a web address", () => {
    const [item] = mindItems([
      { path: "inbox/x.md", title: "x", content: "![a](javascript:alert(1))", frontmatter: {} },
    ]);
    expect(item!.image).toBeNull();
  });
});

describe("filterMind and countByKind", () => {
  const items = mindItems(NOTES);

  it("filters by kind and by every word typed", () => {
    expect(filterMind(items, "image", "").map((item) => item.title)).toEqual(["Tram 28"]);
    expect(filterMind(items, "all", "portugal capital").map((item) => item.title)).toEqual(["Lisbon"]);
    expect(filterMind(items, "all", "travel").map((item) => item.title)).toEqual(["Tram 28"]);
    expect(filterMind(items, "link", "portugal")).toEqual([]);
  });

  it("counts each kind", () => {
    expect(countByKind(items)).toEqual({ all: 4, page: 1, quote: 1, image: 1, link: 1 });
  });
});
