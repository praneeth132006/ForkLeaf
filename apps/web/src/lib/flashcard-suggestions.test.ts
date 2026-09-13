import { describe, expect, it } from "vitest";
import { findCards } from "./flashcards";
import { formatCard, suggestCards, withCards } from "./flashcard-suggestions";

const note = [
  "# Biology",
  "",
  "**Mitochondria** — the powerhouse of the cell",
  "- **Ribosome**: makes proteins from RNA",
  "- Osmosis: water moving across a membrane",
  "- Buy milk",
  "- [ ] Read chapter 3: before Friday",
  "",
  "## What is DNA?",
  "",
  "The molecule that carries genetic instructions.",
  "It is a double helix.",
  "",
  "## Notes",
  "",
  "Already a card :: yes",
  "",
  "```",
  "- Term: inside code does not count",
  "```",
].join("\n");

describe("suggestCards", () => {
  it("finds bold terms, term lists and question headings with their answers", () => {
    expect(suggestCards(note).map((card) => [card.question, card.answer, card.line])).toEqual([
      ["Mitochondria", "the powerhouse of the cell", 2],
      ["Ribosome", "makes proteins from RNA", 3],
      ["Osmosis", "water moving across a membrane", 4],
      ["What is DNA?", "The molecule that carries genetic instructions. It is a double helix.", 8],
    ]);
  });

  it("leaves out cards that already exist, to-dos, links and code", () => {
    const questions = suggestCards(note).map((card) => card.question);
    expect(questions).not.toContain("Already a card");
    expect(questions).not.toContain("Read chapter 3");
    expect(questions).not.toContain("Term");
    expect(suggestCards("- https://example.com: a site")).toEqual([]);
    expect(
      suggestCards("**Mitochondria** — the powerhouse\n\nMitochondria :: the powerhouse"),
    ).toEqual([]);
  });
});

describe("adding cards to a note", () => {
  it("writes a one-line card, or a multi-line one around ?", () => {
    expect(formatCard("Capital of Peru", "Lima")).toBe("Capital of Peru :: Lima");
    expect(formatCard("Primary colours", "red\nyellow\nblue")).toBe(
      "Primary colours\n?\nred\nyellow\nblue",
    );
  });

  it("adds a Flashcards section at the end, and every card in it is found", () => {
    const next = withCards("# Geography\n\nSome notes.", [
      { question: "Capital of Peru", answer: "Lima" },
      { question: "Primary colours", answer: "red\nyellow\nblue" },
    ]);
    expect(next).toBe(
      "# Geography\n\nSome notes.\n\n## Flashcards\n\nCapital of Peru :: Lima\n\nPrimary colours\n?\nred\nyellow\nblue\n",
    );
    expect(findCards("g.md", "G", next).map((card) => card.question)).toEqual([
      "Capital of Peru",
      "Primary colours",
    ]);
  });

  it("adds to an existing Flashcards section, before what follows it", () => {
    const content = "# Deck\n\n## Flashcards\n\nOne :: 1\n\n## Later\n\nText";
    expect(withCards(content, [{ question: "Two", answer: "2" }])).toBe(
      "# Deck\n\n## Flashcards\n\nOne :: 1\n\nTwo :: 2\n\n## Later\n\nText",
    );
  });

  it("starts an empty file with the section alone", () => {
    expect(withCards("", [{ question: "One", answer: "1" }])).toBe("## Flashcards\n\nOne :: 1\n");
  });
});
