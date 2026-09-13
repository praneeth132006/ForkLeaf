import { describe, expect, it } from "vitest";
import {
  cardId,
  dueCards,
  findCards,
  formatSchedule,
  nextDue,
  parseSchedule,
  review,
  wantsClozes,
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
      "`std::string` alone",
      "::",
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

describe("findCards — cards as people and the editor write them", () => {
  const pairs = (content: string, clozes = false) =>
    findCards("a.md", "A", content, { clozes }).map((card) => [card.question, card.answer]);

  it("shows escaped characters, links and formatting the way a person reads them", () => {
    const content = [
      "2 \\* 3 :: 6",
      "The \\[\\[Roadmap\\]\\] is :: due in *May*",
      "snake\\_case :: words\\_joined\\_by\\_underscores",
      "Mitochondria :: the powerhouse of the **cell**",
      "Where :: [the docs](https://example.com) and [[Setup|the setup note]]",
    ].join("\n");
    expect(pairs(content)).toEqual([
      ["2 * 3", "6"],
      ["The Roadmap is", "due in May"],
      ["snake_case", "words_joined_by_underscores"],
      ["Mitochondria", "the powerhouse of the cell"],
      ["Where", "the docs and the setup note"],
    ]);
  });

  it("drops the backslash a line break in the rich editor leaves on an answer", () => {
    expect(pairs("Capital of Portugal :: Lisbon\\\nLargest planet :: Jupiter")).toEqual([
      ["Capital of Portugal", "Lisbon"],
      ["Largest planet", "Jupiter"],
    ]);
  });

  it("reads a card written without spaces when it reads like a question, never code", () => {
    const content = [
      "What is H2O?::Water",
      "Capital of Portugal::Lisbon",
      "std::vector",
      "Foo::bar()",
      "`std::string` :: a type",
      "1. Ordered :: list",
      "- [ ] Task box :: card",
    ].join("\n");
    expect(pairs(content)).toEqual([
      ["What is H2O?", "Water"],
      ["Capital of Portugal", "Lisbon"],
      ["std::string", "a type"],
      ["Ordered", "list"],
      ["Task box", "card"],
    ]);
  });

  it("makes two cards from :::, one each way", () => {
    const cards = findCards("a.md", "A", "- Hola ::: Hello");
    expect(cards.map((card) => [card.question, card.answer, card.kind])).toEqual([
      ["Hola", "Hello", "basic"],
      ["Hello", "Hola", "reversed"],
    ]);
    expect(cards[0]!.id).not.toBe(cards[1]!.id);
  });

  it("reads a card over several lines around a line holding only ?", () => {
    const cards = findCards(
      "a.md",
      "A",
      "What are the\nprimary colours?\n?\nred\nyellow\nblue\n\nnext :: one",
    );
    expect(cards.map((card) => [card.question, card.answer, card.line])).toEqual([
      ["What are the\nprimary colours?", "red\nyellow\nblue", 0],
      ["next", "one", 7],
    ]);
  });

  it("reads the same card from the rich editor, where each line ends in a backslash", () => {
    expect(pairs("What are the primary colours?\\\n?\\\nred\\\nyellow\\\nblue")).toEqual([
      ["What are the primary colours?", "red\nyellow\nblue"],
    ]);
    expect(pairs("Bonjour\n??\nHello")).toEqual([
      ["Bonjour", "Hello"],
      ["Hello", "Bonjour"],
    ]);
  });

  it("turns highlights into blanks only in a note that asks for them", () => {
    const line = "Lisbon is the capital of ==Portugal== and ==Madrid== of Spain";
    expect(pairs(line)).toEqual([]);
    const cards = findCards("a.md", "A", line, { clozes: true });
    expect(cards.map((card) => [card.question, card.answer, card.kind])).toEqual([
      ["Lisbon is the capital of […] and Madrid of Spain", "Portugal", "cloze"],
      ["Lisbon is the capital of Portugal and […] of Spain", "Madrid", "cloze"],
    ]);
  });

  it("lists a card written twice only once", () => {
    expect(pairs("Capital of Peru :: Lima\n\nCapital of Peru :: Lima")).toHaveLength(1);
  });
});

describe("wantsClozes", () => {
  it("is on for a note tagged flashcards, in its properties or its text", () => {
    expect(wantsClozes({ tags: ["study", "Flashcards"] }, "")).toBe(true);
    expect(wantsClozes({ tags: "flashcards" }, "")).toBe(true);
    expect(wantsClozes({}, "Some notes #flashcards")).toBe(true);
    expect(wantsClozes({}, "#flashcards\n\nText")).toBe(true);
    expect(wantsClozes({ tags: ["study"] }, "==highlight==")).toBe(false);
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
