import { describe, expect, it } from "vitest";
import { ankiExport, deckNote, fieldText, parseAnkiText } from "./anki";
import { findCards, wantsClozes } from "./flashcards";

describe("parseAnkiText", () => {
  it("reads Anki's plain-text export, header and all", () => {
    const text = [
      "#separator:tab",
      "#html:true",
      "#deck:Geography",
      "Capital of <b>France</b>\tParis",
      "Capital of Peru\tLima<br>(since 1535)",
    ].join("\n");
    expect(parseAnkiText(text)).toEqual({
      deck: "Geography",
      cards: [
        { question: "Capital of France", answer: "Paris" },
        { question: "Capital of Peru", answer: "Lima (since 1535)" },
      ],
      clozes: [],
      skipped: 0,
    });
  });

  it("guesses the separator without a header, and honours quoted fields", () => {
    expect(parseAnkiText('"One, two",2\nThree;3').cards).toEqual([
      { question: "One, two", answer: "2" },
      { question: "Three", answer: "3" },
    ]);
  });

  it("turns cloze notes into highlighted blanks, and counts what it skipped", () => {
    const result = parseAnkiText(
      "{{c1::Canberra}} is the capital of {{c2::Australia::country}}\tx\nOnly one field",
    );
    expect(result.clozes).toEqual(["==Canberra== is the capital of ==Australia=="]);
    expect(result.skipped).toBe(1);
  });
});

describe("fieldText", () => {
  it("decodes entities and flattens markup", () => {
    expect(fieldText("A &amp; B&nbsp;&#233;<div>next</div>")).toBe("A & B é next");
  });
});

describe("ankiExport", () => {
  it("writes a file Anki imports into the named deck", () => {
    expect(ankiExport("Geography", [{ question: "Capital\tof France", answer: "Paris" }])).toBe(
      "#separator:tab\n#html:false\n#deck:Geography\nCapital of France\tParis\n",
    );
  });

  it("round-trips", () => {
    const cards = [{ question: "Q1", answer: "A1" }];
    expect(parseAnkiText(ankiExport("D", cards)).cards).toEqual(cards);
  });
});

describe("deckNote", () => {
  it("writes a note the notebook reads the same cards back from", () => {
    const deck = parseAnkiText("A\t1\nB\t2\n{{c1::Canberra}} is in Australia");
    const note = deckNote("Imported", deck);
    const cards = findCards("d.md", "Imported", note, { clozes: wantsClozes({}, note) });
    expect(cards.map((card) => [card.question, card.answer])).toEqual([
      ["A", "1"],
      ["B", "2"],
      ["[…] is in Australia", "Canberra"],
    ]);
  });
});
