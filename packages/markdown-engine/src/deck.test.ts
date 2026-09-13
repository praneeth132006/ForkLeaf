import { describe, expect, it } from "vitest";
import {
  deckCardsOf,
  deckFile,
  deckRepoName,
  diffDecks,
  formatDeckBlock,
  parseDeckBlock,
  parseRepoAddress,
  planDeckUpdate,
  readDeckFile,
  type DeckCard,
} from "./deck";

const card = (question: string, answer: string, reversed = false): DeckCard => ({
  question,
  answer,
  reversed,
});

describe("deck files", () => {
  it("reads the cards of a note, in lists too, but not in code or quotes", () => {
    expect(
      deckCardsOf(
        "# Bio\n\nCell :: unit of life\n- DNA ::: genes\n```\nCode :: no\n```\n> Quote :: no\nCell :: again",
      ),
    ).toEqual([card("Cell", "unit of life"), card("DNA", "genes", true)]);
  });

  it("writes a deck file that reads back as the same cards", () => {
    const cards = [card("Cell", "unit of life"), card("Hund", "dog", true)];
    const text = deckFile("Biology basics", cards);
    expect(text).toBe("# Biology basics\n\n## Cards\n\nCell :: unit of life\nHund ::: dog\n");
    expect(readDeckFile(text)).toEqual({ title: "Biology basics", cards });
  });

  it("names a deck's repository after its title", () => {
    expect(deckRepoName("Biology: Cells & DNA!")).toBe("biology-cells-dna-deck");
    expect(deckRepoName("")).toBe("flashcards-deck");
  });
});

describe("parseRepoAddress", () => {
  it.each([
    ["me/bio-deck", { owner: "me", repo: "bio-deck" }],
    ["https://github.com/me/bio-deck", { owner: "me", repo: "bio-deck" }],
    ["github.com/me/bio-deck.git", { owner: "me", repo: "bio-deck" }],
    ["https://github.com/me/bio-deck/blob/main/deck.md", { owner: "me", repo: "bio-deck" }],
  ])("reads %s", (input, expected) => {
    expect(parseRepoAddress(input)).toEqual(expected);
  });

  it.each(["", "me", "me/..", "me/repo name", "a/b/c", "https://gitlab.com/me/deck"])(
    "refuses %s",
    (input) => {
      expect(parseRepoAddress(input)).toBeNull();
    },
  );
});

describe("updating a copied deck", () => {
  const before = [card("Cell", "unit of life"), card("DNA", "genes"), card("RNA", "messenger")];
  const after = [card("Cell", "the unit of life"), card("RNA", "messenger"), card("ATP", "energy")];

  it("says what was added, changed and removed", () => {
    expect(diffDecks(before, after)).toEqual({
      added: [card("ATP", "energy")],
      changed: [{ before: card("Cell", "unit of life"), after: card("Cell", "the unit of life") }],
      removed: [card("DNA", "genes")],
    });
  });

  it("brings the changes into cards the reader has not touched, after the deck's last card", () => {
    const current = [...before, card("Mine", "my own card")];
    const plan = planDeckUpdate(current, before, after);
    expect(plan.replace).toEqual([{ index: 0, card: card("Cell", "the unit of life") }]);
    expect(plan.remove).toEqual([1]);
    expect(plan.add).toEqual([card("ATP", "energy")]);
    expect(plan.anchor).toBe(2);
    expect(plan.kept).toBe(0);
  });

  it("keeps a card the reader rewrote, whether the deck changed it or dropped it", () => {
    const current = [
      card("Cell", "in my words"),
      card("DNA", "my version"),
      card("RNA", "messenger"),
    ];
    const plan = planDeckUpdate(current, before, after);
    expect(plan.replace).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.kept).toBe(2);
  });

  it("does not add a card the reader already has", () => {
    const plan = planDeckUpdate([...before, card("ATP", "adenosine")], before, after);
    expect(plan.add).toEqual([]);
  });
});

describe("the deck block", () => {
  it("reads and writes where the cards came from, and at which version", () => {
    const text = "source: me/bio-deck\nversion: 0123abcd";
    expect(parseDeckBlock(text)).toEqual({
      role: "source",
      repo: "me/bio-deck",
      version: "0123abcd",
    });
    expect(formatDeckBlock(parseDeckBlock(text))).toBe(text);
    expect(parseDeckBlock("shared: me/x-deck")).toEqual({
      role: "shared",
      repo: "me/x-deck",
      version: "",
    });
  });

  it("ignores what it cannot read", () => {
    expect(parseDeckBlock("source: not a repo\nversion: zzz")).toEqual({
      role: "",
      repo: "",
      version: "",
    });
    expect(formatDeckBlock({ role: "", repo: "", version: "" })).toBe("");
  });
});
