import { describe, it, expect } from "vitest";
import { toHtml, toPlainText, EXPORT_FORMATS } from "./index";
import type { ExportOptions } from "@forkleaf/types";

const options = (overrides: Partial<ExportOptions> = {}): ExportOptions => ({
  format: "html",
  title: "Test Note",
  includeFrontmatter: false,
  // Diagram rendering needs a browser; the diagram path is exercised by hand.
  renderDiagrams: false,
  theme: "light",
  ...overrides,
});

describe("toHtml", () => {
  it("produces a complete standalone document", async () => {
    const html = await toHtml("# Hello\n\nSome text.", {}, options());

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>Test Note</title>");
    // Styles are inlined so the file works with no network.
    expect(html).toContain("<style>");
    expect(html).not.toContain("<link");
    expect(html).toContain("<h1>Hello</h1>");
  });

  it("escapes the title rather than injecting it", async () => {
    const html = await toHtml("body", {}, options({ title: "</title><script>alert(1)</script>" }));

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("strips scripts from note content", async () => {
    // A note opened from someone else's public repo is untrusted input, and an
    // exported HTML file is opened directly in a browser with no sandbox.
    const html = await toHtml("Hi <script>alert(1)</script>", {}, options());

    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("onerror");
  });

  it("includes the frontmatter block only when asked", async () => {
    const withOut = await toHtml("Body", { title: "T", tags: ["x"] }, options());
    expect(withOut).not.toContain("tags:");

    const withIn = await toHtml(
      "Body",
      { title: "T", tags: ["x"] },
      options({ includeFrontmatter: true }),
    );
    expect(withIn).toContain("tags:");
  });

  it("leaves diagrams as code when rendering is off", async () => {
    const html = await toHtml("```mermaid\ngraph TD\n  A-->B\n```", {}, options());

    expect(html).toContain("graph TD");
    expect(html).toContain("<pre>");
  });

  it("carries print rules so PDF output paginates sensibly", async () => {
    const html = await toHtml("# Title", {}, options());
    expect(html).toContain("@media print");
    expect(html).toContain("break-inside: avoid");
  });

  it("switches palette for the dark theme", async () => {
    const light = await toHtml("x", {}, options({ theme: "light" }));
    const dark = await toHtml("x", {}, options({ theme: "dark" }));

    expect(light).toContain('data-theme="light"');
    expect(dark).toContain('data-theme="dark"');
    expect(light).not.toBe(dark);
  });

  it("renders gfm tables and task lists", async () => {
    const html = await toHtml("| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done", {}, options());
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
  });
});

describe("toPlainText", () => {
  it("strips markdown syntax but keeps the words", () => {
    const text = toPlainText(
      "# Title\n\nSome **bold** and _italic_ and `code`.\n\n- item one\n- item two\n",
    );

    expect(text).toContain("Title");
    expect(text).toContain("Some bold and italic and code.");
    expect(text).toContain("item one");
    expect(text).not.toContain("**");
    expect(text).not.toContain("#");
  });

  it("keeps link text and drops the URL", () => {
    expect(toPlainText("See [the docs](https://example.com) here.")).toBe("See the docs here.");
  });

  it("keeps image alt text", () => {
    expect(toPlainText("![a diagram](x.png)")).toBe("a diagram");
  });

  it("keeps code block contents without the fences", () => {
    const text = toPlainText("```js\nconst a = 1;\n```");
    expect(text).toContain("const a = 1;");
    expect(text).not.toContain("```");
  });

  it("flattens task lists and quotes", () => {
    const text = toPlainText("> quoted\n\n- [x] done\n- [ ] todo");
    expect(text).toContain("quoted");
    expect(text).toContain("done");
    expect(text).not.toContain("[x]");
    expect(text).not.toContain(">");
  });

  it("turns table rows into tab-separated lines", () => {
    const text = toPlainText("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(text).toContain("a\tb");
    expect(text).toContain("1\t2");
  });

  it("collapses runs of blank lines", () => {
    expect(toPlainText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("format catalogue", () => {
  it("gives every format a label, description and extension", () => {
    for (const format of EXPORT_FORMATS) {
      expect(format.label.length).toBeGreaterThan(0);
      expect(format.description.length).toBeGreaterThan(0);
      expect(format.extension).toMatch(/^[a-z]+$/);
    }
  });

  it("has no duplicate formats", () => {
    const names = EXPORT_FORMATS.map((f) => f.format);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("toHtml — images", () => {
  const PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("inlines a relative image, which is what makes it survive the export", async () => {
    const html = await toHtml("![Chart](../assets/chart.png)", {}, options(), async (src) =>
      src === "../assets/chart.png" ? PIXEL : null,
    );

    expect(html).toContain(`src="${PIXEL}"`);
    expect(html).not.toContain("../assets/chart.png");
  });

  it("leaves the path alone when the image cannot be found", async () => {
    const html = await toHtml("![Gone](../assets/gone.png)", {}, options(), async () => null);

    expect(html).toContain("../assets/gone.png");
  });

  it("keeps producing the document when one image throws", async () => {
    const html = await toHtml("![One](../a.png) ![Two](../b.png)", {}, options(), async (src) => {
      if (src === "../a.png") throw new Error("unreadable");
      return PIXEL;
    });

    expect(html).toContain("../a.png");
    expect(html).toContain(`src="${PIXEL}"`);
  });

  it("asks for each distinct source once, however often it appears", async () => {
    const seen: string[] = [];
    await toHtml("![a](../x.png)\n\n![b](../x.png)", {}, options(), async (src) => {
      seen.push(src);
      return PIXEL;
    });

    expect(seen).toEqual(["../x.png"]);
  });

  it("does nothing at all without a resolver", async () => {
    const html = await toHtml("![Chart](../assets/chart.png)", {}, options());
    expect(html).toContain("../assets/chart.png");
  });
});

describe("toHtml — what a printed page needs", () => {
  it("puts the title on the page, since a PDF loses its filename", async () => {
    const html = await toHtml("Body text.", {}, options({ title: "Phishing attack types" }));

    expect(html).toContain('class="doc-title">Phishing attack types<');
    expect(html).toContain('class="doc-meta"');
  });

  it("escapes a title that would otherwise close the tag", async () => {
    const html = await toHtml("Body.", {}, options({ title: "</h1><script>alert(1)</script>" }));

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("carries a footer that names the document and its origin", async () => {
    const html = await toHtml("Body.", {}, options({ title: "Runbook" }));

    expect(html).toContain('class="doc-foot"');
    expect(html).toContain("ForkLeaf");
    // Hidden on screen, shown on paper — the app's own chrome says this
    // everywhere else.
    expect(html).toContain(".doc-foot { display: none; }");
    expect(html).toContain("position: fixed");
  });

  it("gives the page real margins, not just the first sheet", async () => {
    const html = await toHtml("Body.", {}, options());
    expect(html).toContain("@page { margin:");
  });

  it("spells out where a link goes, which paper cannot show otherwise", async () => {
    const html = await toHtml("Body.", {}, options());
    expect(html).toContain('a[href^="http"]::after');
  });
});
