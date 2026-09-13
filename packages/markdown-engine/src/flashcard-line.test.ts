import { describe, expect, it } from "vitest";
import { parseCardLine } from "./flashcard-line";
import { markdownToHtml } from "./render";

describe("parseCardLine", () => {
  it("reads a card, both ways, and tight when it reads like a question", () => {
    expect(parseCardLine("H2O :: Water")).toEqual({
      question: "H2O",
      answer: "Water",
      reversed: false,
    });
    expect(parseCardLine("Hund ::: dog")).toMatchObject({ reversed: true });
    expect(parseCardLine("What is H2O?::Water")).toMatchObject({ answer: "Water" });
    expect(parseCardLine("Capital of Portugal::Lisbon")).toMatchObject({ answer: "Lisbon" });
  });

  it("is not fooled by code", () => {
    for (const line of [
      "std::vector",
      "Use std::vector here",
      "Foo::bar()",
      "`a :: b`",
      "a :: b :: c",
      "Q ::",
    ]) {
      expect(parseCardLine(line)).toBeNull();
    }
  });
});

describe("flashcards in the preview", () => {
  it("draws a card that opens to its answer", () => {
    const html = markdownToHtml("Capital of France :: Paris");
    expect(html).toContain('<details class="fl-flashcard">');
    expect(html).toContain('<summary class="fl-flashcard-question">Capital of France</summary>');
    expect(html).toContain("<p>Paris</p>");
  });

  it("keeps the text around cards on consecutive lines", () => {
    const html = markdownToHtml("Intro\nOne :: 1\nTwo :: 2\nOutro");
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).toContain("<p>Intro</p>");
    expect(html).toContain("<p>Outro</p>");
  });

  it("leaves lists, code and formatted lines alone", () => {
    expect(markdownToHtml("- Q :: A")).not.toContain("<details");
    expect(markdownToHtml("```\nQ :: A\n```")).not.toContain("<details");
    expect(markdownToHtml("**Q** :: A")).not.toContain("<details");
  });

  it("escapes what a card holds", () => {
    const html = markdownToHtml("<script>x</script> is :: <b>bad</b>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
  });
});
