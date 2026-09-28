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
