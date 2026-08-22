import { describe, it, expect } from "vitest";
import {
  parseDocument,
  serializeDocument,
  updateFrontmatter,
  extractOutline,
  extractMermaidBlocks,
  documentStats,
  deriveTitle,
  extractTags,
  markdownToHtml,
  normalizePath,
  slugifyFilename,
  uniquePath,
  relativeToDirectory,
} from "./index";

describe("frontmatter", () => {
  it("splits frontmatter from the body", () => {
    const raw = "---\ntitle: My Note\ntags:\n  - a\n  - b\n---\n\n# Heading\n\nBody.";
    const doc = parseDocument(raw);

    expect(doc.hadFrontmatter).toBe(true);
    expect(doc.frontmatter.title).toBe("My Note");
    expect(doc.frontmatter.tags).toEqual(["a", "b"]);
    expect(doc.content).toBe("\n# Heading\n\nBody.");
  });

  it("treats a file with no frontmatter as all body", () => {
    const doc = parseDocument("# Just a heading");
    expect(doc.hadFrontmatter).toBe(false);
    expect(doc.frontmatter).toEqual({});
    expect(doc.content).toBe("# Just a heading");
  });

  it("keeps the whole file as body when the YAML is broken, losing nothing", () => {
    const raw = "---\ntitle: [unclosed\n---\n\nImportant content.";
    const doc = parseDocument(raw);
    expect(doc.content).toContain("Important content.");
    expect(doc.content).toContain("unclosed");
  });

  it("handles CRLF line endings from files edited on Windows", () => {
    const doc = parseDocument("---\r\ntitle: Win\r\n---\r\n\r\nBody");
    expect(doc.frontmatter.title).toBe("Win");
    expect(doc.content.trim()).toBe("Body");
  });

  it("does not mistake a horizontal rule for frontmatter", () => {
    const doc = parseDocument("Some text\n\n---\n\nMore text");
    expect(doc.hadFrontmatter).toBe(false);
    expect(doc.content).toContain("Some text");
  });

  it("ignores a YAML document that is a list rather than a map", () => {
    const doc = parseDocument("---\n- one\n- two\n---\n\nBody");
    expect(doc.frontmatter).toEqual({});
    expect(doc.content.trim()).toBe("Body");
  });

  it("round-trips through serialize", () => {
    const raw = "---\ntitle: Round Trip\ntags:\n  - x\n---\n\nBody text.\n";
    const doc = parseDocument(raw);
    const reparsed = parseDocument(serializeDocument(doc.content, doc.frontmatter));

    expect(reparsed.frontmatter).toEqual(doc.frontmatter);
    expect(reparsed.content.trim()).toBe("Body text.");
  });

  it("emits no frontmatter block when there are no properties", () => {
    expect(serializeDocument("Body", {})).toBe("Body");
  });

  it("removes a property when it is updated to undefined", () => {
    const result = updateFrontmatter({ title: "T", tags: ["a"] }, { tags: undefined });
    expect(result).toEqual({ title: "T" });
    expect("tags" in result).toBe(false);
  });
});

describe("analysis", () => {
  it("extracts a heading outline with deduplicated github-style anchors", () => {
    const outline = extractOutline("# Setup\n\n## Notes\n\n### Deep\n\n## Notes");

    expect(outline.map((h) => [h.depth, h.text, h.slug])).toEqual([
      [1, "Setup", "setup"],
      [2, "Notes", "notes"],
      [3, "Deep", "deep"],
      [2, "Notes", "notes-1"],
    ]);
  });

  it("finds mermaid blocks and ignores other code fences", () => {
    const md = "```js\nconsole.log(1)\n```\n\n```mermaid\ngraph TD\n  A-->B\n```\n";
    const blocks = extractMermaidBlocks(md);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.code).toBe("graph TD\n  A-->B");
    expect(md.slice(blocks[0]!.start, blocks[0]!.end)).toContain("```mermaid");
  });

  it("counts words, tasks and diagrams", () => {
    const md =
      "# Title\n\nHello world here.\n\n- [x] done\n- [ ] todo\n\n```mermaid\ngraph TD\n```\n";
    const stats = documentStats(md);

    expect(stats.tasks).toEqual({ total: 2, done: 1 });
    expect(stats.diagrams).toBe(1);
    expect(stats.headings).toBe(1);
    expect(stats.words).toBeGreaterThan(3);
  });

  it("reports zero reading time for an empty document", () => {
    expect(documentStats("").readingMinutes).toBe(0);
  });

  it("counts code blocks, links and images", () => {
    const md = [
      "See [the docs](https://example.com) and [a ref][ref].",
      "",
      "![a picture](cat.png)",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "```mermaid",
      "graph TD",
      "```",
      "",
      "Inline `code` is not a block.",
      "",
      "[ref]: https://example.com",
    ].join("\n");

    const stats = documentStats(md);

    expect(stats.links).toBe(2);
    expect(stats.images).toBe(1);
    // Mermaid fences are code blocks too, and are also counted as diagrams.
    expect(stats.codeBlocks).toBe(2);
    expect(stats.diagrams).toBe(1);
  });

  it("counts an image inside a link as both", () => {
    const stats = documentStats("[![badge](badge.svg)](https://example.com)");

    expect(stats.links).toBe(1);
    expect(stats.images).toBe(1);
  });

  it("leaves empty headings out of the count, as the outline does", () => {
    const md = "# Real\n\n##\n\n### Also real\n";

    expect(documentStats(md).headings).toBe(extractOutline(md).length);
    expect(documentStats(md).headings).toBe(2);
  });

  it("prefers a frontmatter title, then an H1, then the filename", () => {
    expect(deriveTitle("# Heading", "Front", "file.md")).toBe("Front");
    expect(deriveTitle("# Heading", undefined, "file.md")).toBe("Heading");
    expect(deriveTitle("no heading", undefined, "notes/my-file.md")).toBe("my-file");
    expect(deriveTitle("", "   ", "a.md")).toBe("a");
  });

  it("merges frontmatter tags with inline hashtags but skips markdown headings", () => {
    const tags = extractTags("# Not a tag\n\nSee #project and #deep/nested here.", ["manual"]);
    expect(tags).toEqual(["deep/nested", "manual", "project"]);
  });
});

describe("rendering", () => {
  it("renders gfm tables and task lists", () => {
    const html = markdownToHtml("| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done");
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
  });

  it("strips script tags from untrusted note content", () => {
    // Notes can come from a public repo the user only reads, so this is a real
    // stored-XSS vector, not a theoretical one.
    const html = markdownToHtml("Hello <script>alert(1)</script> world");
    // The tag itself must be gone. Its inner text surviving as inert plain text
    // is fine and is what the sanitiser is supposed to do.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script");
  });

  it("strips javascript: URLs from links", () => {
    const html = markdownToHtml("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("strips inline event handlers", () => {
    const html = markdownToHtml('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });
});

describe("paths", () => {
  it("refuses to escape the repo root via ..", () => {
    expect(normalizePath("../../etc/passwd")).toBe("etc/passwd");
    expect(normalizePath("/leading/slash.md")).toBe("leading/slash.md");
    expect(normalizePath("a//b/./c.md")).toBe("a/b/c.md");
  });

  it("makes filenames safe on every platform", () => {
    expect(slugifyFilename("My Note: Draft #1?")).toBe("my-note-draft-1");
    expect(slugifyFilename("  ///  ")).toBe("untitled");
    expect(slugifyFilename("Café Über")).toBe("cafe-uber");
  });

  it("finds a non-colliding path", () => {
    expect(uniquePath("note.md", ["note.md", "note-2.md"])).toBe("note-3.md");
    expect(uniquePath("free.md", ["note.md"])).toBe("free.md");
  });

  it("strips a workspace directory prefix", () => {
    expect(relativeToDirectory("docs/notes/a.md", "docs")).toBe("notes/a.md");
    expect(relativeToDirectory("a.md", "")).toBe("a.md");
  });
});

describe("images and highlights", () => {
  it("rewrites a repository-relative image through the resolver", () => {
    const html = markdownToHtml("![a chart](../assets/chart.png)", {
      resolveImageSrc: (src) => `/api/gh/raw?path=${encodeURIComponent(src)}`,
    });

    expect(html).toContain('src="/api/gh/raw?path=..%2Fassets%2Fchart.png"');
    expect(html).toContain('alt="a chart"');
    expect(html).toContain('loading="lazy"');
  });

  it("leaves images alone when no resolver is given", () => {
    expect(markdownToHtml("![](../assets/chart.png)")).toContain('src="../assets/chart.png"');
  });

  it("keeps a raster data URL, which is how an offline note stores its images", () => {
    const html = markdownToHtml("![](data:image/png;base64,iVBORw0KGgo=)");
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("drops a data URL that is a document rather than a raster image", () => {
    const html = markdownToHtml("![](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)");
    expect(html).not.toContain("svg+xml");
    expect(html).toContain("<img");
  });

  it("renders ==highlight== as a mark, which is what the editor writes", () => {
    expect(markdownToHtml("some ==important== text")).toContain("<mark>important</mark>");
  });

  it("leaves lone equals signs alone", () => {
    const html = markdownToHtml("`2 == 2` and a == b");
    expect(html).not.toContain("<mark>");
  });

  it("does not highlight across a line break", () => {
    expect(markdownToHtml("==open\nclose==")).not.toContain("<mark>");
  });
});
