import { describe, expect, it } from "vitest";
import { choose, emptyDecision, formatDecision, leading, parseDecision, scoreOf } from "./decision";

const TEXT = [
  "question: Which database?",
  "option: Postgres",
  "+ mature (3)",
  "- more to run (2)",
  "option: SQLite",
  "+ simple (2)",
  "+ no server",
  "chosen: Postgres",
  "history:",
  "- 2026-09-01: chose Postgres (1), over SQLite (3)",
].join("\n");

describe("decision blocks", () => {
  it("reads the question, options, weighted pros and cons, choice and history", () => {
    expect(parseDecision(TEXT)).toEqual({
      question: "Which database?",
      options: [
        {
          name: "Postgres",
          pros: [{ text: "mature", weight: 3 }],
          cons: [{ text: "more to run", weight: 2 }],
        },
        {
          name: "SQLite",
          pros: [
            { text: "simple", weight: 2 },
            { text: "no server", weight: 1 },
          ],
          cons: [],
        },
      ],
      chosen: "Postgres",
      history: ["2026-09-01: chose Postgres (1), over SQLite (3)"],
    });
  });

  it("writes it back as it was, with every weight spelled out", () => {
    expect(formatDecision(parseDecision(TEXT))).toBe(
      TEXT.replace("+ no server", "+ no server (1)"),
    );
  });

  it("scores pros less cons, and names the leader only when there is one", () => {
    const decision = parseDecision(TEXT);
    expect(decision.options.map(scoreOf)).toEqual([1, 3]);
    expect(leading(decision)?.name).toBe("SQLite");
    expect(leading(emptyDecision())).toBeNull();
  });

  it("records a choice, and a change of mind, in the history", () => {
    const first = choose(parseDecision(TEXT), "SQLite", "2026-09-13");
    expect(first.chosen).toBe("SQLite");
    expect(first.history.at(-1)).toBe("2026-09-13: changed to SQLite (3), over Postgres (1)");
    const again = choose(first, "SQLite", "2026-09-14");
    expect(again.history.at(-1)).toBe("2026-09-14: chose SQLite (3), over Postgres (1)");
    expect(choose(first, "Nope", "2026-09-14")).toBe(first);
  });

  it("ignores lines it cannot place, and never drops a written line into a single line break", () => {
    const decision = parseDecision("+ orphan pro\nquestion: Q\nnonsense\noption: A\n+ ok (9)");
    expect(decision.options).toEqual([
      { name: "A", pros: [{ text: "ok (9)", weight: 1 }], cons: [] },
    ]);
    expect(formatDecision({ ...emptyDecision(), question: "Line one\nline two" })).toContain(
      "question: Line one line two",
    );
  });
});
