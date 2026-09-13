import { describe, expect, it } from "vitest";
import { compareRecall, sentencesOf } from "./explain-back";

const NOTE = [
  "# Photosynthesis",
  "",
  "Plants turn sunlight into chemical energy. The process happens in the chloroplasts.",
  "",
  "## Inputs",
  "",
  "- Carbon dioxide enters through the stomata.",
  "- Water arrives from the roots.",
  "",
  "```python",
  "print('not a sentence')",
  "```",
  "",
  "Oxygen is released as a byproduct.",
].join("\n");

describe("sentencesOf", () => {
  it("reads prose and list items, and skips headings and code", () => {
    expect(sentencesOf(NOTE)).toEqual([
      "Plants turn sunlight into chemical energy.",
      "The process happens in the chloroplasts.",
      "Carbon dioxide enters through the stomata.",
      "Water arrives from the roots.",
      "Oxygen is released as a byproduct.",
    ]);
  });

  it("reads a flashcard line as its question and answer", () => {
    expect(sentencesOf("Capital of France :: Paris")).toEqual(["Capital of France — Paris"]);
  });

  it("drops link syntax and formatting", () => {
    expect(sentencesOf("See **[the guide](https://x.dev)** and [[Setup|setup]].")).toEqual([
      "See the guide and setup.",
    ]);
  });
});

describe("compareRecall", () => {
  it("counts everything when everything came back", () => {
    const report = compareRecall(
      NOTE,
      "Plants turn sunlight into chemical energy in chloroplasts; the process happens there. " +
        "Carbon dioxide enters through stomata, water arrives from roots, and oxygen is released as a byproduct.",
    );
    expect(report.score).toBe(100);
    expect(report.missed).toBe(0);
    expect(report.sentences.every((sentence) => sentence.status === "remembered")).toBe(true);
  });

  it("names what was forgotten", () => {
    const report = compareRecall(NOTE, "Plants make chemical energy from sunlight.");
    const stomata = report.sentences.find((sentence) => sentence.text.startsWith("Carbon"))!;
    expect(stomata.status).toBe("missed");
    expect(stomata.missing).toEqual(["carbon", "dioxide", "enters", "stomata"]);
    expect(report.sentences[0]!.status).toBe("remembered");
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(50);
  });

  it("marks a sentence partly remembered", () => {
    const report = compareRecall(
      "Mitochondria produce energy for the cell.",
      "Something about energy and cells.",
    );
    expect(report.sentences[0]!.status).toBe("partly");
  });

  it("matches different forms of a word", () => {
    const report = compareRecall(
      "The team shipped the release.",
      "The teams are shipping releases",
    );
    expect(report.sentences[0]!.status).toBe("remembered");
  });

  it("flags what was written that the note does not say", () => {
    const report = compareRecall(
      NOTE,
      "Plants turn sunlight into energy. Photosynthesis only happens at night in deserts.",
    );
    expect(report.attempt.map((sentence) => sentence.inNote)).toEqual([true, false]);
  });

  it("scores an empty note as nothing to compare", () => {
    const report = compareRecall("# Just a title", "Anything at all");
    expect(report.sentences).toEqual([]);
    expect(report.score).toBe(0);
  });
});
