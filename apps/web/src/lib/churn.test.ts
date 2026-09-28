import { describe, expect, it } from "vitest";
import { churnOf, paragraphsOf, rewritesOf } from "./churn";

// Newest first, as the history API returns them.
const revisions = [
  "# Plan\n\nWe will use SQLite for the store, with nightly backups.\n\nLaunch in May.",
  "# Plan\n\nWe will use SQLite for the store.\n\nLaunch in May.",
  "# Plan\n\nWe will use Postgres for the store.\n\nLaunch in May.",
  "# Plan\n\nLaunch in May.",
];

describe("paragraphsOf", () => {
  it("splits on blank lines", () => {
    expect(paragraphsOf("a\nb\n\n\nc\r\n\r\nd")).toEqual(["a\nb", "c", "d"]);
  });
});

describe("rewritesOf", () => {
  it("counts each step where the wording changed, back to when it was written", () => {
    expect(
      rewritesOf("We will use SQLite for the store, with nightly backups.", revisions.slice(1)),
    ).toBe(2);
  });

  it("counts nothing for a paragraph never touched", () => {
    expect(rewritesOf("Launch in May.", revisions.slice(1))).toBe(0);
  });

  it("skips revisions not read yet", () => {
    expect(rewritesOf("Launch in May.", [null, "Launch in May."])).toBe(0);
  });
});

describe("churnOf", () => {
  it("gives each paragraph of the newest version its count, and the most", () => {
    expect(churnOf(revisions)).toEqual({
      paragraphs: [
        { text: "# Plan", rewrites: 0 },
        { text: "We will use SQLite for the store, with nightly backups.", rewrites: 2 },
        { text: "Launch in May.", rewrites: 0 },
      ],
      most: 2,
    });
    expect(churnOf([null])).toEqual({ paragraphs: [], most: 0 });
  });
});
