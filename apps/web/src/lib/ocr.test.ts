import { describe, expect, it } from "vitest";
import { structureText } from "./ocr";

describe("structureText", () => {
  it("joins a paragraph broken at the end of each line", () => {
    expect(structureText("The quick brown fox\njumps over the lazy\ndog.\n\nNext paragraph.")).toBe(
      "The quick brown fox jumps over the lazy dog.\n\nNext paragraph.",
    );
  });

  it("mends words hyphenated across lines, but not real hyphens", () => {
    expect(structureText("Retrieval infor-\nmation systems are well-\nKnown.")).toBe(
      "Retrieval information systems are well- Known.",
    );
  });

  it("turns slide bullets into a list, keeping wrapped lines with their item", () => {
    expect(
      structureText(
        "Agenda\n• First point\n● Second point that\nwraps onto a line\n- Third\n\nAfter.",
      ),
    ).toBe("Agenda\n\n- First point\n- Second point that wraps onto a line\n- Third\n\nAfter.");
  });

  it("reads the + a recogniser makes of a round bullet as a bullet, and keeps short lines apart", () => {
    expect(
      structureText(
        "Quarterly Planning\n+ Ship the mobile beta in March\n+ Hire two backend engineers\n+ Reduce sign-in failures by 40%",
      ),
    ).toBe(
      "Quarterly Planning\n\n- Ship the mobile beta in March\n- Hire two backend engineers\n- Reduce sign-in failures by 40%",
    );
    expect(
      structureText(
        "Meeting notes\nThe team agreed to ship the beta in March and then to\nreview hiring in April.",
      ),
    ).toBe(
      "Meeting notes\n\nThe team agreed to ship the beta in March and then to review hiring in April.",
    );
  });

  it("keeps numbered lists", () => {
    expect(structureText("1. Open it\n2) Read it")).toBe("1. Open it\n2. Read it");
  });

  it("squeezes runs of spaces and copes with Windows line endings", () => {
    expect(structureText("a    b\r\nc")).toBe("a b c");
  });

  it("returns nothing for a picture with no words", () => {
    expect(structureText("\n \n")).toBe("");
  });
});
