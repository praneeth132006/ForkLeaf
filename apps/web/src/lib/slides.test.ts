import { describe, expect, it } from "vitest";
import { splitSlides } from "./slides";

describe("splitSlides", () => {
  it("splits at --- lines when the note has them", () => {
    expect(splitSlides("# Talk\n\nHello\n\n---\n\n## One\n\nA\n\n---\n\n## Two")).toEqual([
      "# Talk\n\nHello",
      "## One\n\nA",
      "## Two",
    ]);
  });

  it("splits an ordinary note at its sections, with the top as the opening slide", () => {
    expect(
      splitSlides("# Notes\n\nIntro\n\n## First\n\nA\n\n### Detail\n\nB\n\n## Second\n\nC"),
    ).toEqual(["# Notes\n\nIntro", "## First\n\nA\n\n### Detail\n\nB", "## Second\n\nC"]);
  });

  it("does not open with an empty slide when the note starts with a section", () => {
    expect(splitSlides("## Only\n\ntext")).toEqual(["## Only\n\ntext"]);
  });

  it("ignores rules and headings inside code", () => {
    const note = "# A\n\n```yaml\n---\n## not a heading\n```\n\n## B";
    expect(splitSlides(note)).toEqual(["# A\n\n```yaml\n---\n## not a heading\n```", "## B"]);
  });

  it("drops empty slides and gives one slide for a note with no breaks", () => {
    expect(splitSlides("---\n\n---\nJust text\n---")).toEqual(["Just text"]);
    expect(splitSlides("Plain")).toEqual(["Plain"]);
    expect(splitSlides("")).toEqual([]);
  });
});
