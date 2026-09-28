import { describe, expect, it } from "vitest";
import { cardsRequest, readCardReply } from "./ai-cards";

describe("cardsRequest", () => {
  it("names the note and asks for the notebook's own card spelling", () => {
    const prompt = cardsRequest("Cell biology", 5);
    expect(prompt).toContain('"Cell biology"');
    expect(prompt).toContain("up to 5 flashcards");
    expect(prompt).toContain("Question :: Answer");
  });
});

describe("readCardReply", () => {
  it("reads one card per line", () => {
    expect(
      readCardReply("What is osmosis? :: Water crossing a membrane\nCapital of Peru :: Lima"),
    ).toEqual([
      { question: "What is osmosis?", answer: "Water crossing a membrane" },
      { question: "Capital of Peru", answer: "Lima" },
    ]);
  });

  it("forgives numbering, bullets and bold, and drops the prose around the cards", () => {
    const reply = [
      "Here are your cards:",
      "",
      "1. **What powers the cell?** :: The mitochondria",
      "- Q: Who wrote Hamlet? :: A: Shakespeare",
      "* Boiling point of water :: 100 °C",
      "Hope this helps!",
    ].join("\n");
    expect(readCardReply(reply)).toEqual([
      { question: "What powers the cell?", answer: "The mitochondria" },
      { question: "Who wrote Hamlet?", answer: "Shakespeare" },
      { question: "Boiling point of water", answer: "100 °C" },
    ]);
  });

  it("skips questions already in the note, and repeats", () => {
    const reply = "Capital of Peru :: Lima\ncapital of peru :: Lima\nCapital of Chile :: Santiago";
    expect(readCardReply(reply, ["Capital of Chile"])).toEqual([
      { question: "Capital of Peru", answer: "Lima" },
    ]);
  });

  it("is not fooled by code", () => {
    expect(readCardReply("Use std::vector here")).toEqual([]);
  });
});
