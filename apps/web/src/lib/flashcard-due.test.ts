import { describe, expect, it } from "vitest";
import { cardsInNotes } from "./flashcard-due";
import { SCHEDULE_PATH, studyCount, type Card } from "./flashcards";

const note = (path: string, content: string, frontmatter: Record<string, unknown> = {}) => ({
  path,
  content,
  frontmatter,
});

describe("cardsInNotes", () => {
  it("reads cards from markdown notes, not the schedule or skipped paths", () => {
    const cards = cardsInNotes(
      [
        note("a.md", "One :: 1"),
        note(SCHEDULE_PATH, "Not :: a card"),
        note("templates/t.md", "Template :: card"),
        note("image.png", "Pixels :: no"),
      ],
      (path) => path.startsWith("templates/"),
    );
    expect(cards.map((card) => card.question)).toEqual(["One"]);
  });

  it("reads highlights as blanks in a note tagged flashcards", () => {
    const cards = cardsInNotes([
      note("b.md", "Water boils at ==100== degrees", { tags: ["flashcards"] }),
    ]);
    expect(cards[0]?.answer).toBe("100");
  });
});

describe("studyCount", () => {
  const card = (id: string): Card => ({
    id,
    path: "a.md",
    noteTitle: "A",
    question: id,
    answer: id,
    line: 0,
    kind: "basic",
  });

  it("counts every due review, and at most twenty new cards", () => {
    const cards = Array.from({ length: 30 }, (_, i) => card(`n${i}`)).concat(
      card("due"),
      card("later"),
    );
    const schedule = new Map([
      ["due", { due: "2026-09-01", interval: 3, ease: 2.5, reps: 2 }],
      ["later", { due: "2026-12-01", interval: 60, ease: 2.5, reps: 4 }],
    ]);
    expect(studyCount(cards, schedule, "2026-09-28")).toBe(21);
  });
});
