import { describe, expect, it } from "vitest";
import {
  cardId,
  dueCards,
  findCards,
  formatSchedule,
  nextDue,
  parseSchedule,
  review,
  type Schedule,
} from "./flashcards";

describe("findCards", () => {
  it("reads `question :: answer` lines, in a list or not", () => {
    const cards = findCards(
      "bio.md",
      "Biology",
      "# Cells\n\nMitochondria :: the powerhouse of the cell\n- Ribosomes make :: proteins\nplain text",
    );
    expect(cards.map((card) => [card.question, card.answer, card.line])).toEqual([
      ["Mitochondria", "the powerhouse of the cell", 2],
      ["Ribosomes make", "proteins", 3],
    ]);
    expect(cards[0]!.noteTitle).toBe("Biology");
  });

  it("does not read code, tables, headings or inline code as cards", () => {
    const content = [
      "```cpp",
      "std :: vector",
      "```",
      "    indented :: code",
      "| a :: b | c |",
      "## Heading :: not a card",
      "`std::string` :: a type",
      "a::b without spaces",
    ].join("\n");
    expect(findCards("x.md", "x", content)).toEqual([]);
  });

  it("gives a card the same id however the rest of the note changes", () => {
    const [before] = findCards("a.md", "A", "Capital of France :: Paris");
    const [after] = findCards("a.md", "A", "New intro\n\ncapital of france :: Paris, on the Seine");
    expect(after!.id).toBe(before!.id);
    expect(cardId("b.md", "Capital of France")).not.toBe(before!.id);
  });
});

describe("review", () => {
  const today = "2026-09-13";

  it("schedules a new card by grade", () => {
    expect(review(undefined, "again", today)).toEqual({
      due: "2026-09-14",
      interval: 1,
      ease: 1.96,
      reps: 0,
    });
    expect(review(undefined, "good", today)).toEqual({
      due: "2026-09-14",
      interval: 1,
      ease: 2.5,
      reps: 1,
    });
    expect(review(undefined, "easy", today).due).toBe("2026-09-17");
  });

  it("grows the gap with each good review", () => {
    let state = review(undefined, "good", today);
    state = review(state, "good", state.due);
    expect(state.interval).toBe(6);
    state = review(state, "good", state.due);
    expect(state.interval).toBe(15);
    expect(state.reps).toBe(3);
  });

  it("starts a forgotten card over but remembers it was hard", () => {
    const learned = { due: today, interval: 30, ease: 2.5, reps: 5 };
    const forgotten = review(learned, "again", today);
    expect(forgotten).toMatchObject({ interval: 1, reps: 0 });
    expect(forgotten.ease).toBeLessThan(2.5);
  });

  it("never lets ease fall below 1.3", () => {
    let state = review(undefined, "again", today);
    for (let i = 0; i < 20; i += 1) state = review(state, "again", today);
    expect(state.ease).toBe(1.3);
  });

  it("crosses month and year boundaries", () => {
    expect(
      review({ due: "2026-12-31", interval: 1, ease: 2.5, reps: 0 }, "good", "2026-12-31").due,
    ).toBe("2027-01-01");
  });
});

describe("dueCards and nextDue", () => {
  const cards = findCards("a.md", "A", "one :: 1\ntwo :: 2\nthree :: 3\nfour :: 4");
  const schedule: Schedule = new Map([
    [cards[0]!.id, { due: "2026-09-10", interval: 3, ease: 2.5, reps: 2 }],
    [cards[1]!.id, { due: "2026-09-01", interval: 3, ease: 2.5, reps: 2 }],
    [cards[2]!.id, { due: "2026-09-20", interval: 7, ease: 2.5, reps: 3 }],
  ]);

  it("shows the most overdue first, then new cards, and not the ones not due", () => {
    expect(dueCards(cards, schedule, "2026-09-13").map((card) => card.question)).toEqual([
      "two",
      "one",
      "four",
    ]);
  });

  it("limits how many new cards one session introduces", () => {
    expect(dueCards(cards, new Map(), "2026-09-13", 2)).toHaveLength(2);
  });

  it("says when the next card comes back", () => {
    expect(nextDue(cards, schedule, "2026-09-13")).toBe("2026-09-20");
    expect(nextDue(cards, new Map(), "2026-09-13")).toBeNull();
  });
});

describe("the schedule file", () => {
  it("round-trips through a readable markdown table", () => {
    const schedule: Schedule = new Map([
      ["0000000b", { due: "2026-09-20", interval: 7, ease: 2.36, reps: 3 }],
      ["0000000a", { due: "2026-09-14", interval: 1, ease: 2.5, reps: 1 }],
    ]);
    const text = formatSchedule(schedule);
    expect(text).toContain("| 0000000a | 2026-09-14 | 1 | 2.5 | 1 |\n| 0000000b |");
    expect(parseSchedule(text)).toEqual(schedule);
  });

  it("skips rows it cannot read rather than failing", () => {
    const text =
      "| card | due |\n| 1234abcd | not-a-date | 1 | 2 | 3 |\n| zzzz | 2026-01-01 | 1 | 2 | 3 |\n| 1234abcd | 2026-01-01 | x | 2 | 3 |";
    expect(parseSchedule(text).size).toBe(0);
    expect(parseSchedule(null).size).toBe(0);
  });
});
