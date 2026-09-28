import { describe, expect, it } from "vitest";
import { CHANGES_HEADING, reversalIn, reversals, withReason } from "./changes-of-mind";

describe("reversalIn", () => {
  it("catches one thing named for another", () => {
    expect(
      reversalIn("We will use Postgres for the store.", "We will use SQLite for the store."),
    ).toMatchObject({
      from: "postgres",
      to: "sqlite",
    });
  });

  it("catches a negation put in or taken out", () => {
    expect(reversalIn("We should ship on Friday.", "We should not ship on Friday.")).not.toBeNull();
    expect(
      reversalIn("The cache is not worth it here.", "The cache is worth it here."),
    ).not.toBeNull();
  });

  it("catches a word swapped for its opposite", () => {
    expect(
      reversalIn("Always rebase before merging.", "Never rebase before merging."),
    ).not.toBeNull();
    expect(
      reversalIn("Answer: yes, keep the old API.", "Answer: no, keep the old API."),
    ).not.toBeNull();
  });

  it("ignores a typo fixed, a clause added, and a rewrite from scratch", () => {
    expect(reversalIn("We will use Postgress for it.", "We will use Postgres for it.")).toBeNull();
    expect(
      reversalIn("We will use Postgres.", "We will use Postgres, with read replicas."),
    ).toBeNull();
    expect(
      reversalIn("We will use Postgres here.", "Nobody on the team has time this quarter."),
    ).toBeNull();
  });

  it("ignores headings, code and short fragments", () => {
    expect(reversalIn("## Postgres", "## SQLite")).toBeNull();
    expect(reversalIn("Yes", "No")).toBeNull();
  });
});

describe("reversals", () => {
  it("finds the reversed lines between two versions of a note", () => {
    const before = "# Plan\n\nWe will use Postgres for the store.\nLaunch is in May.\n";
    const after =
      "# Plan\n\nWe will use SQLite for the store.\nLaunch is in May.\n\nA new paragraph.\n";
    expect(reversals(before, after).map((each) => [each.from, each.to])).toEqual([
      ["postgres", "sqlite"],
    ]);
  });
});

describe("withReason", () => {
  const reversal = { before: "Use Postgres", after: "Use SQLite", from: "postgres", to: "sqlite" };

  it("adds a section at the end the first time", () => {
    expect(withReason("# Plan\n\nText\n", reversal, " one file is simpler ", "2026-09-28")).toBe(
      `# Plan\n\nText\n\n${CHANGES_HEADING}\n\n- 2026-09-28: “Use Postgres” → “Use SQLite” — one file is simpler\n`,
    );
  });

  it("adds to the section after that, keeping what follows it", () => {
    const content = `# Plan\n\n${CHANGES_HEADING}\n\n- older\n\n## Notes\n\nMine\n`;
    expect(withReason(content, reversal, "why", "2026-09-28")).toBe(
      `# Plan\n\n${CHANGES_HEADING}\n\n- older\n- 2026-09-28: “Use Postgres” → “Use SQLite” — why\n\n## Notes\n\nMine\n`,
    );
  });
});
