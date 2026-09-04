import { describe, expect, it } from "vitest";
import { ApiError } from "./api-helpers";
import {
  bookAssetPath,
  bookDir,
  bookFilePath,
  bookUrl,
  chapterPath,
  chapterUrl,
  filesToDelete,
  pagePath,
  pageUrl,
  parseManifest,
  serializeManifest,
  slugOfPage,
  type BookManifest,
} from "./publish";

/**
 * The slug becomes a path in the user's repository and a segment of a public
 * URL, so the cases that matter are the hostile ones: a name that is really a
 * path, or one that climbs out of the folder it is meant to be written into.
 */

describe("pagePath", () => {
  it("puts an ordinary note under docs/", () => {
    expect(pagePath("q3-roadmap")).toBe("docs/q3-roadmap.html");
    expect(pagePath("notes_2026.v2")).toBe("docs/notes_2026.v2.html");
  });

  it("lowercases, so one note cannot have two addresses", () => {
    expect(pagePath("Q3-Roadmap")).toBe("docs/q3-roadmap.html");
  });

  it("refuses anything that would write outside docs/", () => {
    for (const slug of [
      "",
      " ",
      "..",
      "../index",
      "a/b",
      "/etc/passwd",
      ".hidden",
      "-leading",
      "has space",
      "quote'",
      "x".repeat(90),
    ]) {
      expect(() => pagePath(slug)).toThrow(ApiError);
    }
  });

  it("refuses a missing slug rather than inventing one", () => {
    expect(() => pagePath(undefined)).toThrow(ApiError);
  });
});

describe("pageUrl", () => {
  it("joins the site and the page without doubling the slash", () => {
    expect(pageUrl("https://me.github.io/notes/", "roadmap")).toBe(
      "https://me.github.io/notes/roadmap.html",
    );
    expect(pageUrl("https://me.github.io/notes", "roadmap")).toBe(
      "https://me.github.io/notes/roadmap.html",
    );
  });
});

/**
 * Reading the folder back is how the app knows what is published, so the
 * question this answers is "did ForkLeaf write this file". `docs/` is an
 * ordinary folder people keep ordinary things in, and offering to unpublish
 * somebody's hand-written site would be worse than not listing it at all.
 */
describe("slugOfPage", () => {
  it("recognises a page this app would have written", () => {
    expect(slugOfPage("q3-roadmap.html")).toBe("q3-roadmap");
    expect(slugOfPage("notes_2026.v2.html")).toBe("notes_2026.v2");
  });

  it("matches the address the page was published at, not its spelling", () => {
    // `pagePath` lowercases, so the file on disk is lowercase and this is the
    // slug that will round-trip back through it.
    expect(slugOfPage("Q3-Roadmap.html")).toBe("q3-roadmap");
  });

  it("passes over anything that is not one of its pages", () => {
    for (const name of [
      "index.md",
      "README.md",
      "style.css",
      ".nojekyll",
      "-leading.html",
      "x".repeat(90) + ".html",
      "html",
      "",
    ]) {
      expect(slugOfPage(name)).toBeNull();
    }
  });

  it("agrees with pagePath, so a listed page can always be unpublished", () => {
    const slug = slugOfPage("q3-roadmap.html")!;
    expect(pagePath(slug)).toBe("docs/q3-roadmap.html");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   Books
   ──────────────────────────────────────────────────────────────────────────── */

describe("bookDir", () => {
  it("puts a book in its own folder under docs/", () => {
    expect(bookDir("handbook")).toBe("docs/handbook");
    expect(bookDir("Handbook")).toBe("docs/handbook");
  });

  it("allows exactly one level of nesting and no more", () => {
    for (const book of ["", " ", "..", "../evil", "a/b", "/etc", ".hidden", "-x", "x".repeat(90)]) {
      expect(() => bookDir(book)).toThrow(ApiError);
    }
  });
});

describe("chapterPath", () => {
  it("addresses a chapter inside its book", () => {
    expect(chapterPath("handbook", "onboarding")).toBe("docs/handbook/onboarding.html");
  });

  it("refuses a chapter that would replace the contents page", () => {
    // The cover is `index.html`; a chapter published there would leave the book
    // building, deploying, and with no way in.
    expect(() => chapterPath("handbook", "index")).toThrow(ApiError);
    expect(() => chapterPath("handbook", "INDEX")).toThrow(ApiError);
  });

  it("refuses a chapter that would climb out of the book", () => {
    for (const slug of ["..", "../../index", "a/b", ""]) {
      expect(() => chapterPath("handbook", slug)).toThrow(ApiError);
    }
  });

  it("refuses a good chapter in a bad book", () => {
    expect(() => chapterPath("../..", "onboarding")).toThrow(ApiError);
  });
});

describe("bookAssetPath", () => {
  it("addresses a shared file", () => {
    expect(bookAssetPath("handbook", "style.css")).toBe("docs/handbook/assets/style.css");
    expect(bookAssetPath("handbook", "search.json")).toBe("docs/handbook/assets/search.json");
  });

  it("ships only what a book needs", () => {
    for (const name of ["deploy.sh", "index.html", "..", "../style.css", "a/b.css", "noext"]) {
      expect(() => bookAssetPath("handbook", name)).toThrow(ApiError);
    }
  });
});

describe("bookUrl / chapterUrl", () => {
  it("addresses the book as a directory, so the cover is served for it", () => {
    expect(bookUrl("https://me.github.io/notes/", "handbook")).toBe(
      "https://me.github.io/notes/handbook/",
    );
    expect(chapterUrl("https://me.github.io/notes", "handbook", "onboarding")).toBe(
      "https://me.github.io/notes/handbook/onboarding.html",
    );
  });
});

/**
 * The manifest is a file in somebody's repository, so it is a file somebody can
 * edit. Everything below treats it as a claim to be checked rather than an
 * instruction to carry out — because the operation it authorises is deletion.
 */
describe("parseManifest", () => {
  const manifest: BookManifest = {
    version: 1,
    book: "handbook",
    title: "The Handbook",
    publishedAt: "2026-09-04T00:00:00.000Z",
    chapters: [{ slug: "onboarding", title: "Onboarding", source: "notes/onboarding.md" }],
    files: ["docs/handbook/index.html", "docs/handbook/onboarding.html"],
  };

  it("round-trips what it wrote", () => {
    expect(parseManifest(serializeManifest(manifest), "handbook")).toEqual(manifest);
  });

  it("is not a book if it cannot be read", () => {
    for (const json of ["", "{", "null", "[]", '"handbook"', "42"]) {
      expect(parseManifest(json, "handbook")).toBeNull();
    }
  });

  it("is not a book if it describes a different one", () => {
    // A manifest that was copied or moved names paths in another folder.
    // Believing it would delete them.
    expect(parseManifest(serializeManifest(manifest), "other-book")).toBeNull();
  });

  it("is not a book if it is a version this app cannot read", () => {
    expect(parseManifest(JSON.stringify({ ...manifest, version: 2 }), "handbook")).toBeNull();
  });

  it("is not a book if a chapter is not addressable", () => {
    const bad = { ...manifest, chapters: [{ slug: "../escape", title: "x", source: "" }] };
    expect(parseManifest(JSON.stringify(bad), "handbook")).toBeNull();
  });
});

describe("filesToDelete", () => {
  const of = (files: string[]): string[] =>
    filesToDelete({
      version: 1,
      book: "handbook",
      title: "The Handbook",
      publishedAt: "",
      chapters: [],
      files,
    });

  it("returns the book's own files", () => {
    expect(
      of([
        "docs/handbook/index.html",
        "docs/handbook/onboarding.html",
        "docs/handbook/assets/style.css",
        "docs/handbook/forkleaf-book.json",
      ]),
    ).toEqual([
      "docs/handbook/assets/style.css",
      "docs/handbook/forkleaf-book.json",
      "docs/handbook/index.html",
      "docs/handbook/onboarding.html",
    ]);
  });

  it("never deletes outside the book, however the manifest asks", () => {
    expect(
      of([
        "docs/other-book/index.html",
        "docs/handbook/../../.github/workflows/ci.yml",
        "docs/handbook/./../index.html",
        "../../../etc/passwd",
        "README.md",
        "docs/index.html",
        "docs/handbookish/index.html",
      ]),
    ).toEqual([]);
  });

  it("never deletes a file inside the book that ForkLeaf did not write", () => {
    // Somebody's own file, dropped into the book's folder and then named in a
    // hand-edited manifest. It is theirs, and it stays.
    expect(
      of([
        "docs/handbook/CNAME",
        "docs/handbook/notes.md",
        "docs/handbook/assets/deploy.sh",
        "docs/handbook/assets/nested/deep.css",
        "docs/handbook/drafts/chapter.html",
      ]),
    ).toEqual([]);
  });

  it("does not delete the same file twice", () => {
    expect(of(["docs/handbook/index.html", "docs/handbook/INDEX.html"])).toEqual([
      "docs/handbook/index.html",
    ]);
  });
});

/**
 * The file list arrives over HTTP, which makes it a list of requests to write
 * into somebody's repository. Everything below is about the ones that should
 * not be honoured.
 */
describe("bookFilePath", () => {
  it("places the files a book is made of", () => {
    expect(bookFilePath("handbook", "index.html")).toBe("docs/handbook/index.html");
    expect(bookFilePath("handbook", "setup.html")).toBe("docs/handbook/setup.html");
    expect(bookFilePath("handbook", "assets/style.css")).toBe("docs/handbook/assets/style.css");
    expect(bookFilePath("handbook", "forkleaf-book.json")).toBe("docs/handbook/forkleaf-book.json");
  });

  it("refuses anything that is not one of them", () => {
    for (const file of [
      "",
      "notes.md",
      "CNAME",
      ".nojekyll",
      "deploy.sh",
      "assets/deploy.sh",
      "assets/nested/style.css",
      "drafts/chapter.html",
      "../../.github/workflows/ci.yml",
      "../escape.html",
      "/etc/passwd",
    ]) {
      expect(() => bookFilePath("handbook", file)).toThrow(ApiError);
    }
  });

  it("agrees with filesToDelete, so everything written can be removed again", () => {
    const written = ["index.html", "setup.html", "assets/style.css", "forkleaf-book.json"].map(
      (file) => bookFilePath("handbook", file),
    );

    expect(
      filesToDelete({
        version: 1,
        book: "handbook",
        title: "",
        publishedAt: "",
        chapters: [],
        files: written,
      }),
    ).toEqual([...written].sort());
  });
});
