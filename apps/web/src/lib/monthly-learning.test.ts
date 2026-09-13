import { describe, expect, it } from "vitest";
import { findCards, formatSchedule } from "./flashcards";
import {
  formatMonthlyPage,
  monthlyPagePath,
  summariseMonth,
  type MonthSource,
} from "./monthly-learning";

const NOW = new Date(2026, 8, 13, 12);

const note = (path: string, content: string, over: Partial<MonthSource> = {}): MonthSource => ({
  path,
  title: path.split("/").pop()!.replace(/\.md$/, ""),
  content,
  created: null,
  updatedAt: null,
  ...over,
});

const CELLS = note(
  "bio/Cells.md",
  "Cell :: unit of life\nNucleus :: holds DNA\nRibosome :: makes proteins",
  {
    created: "2026-09-05T10:00:00",
  },
);
const OLD = note("chem/Water.md", "H2O :: water", {
  created: "2026-06-01T10:00:00",
  updatedAt: "2026-09-10T10:00:00",
});
const DECISION = note(
  "work/Database.md",
  [
    "# Database",
    "",
    "```decision",
    "question: Which database?",
    "option: Postgres",
    "option: SQLite",
    "chosen: SQLite",
    "history:",
    "- 2026-09-10: chose SQLite (2), over Postgres (1)",
    "```",
  ].join("\n"),
  { created: "2026-08-01T10:00:00", updatedAt: "2026-09-10T10:00:00" },
);
const OLD_DECISION = note(
  "work/Hosting.md",
  "```decision\nquestion: Where to host?\noption: A\nchosen: A\nhistory:\n- 2026-07-02: chose A (0)\n```",
);
const MEETING = note("meetings/Standup.md", "Decision: ship on Friday\n\nSam: sounds good", {
  created: "2026-09-12T09:00:00",
});
const TEMPLATE = note("templates/Card.md", "Q :: A", { created: "2026-09-02T10:00:00" });

const schedule = () => {
  const [cell, nucleus] = findCards(CELLS.path, CELLS.title, CELLS.content);
  const [water] = findCards(OLD.path, OLD.title, OLD.content);
  return formatSchedule(
    new Map([
      [cell!.id, { due: "2026-10-10", interval: 30, ease: 2.5, reps: 3 }],
      [nucleus!.id, { due: "2026-09-15", interval: 3, ease: 2.5, reps: 1 }],
      [water!.id, { due: "2026-11-01", interval: 45, ease: 2.6, reps: 5 }],
    ]),
  );
};

describe("summariseMonth", () => {
  const summary = summariseMonth(
    [CELLS, OLD, DECISION, OLD_DECISION, MEETING, TEMPLATE],
    schedule(),
    NOW,
  );

  it("lists the notes started and worked on this month, leaving templates out", () => {
    expect(summary.label).toBe("September 2026");
    expect(summary.start).toBe("2026-09-01");
    expect(summary.created.map((each) => each.title)).toEqual(["Cells", "Standup"]);
    expect(summary.edited.map((each) => each.title)).toEqual(["Database", "Water"]);
    expect(summary.words).toBeGreaterThan(0);
  });

  it("says how the flashcards are coming along", () => {
    expect(summary.cards).toEqual({ total: 4, mature: 2, learning: 1, notStarted: 1, added: 3 });
    expect(summary.decks[0]).toEqual({ path: "bio/Cells.md", title: "Cells", cards: 3, mature: 1 });
  });

  it("gathers this month's decisions, from decision blocks and meetings", () => {
    expect(summary.decisions).toEqual([
      {
        text: "Which database? — SQLite",
        path: "work/Database.md",
        title: "Database",
        from: "decision",
      },
      { text: "Ship on Friday", path: "meetings/Standup.md", title: "Standup", from: "meeting" },
    ]);
  });
});

describe("the monthly page", () => {
  it("is written to the journal under the month", () => {
    expect(monthlyPagePath(NOW)).toBe("journal/2026-09-learned.md");
  });

  it("reads as a page, with links to every note it mentions", () => {
    const page = formatMonthlyPage(summariseMonth([CELLS, DECISION, MEETING], schedule(), NOW));
    expect(page).toContain("# What I learned — September 2026");
    expect(page).toContain("September 1 – September 13.");
    expect(page).toContain("- 2 new notes");
    expect(page).toContain(
      "- 3 flashcards: 1 mature, 1 learning, 1 not started yet (3 added this month)",
    );
    expect(page).toContain("- [[bio/Cells|Cells]]");
    expect(page).toContain("- Which database? — SQLite — [[work/Database|Database]]");
    expect(page).toContain("- Ship on Friday — [[meetings/Standup|Standup]] (meeting)");
    expect(page.trimEnd().endsWith("## Looking back")).toBe(true);
  });

  it("says so when a month was quiet, and never counts its own earlier pages", () => {
    const page = formatMonthlyPage(
      summariseMonth(
        [note("journal/2026-09-learned.md", "old", { created: "2026-09-01T10:00:00" })],
        null,
        NOW,
      ),
    );
    expect(page).toContain("Nothing new this month.");
    expect(page).toContain("No decisions written down this month.");
    expect(page).not.toContain("flashcard");
  });
});
