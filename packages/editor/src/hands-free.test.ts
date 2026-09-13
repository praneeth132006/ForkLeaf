import { describe, expect, it } from "vitest";
import { answerWords, commandOf, judgeAnswer, speakable } from "./hands-free";

describe("judgeAnswer", () => {
  it.each([
    ["Water", "it's water", "right"],
    ["6", "six", "right"],
    ["Mitochondria", "mitochondrea", "right"],
    ["The powerhouse of the cell", "powerhouse of cells", "right"],
    ["Deoxyribonucleic acid", "deoxyribonucleic", "close"],
    ["Paris", "Berlin", "wrong"],
    ["Paris", "", "wrong"],
  ] as const)("%s, heard as %j, is %s", (expected, heard, verdict) => {
    expect(judgeAnswer(expected, heard)).toBe(verdict);
  });

  it("forgives one letter of mishearing only in longer words", () => {
    expect(judgeAnswer("cat", "cut")).toBe("wrong");
    expect(judgeAnswer("photon", "photons")).toBe("right");
  });

  it("reads the words that matter", () => {
    expect(answerWords("Um, the answer is twenty cells")).toEqual(["answer", "20", "cell"]);
  });
});

describe("commandOf", () => {
  it.each([
    ["Repeat.", "repeat"],
    ["say it again", "repeat"],
    ["Skip", "skip"],
    ["next", "skip"],
    ["Stop!", "stop"],
    ["I don't know", "dont-know"],
    ["show me the answer", "dont-know"],
    ["water", null],
    ["skip the water", null],
  ] as const)("%j is %s", (heard, command) => {
    expect(commandOf(heard)).toBe(command);
  });
});

describe("speakable", () => {
  it("reads markdown the way a person would say it", () => {
    expect(speakable("2 \\* 3 is **six** — see [[Maths|the maths note]] and `code`")).toBe(
      "2 * 3 is six — see the maths note and code",
    );
    expect(speakable("# A heading")).toBe("A heading");
  });
});
