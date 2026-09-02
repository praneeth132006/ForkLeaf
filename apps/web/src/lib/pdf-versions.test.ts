import { describe, expect, it } from "vitest";
import { affected, comparePages, listPages } from "./pdf-versions";

const pages = (...texts: string[]) => texts.map((text, index) => ({ page: index + 1, text }));

describe("comparePages", () => {
  it("names the pages whose words changed", () => {
    const before = pages("One.", "Two.", "Three.");
    const after = pages("One.", "Two, revised.", "Three.");

    const result = comparePages(before, after);

    expect(result.changes).toEqual([{ page: 2, kind: "changed" }]);
    expect(result.unchanged).toBe(2);
  });

  /**
   * A PDF re-exported from the same source differs in every byte — timestamps,
   * object order, a new producer string — while saying exactly the same thing.
   * A diff that reported four hundred changed pages every time somebody
   * re-saved a paper is a diff nobody reads twice.
   */
  it("is not fooled by typesetting that says the same thing", () => {
    const before = pages("the regu-\nlar expression, ﬁnally");
    const after = pages("the  regular expression,   finally");

    expect(comparePages(before, after).changes).toEqual([]);
  });

  it("notices a page that was inserted", () => {
    const before = pages("One.", "Two.");
    const after = pages("One.", "A new figure.", "Two.");

    // Everything after the insertion reads as changed, which is exactly what
    // has happened to it: page 2 is not what page 2 was.
    expect(comparePages(before, after).changes).toEqual([
      { page: 2, kind: "changed" },
      { page: 3, kind: "added" },
    ]);
  });

  it("notices pages that have gone", () => {
    const before = pages("One.", "Two.", "Three.");
    const after = pages("One.", "Two.");

    // A citation pointing at page 3 is pointing at nothing.
    expect(comparePages(before, after).changes).toEqual([{ page: 3, kind: "removed" }]);
  });

  it("says nothing at all about two versions that match", () => {
    const same = pages("One.", "Two.");
    expect(comparePages(same, same)).toEqual({ changes: [], unchanged: 2, pages: 2 });
  });
});

describe("affected", () => {
  it("picks out the pages you actually quoted", () => {
    const comparison = comparePages(pages("a", "b", "c"), pages("a", "B!", "C!"));

    // The sentence no other reading app can print.
    expect(affected(comparison, [3])).toEqual([{ page: 3, kind: "changed" }]);
    expect(affected(comparison, [1])).toEqual([]);
  });
});

describe("listPages", () => {
  it("says it the way somebody would say it out loud", () => {
    expect(listPages([])).toBe("");
    expect(listPages([4])).toBe("page 4");
    expect(listPages([4, 7])).toBe("pages 4 and 7");
    expect(listPages([4, 7, 12])).toBe("pages 4, 7 and 12");
  });
});
