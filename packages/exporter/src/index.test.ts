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
