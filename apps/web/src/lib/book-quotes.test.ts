import { describe, expect, it } from "vitest";
import { bookNote, bookTitles, quotesIn, tidyPassage, withQuote } from "./book-quotes";
import { passagesIn } from "./spaced-reading";

describe("book notes", () => {
  it("starts a note marked as a book, with its author", () => {
    expect(bookNote('The "Pragmatic" Programmer', "Hunt & Thomas")).toBe(
      [
        "---",
        'title: "The \\"Pragmatic\\" Programmer"',
        "type: book",
        'author: "Hunt & Thomas"',
        "tags: [book]",
        "---",
        "",
        '# The "Pragmatic" Programmer',
        "",
        "By Hunt & Thomas",
        "",
      ].join("\n"),
    );
  });

  it("adds a quote with its page and date, once", () => {
    const first = withQuote(bookNote("Dune", null), {
      text: "Fear is the mind-\nkiller.",
      page: "8",
      date: "2026-10-12",
    });
    expect(first.added).toBe(true);
    expect(
      first.content.endsWith("# Dune\n\n> Fear is the mindkiller.\n> — p. 8 · 2026-10-12\n"),
    ).toBe(true);
    expect(
      withQuote(first.content, { text: "Fear is the mindkiller.", page: "9", date: "x" }).added,
    ).toBe(false);
  });

  it("adds a quote with no page", () => {
    expect(withQuote("# B", { text: "Hello there", page: null, date: "2026-10-12" }).content).toBe(
      "# B\n\n> Hello there\n> — 2026-10-12\n",
    );
  });

  it("reads quotes back, with their pages and lines", () => {
    const content =
      "# Dune\n\n> Fear is the mind-killer.\n> — p. 8 · 2026-10-12\n\n> A long passage\n> over two lines.\n> — p. xii · 2026-10-13\n\n> Unattributed.";
    expect(quotesIn(content)).toEqual([
      { text: "Fear is the mind-killer.", page: "8", line: 3 },
      { text: "A long passage over two lines.", page: "xii", line: 6 },
      { text: "Unattributed.", page: null, line: 10 },
    ]);
  });

  it("lists the books in the notebook", () => {
    expect(
      bookTitles([
        { path: "books/b.md", title: "B", frontmatter: { type: "book", author: "Ann" } },
        { path: "notes/x.md", title: "X", frontmatter: {} },
        { path: "books/a.md", title: "A", frontmatter: { type: "book" } },
      ]),
    ).toEqual([
      { title: "A", path: "books/a.md", author: null },
      { title: "B", path: "books/b.md", author: "Ann" },
    ]);
  });

  it("tidies a recognised passage onto one line", () => {
    expect(tidyPassage("  one\n two   three-\nfour ")).toBe("one two threefour");
  });
});

describe("spaced reading picks book quotes up", () => {
  it("offers each quote with its page", () => {
    const passages = passagesIn({
      path: "books/dune.md",
      title: "Dune",
      frontmatter: { type: "book" },
      content: "# Dune\n\n> I must not fear. Fear is the mind-killer.\n> — p. 8 · 2026-10-12\n",
    });
    expect(passages).toEqual([
      expect.objectContaining({
        text: "I must not fear. Fear is the mind-killer.",
        where: "p. 8",
        source: "Dune",
        path: "books/dune.md",
      }),
    ]);
  });
});
