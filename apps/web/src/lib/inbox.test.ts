import { describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "@forkleaf/markdown-engine";
import {
  bookmarklet,
  findSaved,
  inboxNote,
  isSaveRequest,
  parseSaveRequest,
  safeUrl,
  siteOf,
  titleFor,
} from "./inbox";

const params = (query: Record<string, string>) => new URLSearchParams(query);
const NOW = new Date(2026, 8, 13, 10);

describe("safeUrl", () => {
  it("accepts http and https only", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl(" http://example.com ")).toBe("http://example.com/");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl(`https://example.com/${"a".repeat(3000)}`)).toBeNull();
  });
});

describe("parseSaveRequest", () => {
  it("ignores an ordinary editor address", () => {
    expect(isSaveRequest(params({ note: "a.md" }))).toBe(false);
    expect(parseSaveRequest(params({ note: "a.md" }))).toBeNull();
  });

  it("reads the save address, guessing the kind from what came with it", () => {
    expect(parseSaveRequest(params({ save: "1", url: "https://a.com", title: "A" }))).toEqual({
      kind: "link",
      url: "https://a.com/",
      title: "A",
      text: "",
    });
    expect(
      parseSaveRequest(params({ save: "1", url: "https://a.com", text: "a sentence" }))?.kind,
    ).toBe("quote");
    expect(parseSaveRequest(params({ save: "1", text: "just a thought" }))?.kind).toBe("page");
  });

  it("reads the share sheet's spelling, and finds the link Android puts in the text", () => {
    expect(
      parseSaveRequest(
        params({ share_title: "Rust 2027", share_text: "Rust 2027 https://blog.rust-lang.org/x" }),
      ),
    ).toEqual({
      kind: "quote",
      url: "https://blog.rust-lang.org/x",
      title: "Rust 2027",
      text: "Rust 2027",
    });
  });

  it("drops an unsafe address rather than saving it", () => {
    const request = parseSaveRequest(
      params({ save: "1", url: "javascript:alert(1)", title: "Totally safe" }),
    );
    expect(request?.url).toBeNull();
  });

  it("honours an explicit kind, but not an unknown one, and not an image with no address", () => {
    expect(
      parseSaveRequest(params({ save: "1", kind: "page", url: "https://a.com", text: "x" }))?.kind,
    ).toBe("page");
    expect(
      parseSaveRequest(params({ save: "1", kind: "script", url: "https://a.com" }))?.kind,
    ).toBe("link");
    expect(parseSaveRequest(params({ save: "1", kind: "image", text: "pic" }))).toBeNull();
  });

  it("cleans and caps what it is given, and refuses an empty request", () => {
    const request = parseSaveRequest(
      params({
        save: "1",
        title: `  a\n\tb${String.fromCharCode(7)} ${"x".repeat(400)}`,
        text: "one\r\n\r\n\r\n\r\ntwo",
      }),
    );
    expect(request?.title.startsWith("a b ")).toBe(true);
    expect(request?.title.length).toBe(300);
    expect(request?.text).toBe("one\n\ntwo");
    expect(parseSaveRequest(params({ save: "1" }))).toBeNull();
  });
});

describe("titleFor and siteOf", () => {
  it("falls back to the first line, then the site", () => {
    expect(titleFor({ kind: "page", url: null, title: "", text: "\n  First line\nsecond" })).toBe(
      "First line",
    );
    expect(titleFor({ kind: "link", url: "https://www.example.com/x", title: "", text: "" })).toBe(
      "example.com",
    );
    expect(siteOf("nope")).toBeNull();
  });
});

describe("inboxNote", () => {
  it("writes a quote as a blockquote with its source", () => {
    const note = inboxNote(
      {
        kind: "quote",
        url: "https://a.com/p",
        title: "On [brackets]",
        text: "line one\n\nline two",
      },
      NOW,
    );
    expect(note.content).toBe(
      "> line one\n>\n> line two\n\n— [On \\[brackets\\]](https://a.com/p)\n",
    );
    expect(note.frontmatter).toEqual({
      type: "quote",
      url: "https://a.com/p",
      site: "a.com",
      saved: "2026-09-13",
    });
  });

  it("writes a link, an image, and a thought with no address", () => {
    expect(
      inboxNote({ kind: "link", url: "https://a.com/(x)", title: "A", text: "" }, NOW).content,
    ).toBe("[A](https://a.com/%28x%29)\n");
    expect(
      inboxNote({ kind: "image", url: "https://a.com/i.png", title: "Pic", text: "" }, NOW).content,
    ).toBe("![Pic](https://a.com/i.png)\n");
    const thought = inboxNote({ kind: "page", url: null, title: "", text: "remember this" }, NOW);
    expect(thought.content).toBe("remember this\n");
    expect(thought.frontmatter).toEqual({ type: "page", saved: "2026-09-13" });
  });

  it("survives being written as a file and read back", () => {
    const note = inboxNote(
      { kind: "page", url: "https://a.com", title: "x: y # z", text: "---\nnot front matter" },
      NOW,
    );
    const parsed = parseDocument(
      serializeDocument(note.content, { title: note.title, ...note.frontmatter }),
    );
    expect(parsed.frontmatter.title).toBe("x: y # z");
    expect(parsed.content).toContain("---\nnot front matter");
  });
});

describe("findSaved", () => {
  const notes = [
    { path: "inbox/a.md", frontmatter: { url: "https://a.com/", type: "link" } },
    { path: "work/a.md", frontmatter: { url: "https://b.com/", type: "link" } },
  ];

  it("finds a link already in the inbox, and never treats quotes as duplicates", () => {
    expect(
      findSaved(notes, { kind: "link", url: "https://a.com/", title: "", text: "" })?.path,
    ).toBe("inbox/a.md");
    expect(
      findSaved(notes, { kind: "link", url: "https://b.com/", title: "", text: "" }),
    ).toBeNull();
    expect(
      findSaved(notes, { kind: "quote", url: "https://a.com/", title: "", text: "x" }),
    ).toBeNull();
  });
});

describe("bookmarklet", () => {
  it("opens this deployment's save address with the page and the selection", () => {
    const code = bookmarklet("https://forkleaf.app");
    expect(code.startsWith("javascript:")).toBe(true);
    expect(code).toContain('"https://forkleaf.app/editor?save=1"');
    expect(code).toContain("encodeURIComponent(location.href)");
    expect(code).toContain("noopener");
  });
});
