import { describe, expect, it } from "vitest";
import { assignSlugs, buildBook, chapterSlug, readMinutes, type BookNote } from "./book";

const note = (path: string, markdown = "Body.", title?: string): BookNote => ({
  path,
  title: title ?? path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, ""),
  markdown,
  frontmatter: {},
});

const build = (notes: BookNote[], title = "Handbook") =>
  buildBook(notes, { title, theme: "light", renderDiagrams: false });

const fileAt = (files: { path: string; content: string }[], path: string) =>
  files.find((file) => file.path === path)?.content ?? "";

/**
 * A chapter's address is a URL somebody may link to, so the interesting inputs
 * are the filenames people actually have: spaces, capitals, accents, emoji,
 * leading dots, and the one called `index.md`.
 */
describe("chapterSlug", () => {
  it("takes the filename and drops the rest", () => {
    expect(chapterSlug("notes/deep/onboarding.md")).toBe("onboarding");
    expect(chapterSlug("onboarding.md")).toBe("onboarding");
  });

  it("lowercases and hyphenates what a URL cannot carry", () => {
    expect(chapterSlug("Q3 Roadmap.md")).toBe("q3-roadmap");
    expect(chapterSlug("Notes (draft).md")).toBe("notes-draft");
    expect(chapterSlug("a  b   c.md")).toBe("a-b-c");
  });

  it("keeps the characters a filename is allowed to keep", () => {
    expect(chapterSlug("notes_2026.v2.md")).toBe("notes_2026.v2");
    expect(chapterSlug("part-one.md")).toBe("part-one");
  });

  it("never starts with something that is not a letter or a digit", () => {
    expect(chapterSlug(".hidden.md")).toBe("hidden");
    expect(chapterSlug("-leading.md")).toBe("leading");
    expect(chapterSlug("__init__.md")).toBe("init");
  });

  it("never ends with a separator", () => {
    expect(chapterSlug("trailing-.md")).toBe("trailing");
    expect(chapterSlug("dotted..md")).toBe("dotted");
  });

  it("survives a name with nothing usable in it", () => {
    expect(chapterSlug("日本語.md")).toBe("chapter");
    expect(chapterSlug("🎉.md")).toBe("chapter");
    expect(chapterSlug("---.md")).toBe("chapter");
    expect(chapterSlug("")).toBe("chapter");
  });

  it("stays short enough to number", () => {
    expect(chapterSlug(`${"x".repeat(200)}.md`)).toHaveLength(70);
  });

  it("does not end in a separator the truncation put back", () => {
    // Cutting at 70 lands exactly on the hyphen this name's space became.
    expect(chapterSlug(`${"x".repeat(69)} tail.md`)).toBe("x".repeat(69));
  });

  it("only ever produces an address the publish route will accept", () => {
    const allowed = /^[a-z0-9][a-z0-9._-]{0,80}$/;
    for (const name of [
      "Q3 Roadmap.md",
      ".hidden.md",
      "日本語.md",
      "---.md",
      `${"x".repeat(200)}.md`,
      "a/b/c d.md",
      "!!!.md",
      "notes_2026.v2.md",
    ]) {
      expect(chapterSlug(name)).toMatch(allowed);
    }
  });
});

describe("assignSlugs", () => {
  it("numbers a collision instead of overwriting a chapter", () => {
    const chapters = assignSlugs([note("a/setup.md"), note("b/setup.md"), note("c/setup.md")]);
    expect(chapters.map((c) => c.slug)).toEqual(["setup", "setup-2", "setup-3"]);
  });

  it("gives the plain name to whichever note comes first in reading order", () => {
    const chapters = assignSlugs([note("b/setup.md"), note("a/setup.md")]);
    expect(chapters[0]!.source).toBe("b/setup.md");
    expect(chapters[0]!.slug).toBe("setup");
  });

  it("never lets a chapter take the contents page's address", () => {
    const chapters = assignSlugs([note("index.md"), note("Index.md"), note("guide.md")]);
    expect(chapters.map((c) => c.slug)).toEqual(["index-2", "index-3", "guide"]);
  });

  it("keeps every address distinct however the names collide", () => {
    const chapters = assignSlugs([
      note("Setup.md"),
      note("setup.md"),
      note("SET UP.md"),
      note("set-up.md"),
      note("日本語.md"),
      note("🎉.md"),
    ]);
    expect(new Set(chapters.map((c) => c.slug)).size).toBe(chapters.length);
  });

  it("remembers which note each chapter came from", () => {
    const chapters = assignSlugs([note("deep/nested/guide.md", "x", "The Guide")]);
    expect(chapters[0]).toEqual({
      slug: "guide",
      title: "The Guide",
      source: "deep/nested/guide.md",
    });
  });
});

describe("buildBook", () => {
  it("writes a contents page, a chapter each, and one shared stylesheet", async () => {
    const book = await build([note("intro.md"), note("setup.md")]);

    expect(book.files.map((f) => f.path)).toEqual([
      "index.html",
      "intro.html",
      "setup.html",
      "assets/style.css",
    ]);
  });

  it("ships the stylesheet once rather than in every chapter", async () => {
    const book = await build([note("a.md"), note("b.md"), note("c.md")]);

    for (const page of book.files.filter((f) => f.path.endsWith(".html"))) {
      expect(page.content).toContain('<link rel="stylesheet" href="assets/style.css">');
      expect(page.content).not.toContain("<style>");
    }
    expect(fileAt(book.files, "assets/style.css")).toContain("--accent");
  });

  it("lists every chapter on the contents page, in reading order", async () => {
    const book = await build([note("z.md", "x", "Last"), note("a.md", "x", "First")]);
    const cover = fileAt(book.files, "index.html");

    expect(cover.indexOf("Last")).toBeLessThan(cover.indexOf("First"));
    expect(cover).toContain('href="z.html"');
    expect(cover).toContain('href="a.html"');
    expect(cover).toContain("2 chapters");
  });

  it("counts one chapter without saying '1 chapters'", async () => {
    const book = await build([note("only.md")]);
    expect(fileAt(book.files, "index.html")).toContain("1 chapter ·");
  });

  it("escapes a title rather than letting it write markup", async () => {
    const book = await build([note("x.md", "Body.", "<img src=x onerror=alert(1)>")], "A & B");
    const cover = fileAt(book.files, "index.html");

    expect(cover).not.toContain("<img src=x");
    expect(cover).toContain("&lt;img");
    expect(cover).toContain("A &amp; B");
  });

  it("renders the note's markdown into the chapter", async () => {
    const book = await build([note("intro.md", "# Hello\n\nSome **bold** text.")]);
    const page = fileAt(book.files, "intro.html");

    expect(page).toContain("<strong>bold</strong>");
  });
});

/**
 * The reason books exist. On a single published page a `[[wikilink]]` renders
 * as `href="#target"` — an anchor to a heading that is not there — so every
 * link between notes is silently dead.
 */
describe("wikilinks between chapters", () => {
  const linked = () =>
    build([
      note("intro.md", "See [[setup]] and [[Deep Dive|the deep one]].", "Intro"),
      note("setup.md", "Back to [[intro]].", "Setup"),
      note("notes/deep-dive.md", "Alone.", "Deep Dive"),
    ]);

  it("links a chapter to the chapter it names", async () => {
    const book = await linked();
    expect(fileAt(book.files, "intro.html")).toContain('href="setup.html"');
    expect(fileAt(book.files, "setup.html")).toContain('href="intro.html"');
  });

  it("finds a chapter by its title, not only its filename", async () => {
    const book = await linked();
    expect(fileAt(book.files, "intro.html")).toContain('href="deep-dive.html"');
  });

  it("shows the alias the author wrote, not the target", async () => {
    const page = fileAt((await linked()).files, "intro.html");

    // Scoped to the links in the prose: the sidebar lists every chapter by its
    // own title, so "Deep Dive" appears on this page whatever the alias says.
    const labels = [...page.matchAll(/<a[^>]*class="fl-wikilink[^"]*"[^>]*>([^<]*)</g)].map(
      (match) => match[1],
    );

    expect(labels).toContain("the deep one");
    expect(labels).not.toContain("Deep Dive");
  });

  it("carries a heading anchor through to the chapter", async () => {
    const book = await build([
      note("intro.md", "See [[setup#installing]].", "Intro"),
      note("setup.md", "## Installing", "Setup"),
    ]);
    expect(fileAt(book.files, "intro.html")).toContain('href="setup.html#installing"');
  });

  it("never emits a dead link for a note outside the book", async () => {
    const book = await build([note("intro.md", "See [[some other note]].", "Intro")]);
    const page = fileAt(book.files, "intro.html");

    // The words survive; the broken address does not.
    expect(page).toContain("some other note");
    expect(page).not.toContain('href="#some');
    expect(page).toContain("fl-wikilink-missing");
  });

  it("does not link a wikilink written inside a code block", async () => {
    const book = await build([
      note("intro.md", "Use this:\n\n```\n[[setup]]\n```\n", "Intro"),
      note("setup.md", "x", "Setup"),
    ]);
    // Scoped to the block itself: the page as a whole does link `setup.html`,
    // from the next-chapter nav at the foot, and should.
    const block = /<pre><code>([\s\S]*?)<\/code><\/pre>/.exec(fileAt(book.files, "intro.html"));
    expect(block?.[1]).toContain("[[setup]]");
    expect(block?.[1]).not.toContain("<a ");
  });
});

describe("chapter navigation", () => {
  const three = () =>
    build([note("one.md", "x", "One"), note("two.md", "x", "Two"), note("three.md", "x", "Three")]);

  it("offers the next chapter but no previous one at the start", async () => {
    const book = await three();
    const page = fileAt(book.files, "one.html");

    expect(page).toContain('href="two.html"');
    expect(page).not.toContain("Previous");
  });

  it("offers both in the middle", async () => {
    const page = fileAt((await three()).files, "two.html");
    expect(page).toContain('href="one.html"');
    expect(page).toContain('href="three.html"');
  });

  it("offers the previous chapter but no next one at the end", async () => {
    const page = fileAt((await three()).files, "three.html");
    expect(page).toContain('href="two.html"');
    expect(page).not.toContain("Next");
  });

  it("says where in the book the reader is", async () => {
    const page = fileAt((await three()).files, "two.html");
    expect(page).toContain("2 of 3");
  });

  it("always offers the way back to the contents", async () => {
    const book = await three();
    for (const page of book.files.filter(
      (f) => f.path.endsWith(".html") && f.path !== "index.html",
    )) {
      expect(page.content).toContain('href="index.html"');
    }
  });
});

/**
 * Both ends of `[[chapter#heading]]` have to agree on one spelling. They did
 * not: headings carried no id at all, so every anchor in a book resolved to
 * nothing and the reader landed at the top of the chapter with no sign that
 * anything had gone wrong.
 */
describe("heading anchors", () => {
  it("gives every heading an id", async () => {
    const book = await build([
      note("guide.md", "# Top\n\n## Getting Started\n\n### Deep & Meaningful\n", "Guide"),
    ]);
    const page = fileAt(book.files, "guide.html");

    expect(page).toContain('id="top"');
    expect(page).toContain('id="getting-started"');
    expect(page).toContain('id="deep-meaningful"');
  });

  it("lands a link on the heading it names", async () => {
    const book = await build([
      note("intro.md", "See [[Guide#Getting Started]].", "Intro"),
      note("guide.md", "## Getting Started", "Guide"),
    ]);

    expect(fileAt(book.files, "intro.html")).toContain('href="guide.html#getting-started"');
    expect(fileAt(book.files, "guide.html")).toContain('id="getting-started"');
  });

  it("agrees however the reader spelled the anchor", async () => {
    for (const written of ["Getting Started", "getting started", "GETTING-STARTED"]) {
      const book = await build([
        note("intro.md", `See [[Guide#${written}]].`, "Intro"),
        note("guide.md", "## Getting Started", "Guide"),
      ]);
      expect(fileAt(book.files, "intro.html"), written).toContain(
        'href="guide.html#getting-started"',
      );
    }
  });

  it("numbers a repeated heading rather than letting two share an id", async () => {
    const book = await build([note("g.md", "## Notes\n\ntext\n\n## Notes\n", "G")]);
    const page = fileAt(book.files, "g.html");

    expect(page).toContain('id="notes"');
    expect(page).toContain('id="notes-2"');
  });

  it("still gives an id to a heading with nothing sluggable in it", async () => {
    const book = await build([note("g.md", "## 日本語\n\n## 🎉\n", "G")]);
    const page = fileAt(book.files, "g.html");

    expect(page).toContain('id="section"');
    expect(page).toContain('id="section-2"');
  });
});

/**
 * A published note is a document: one column, centred, nothing around it. A
 * book is a place, and a reader who arrives in the middle of one needs to see
 * that there is a middle to be in.
 */
describe("the contents beside the text", () => {
  const three = () =>
    build([note("one.md", "x", "One"), note("two.md", "x", "Two"), note("three.md", "x", "Three")]);

  it("lists every chapter on every chapter", async () => {
    const book = await three();

    for (const page of book.files.filter(
      (f) => f.path.endsWith(".html") && f.path !== "index.html",
    )) {
      for (const slug of ["one", "two", "three"]) {
        expect(page.content, page.path).toContain(`href="${slug}.html"`);
      }
    }
  });

  it("marks the chapter being read, and only that one", async () => {
    const page = fileAt((await three()).files, "two.html");
    const current = [...page.matchAll(/href="([a-z-]+)\.html" aria-current="page"/g)];

    expect(current).toHaveLength(1);
    expect(current[0]![1]).toBe("two");
  });

  /**
   * One list, laid out two ways. A details element cannot be forced open by a
   * stylesheet — browsers hide its contents in a way the display property does
   * not reach, which is how the first attempt at this shipped a sidebar that
   * was eighty-eight pixels of padding and nothing else.
   */
  it("is one list rather than a disclosure or a second copy", async () => {
    const page = fileAt((await three()).files, "one.html");

    expect(page).toContain('<nav class="book-side"');
    expect(page).not.toContain("<details");
    // Each chapter is linked from the sidebar once, and the current one is not
    // repeated as a second navigation block.
    expect(page.match(/href="two\.html"/g)).toHaveLength(2); // sidebar + next
    expect(page.match(/href="three\.html"/g)).toHaveLength(1); // sidebar only
  });

  it("offers a way past it to the words", async () => {
    const page = fileAt((await three()).files, "one.html");

    expect(page).toContain('class="book-skip" href="#content"');
    expect(page).toContain('<main id="content">');
  });

  it("leaves the contents page itself without a sidebar", async () => {
    expect(fileAt((await three()).files, "index.html")).not.toContain('class="book-side"');
  });
});

describe("how long a chapter takes", () => {
  it("counts the words, not the markup", () => {
    expect(readMinutes("word ".repeat(200))).toBe(1);
    expect(readMinutes("word ".repeat(1000))).toBe(5);
  });

  it("does not count a code block as reading", () => {
    const prose = "word ".repeat(200);
    const code = "```\n" + "token ".repeat(2000) + "\n```";

    expect(readMinutes(`${prose}\n\n${code}`)).toBe(1);
  });

  it("never says a chapter takes no time at all", () => {
    expect(readMinutes("")).toBe(1);
    expect(readMinutes("Hi.")).toBe(1);
  });

  it("says it on the chapter and on the contents page", async () => {
    const book = await build([note("long.md", "word ".repeat(1000), "Long")]);

    expect(fileAt(book.files, "long.html")).toContain("5 min read");
    expect(fileAt(book.files, "index.html")).toContain("5 min read");
  });

  it("adds the chapters up on the contents page", async () => {
    const book = await build([
      note("a.md", "word ".repeat(1000), "A"),
      note("b.md", "word ".repeat(1000), "B"),
    ]);

    expect(fileAt(book.files, "index.html")).toContain("2 chapters · 10 min read");
  });
});

describe("linking to a heading", () => {
  it("gives every heading a link to itself", async () => {
    const book = await build([note("g.md", "## Getting Started", "G")]);
    const page = fileAt(book.files, "g.html");

    expect(page).toContain('<a class="anchor" href="#getting-started"');
    expect(page).toContain('aria-label="Link to this section"');
  });

  it("points the link at the heading it is in", async () => {
    const book = await build([note("g.md", "## One\n\ntext\n\n## Two\n", "G")]);
    const page = fileAt(book.files, "g.html");

    expect(page).toMatch(/<h2 id="one">One<a class="anchor" href="#one"/);
    expect(page).toMatch(/<h2 id="two">Two<a class="anchor" href="#two"/);
  });

  it("keeps the marker out of the heading's own text", async () => {
    // In the markup the "#" becomes part of the heading — read aloud, and
    // copied — so the stylesheet draws it instead.
    const book = await build([note("g.md", "## Why a book?", "G")]);
    const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(fileAt(book.files, "g.html"))![1]!;

    expect(heading.replace(/<[^>]*>/g, "")).toBe("Why a book?");
  });

  it("does not let the anchor change the id it points at", async () => {
    // The id is taken from the heading's text before the link is added; if it
    // were taken after, the `#` would end up in the slug.
    const book = await build([note("g.md", "## Voice", "G")]);
    expect(fileAt(book.files, "g.html")).toContain('id="voice"');
    expect(fileAt(book.files, "g.html")).not.toContain('id="voice-"');
  });
});
