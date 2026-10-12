import { describe, expect, it } from "vitest";
import { rankSuggestions, slips } from "./spell-rank";

describe("slips", () => {
  it("counts a swap of two neighbouring letters as one", () => {
    expect(slips("teh", "the")).toBe(1);
    expect(slips("wrold", "world")).toBe(1);
  });
  it("counts insertions, deletions and substitutions", () => {
    expect(slips("tomorow", "tomorrow")).toBe(1);
    expect(slips("cat", "cut")).toBe(1);
    expect(slips("abc", "")).toBe(3);
  });
});

describe("rankSuggestions", () => {
  it("puts the common word first among equally close ones", () => {
    expect(
      rankSuggestions("teh", ["ten", "eh", "meh", "tea", "tech", "ted", "tee", "tel", "the"])[0],
    ).toBe("the");
    expect(rankSuggestions("thier", ["thief", "shier", "their", "tier", "trier"])[0]).toBe("their");
    expect(rankSuggestions("wrold", ["wold", "world"])[0]).toBe("world");
  });

  it("knows the two-word fixes a dictionary cannot", () => {
    expect(rankSuggestions("alot", ["allot", "aloe", "slot", "lot"]).slice(0, 2)).toEqual([
      "a lot",
      "allot",
    ]);
  });

  it("drops abbreviations unless the word was typed in capitals", () => {
    expect(rankSuggestions("teh", ["NEH", "the"])).toEqual(["the"]);
    expect(rankSuggestions("NEHH", ["NEH"])).toEqual(["NEH"]);
  });

  it("never suggests the word itself or the same word twice", () => {
    expect(rankSuggestions("Teh", ["teh", "The", "the", "Ten"])).toEqual(["the", "Ten"]);
  });

  it("keeps at most six", () => {
    expect(rankSuggestions("xx", ["a", "b", "c", "d", "e", "f", "g", "h"])).toHaveLength(6);
  });
});
