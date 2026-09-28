import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./render";
describe("maths", () => {
  it("typesets $…$ and $$…$$ with KaTeX", () => {
    const inline = markdownToHtml("Energy is $E=mc^2$ here.");
    expect(inline).toContain('class="katex"');
    expect(inline).not.toContain("$E=mc^2$");
    const block = markdownToHtml("$$\n\\int_0^1 x\\,dx\n$$");
    expect(block).toContain("katex-display");
  });

  it("leaves money alone", () => {
    const html = markdownToHtml("It costs $5 and $10 today.");
    expect(html).toContain("It costs $5 and $10 today.");
    expect(html).not.toContain("katex");
  });

  it("shows a formula that does not parse as its source, and never runs \\href", () => {
    expect(markdownToHtml("$\\frac{1$")).toContain("katex-error");
    const href = markdownToHtml("$\\href{javascript:alert(1)}{x}$");
    expect(href).not.toMatch(/<a\b/);
    expect(href).not.toContain("href=");
  });

  it("does not treat dollars in code as maths", () => {
    expect(markdownToHtml("`$HOME and $PATH`")).not.toContain("katex");
  });
});

describe("maths cannot reach outside the formula", () => {
  it.each([
    ["\\htmlData{onclick=alert(1)}{x}", /data-onclick|onclick=/],
    ["\\htmlId{evil}{x}", /id="evil"/],
    ["\\htmlClass{fl-external}{x}", /class="[^"]*fl-external/],
    ["\\htmlStyle{position:fixed}{x}", /position:fixed/],
    ["\\includegraphics{https://evil.example/x.png}", /<img/],
    ["\\url{javascript:alert(1)}", /href=/],
  ])("renders %s inert", (tex, forbidden) => {
    // The TeX source is kept, escaped, inside <annotation>; that is text, not markup.
    const html = markdownToHtml(`$${tex}$`).replace(/<annotation[\s\S]*?<\/annotation>/g, "");
    expect(html).not.toMatch(forbidden);
  });

  it("bounds macro expansion rather than hanging", () => {
    const bomb =
      "\\def\\a{\\b\\b}\\def\\b{\\c\\c}\\def\\c{\\d\\d}\\def\\d{xxxxxxxxxx}" + "\\a".repeat(200);
    const started = Date.now();
    markdownToHtml(`$$${bomb}$$`);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
