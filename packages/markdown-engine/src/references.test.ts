import { describe, expect, it } from "vitest";
import { referencedPaths, removeReferencesTo } from "./references";

const NOTE = "notes/deep/report.md";
const IMAGE = "notes/deep/assets/chart.png";

describe("referencedPaths", () => {
  it("finds every form a note can carry a reference in", () => {
    const content = [
      "![chart](assets/chart.png)",
      '<img src="assets/chart.png" width="400">',
      "[the file](assets/chart.png)",
      "[label]: assets/chart.png",
    ].join("\n\n");

    expect(referencedPaths(NOTE, content)).toEqual([IMAGE]);
  });

  it("leaves alone what is not ours to touch", () => {
    const content = "![remote](https://example.com/chart.png) and [mail](mailto:a@b.c)";
    expect(referencedPaths(NOTE, content)).toEqual([]);
  });
});

describe("removeReferencesTo — the picture", () => {
  it("takes the image out, and the line that held only the image", () => {
    const content = ["# Results", "", "![chart](assets/chart.png)", "", "As you can see."].join(
      "\n",
    );

    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe(
      ["# Results", "", "", "As you can see."].join("\n"),
    );
  });

  it("takes an image out of the middle of a sentence, leaving the sentence", () => {
    const content = "Here it is ![chart](assets/chart.png) which shows the fall.";
    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe("Here it is  which shows the fall.");
  });

  it("removes an <img> tag, whatever attributes it is wearing", () => {
    const content = 'Before\n\n<img alt="chart" src="assets/chart.png" width="400" />\n\nAfter';
    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe("Before\n\n\nAfter");
  });

  it("resolves the path against the note, not the repository root", () => {
    const content = "![up](../../shared/logo.png)";
    expect(removeReferencesTo(NOTE, content, "shared/logo.png")).toBe("");
    expect(removeReferencesTo(NOTE, content, "notes/deep/shared/logo.png")).toBe(content);
  });
});

describe("removeReferencesTo — what survives", () => {
  it("keeps the words of a link, and only drops the link", () => {
    const content = "See [the original chart](assets/chart.png) for the shape of it.";
    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe(
      "See the original chart for the shape of it.",
    );
  });

  it("leaves every other image where it is", () => {
    const content = "![a](assets/chart.png)\n![b](assets/other.png)";
    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe("![b](assets/other.png)");
  });

  it("leaves a blank line that was already blank", () => {
    const content = "One\n\nTwo";
    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe("One\n\nTwo");
  });

  it("leaves an image on somebody else's website alone", () => {
    const content = "![chart](https://example.com/assets/chart.png)";
    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe(content);
  });
});

describe("removeReferencesTo — reference style", () => {
  it("takes the definition and every image that used its label", () => {
    const content = [
      "# Results",
      "",
      "![The chart][chart]",
      "",
      "Discussed below.",
      "",
      "[chart]: assets/chart.png",
    ].join("\n");

    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe(
      ["# Results", "", "", "Discussed below.", ""].join("\n"),
    );
  });

  it("keeps the words of a reference-style link", () => {
    const content = "See [the chart][chart] here.\n\n[chart]: assets/chart.png";
    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe("See the chart here.\n");
  });

  it("leaves a definition pointing somewhere else", () => {
    const content = "![x][other]\n\n[other]: assets/other.png";
    expect(removeReferencesTo(NOTE, content, IMAGE)).toBe(content);
  });
});
