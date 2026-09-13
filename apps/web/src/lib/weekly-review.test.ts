import { describe, expect, it } from "vitest";
import { findTasks } from "./tasks";
import {
  formatWeeklyReview,
  isoWeek,
  summariseWeek,
  weeklyReviewPath,
  weeklyReviewTitle,
} from "./weekly-review";

// Sunday 13 September 2026, local time.
const NOW = new Date(2026, 8, 13, 18, 0);
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe("isoWeek", () => {
  it("numbers weeks the ISO way, Monday first", () => {
    expect(isoWeek(NOW)).toMatchObject({ year: 2026, week: 37 });
    expect(isoWeek(new Date(2026, 8, 7)).week).toBe(37); // the Monday
    expect(isoWeek(new Date(2026, 8, 14)).week).toBe(38); // the next Monday
  });

  it("puts the first days of January in the previous year's last week when ISO says so", () => {
    expect(isoWeek(new Date(2027, 0, 1))).toMatchObject({ year: 2026, week: 53 });
    expect(isoWeek(new Date(2026, 0, 1))).toMatchObject({ year: 2026, week: 1 });
  });

  it("names the note for the week", () => {
    expect(weeklyReviewTitle(NOW)).toBe("2026-W37");
    expect(weeklyReviewPath(NOW)).toBe("journal/2026-w37.md");
  });
});

describe("summariseWeek", () => {
  const notes = [
    {
      path: "ideas/new.md",
      title: "New idea",
      content: "one two three four",
      created: local(2026, 9, 9),
      updatedAt: local(2026, 9, 12),
    },
    {
      path: "work/plan.md",
      title: "Plan",
      content:
        "- [ ] ship it 📅 2026-09-15\n- [ ] pay invoice due: 2026-09-01\n- [ ] far off 📅 2026-12-01\n- [x] done 📅 2026-09-02",
      created: local(2026, 8, 1),
      updatedAt: local(2026, 9, 8),
    },
    {
      path: "old.md",
      title: "Old",
      content: "",
      created: local(2026, 1, 1),
      updatedAt: local(2026, 9, 6), // the Sunday before
    },
    {
      path: "templates/daily.md",
      title: "Daily",
      content: "- [ ] x due: 2020-01-01",
      created: local(2026, 9, 10),
      updatedAt: null,
    },
    {
      path: "journal/2026-w36.md",
      title: "Last week",
      content: "",
      created: local(2026, 9, 8),
      updatedAt: null,
    },
  ];

  const summary = summariseWeek(notes, NOW, ["gone.md", "templates/x.md"]);

  it("separates notes started this week from notes worked on", () => {
    expect(summary.start).toBe("2026-09-07");
    expect(summary.end).toBe("2026-09-13");
    expect(summary.created.map((note) => note.path)).toEqual(["ideas/new.md"]);
    expect(summary.edited.map((note) => note.path)).toEqual(["work/plan.md"]);
    expect(summary.words).toBe(4);
  });

  it("finds what is overdue and what is due in the next seven days", () => {
    expect(summary.overdue.map((task) => task.text)).toEqual(["pay invoice due: 2026-09-01"]);
    expect(summary.comingUp.map((task) => task.text)).toEqual(["ship it 📅 2026-09-15"]);
  });

  it("leaves out templates, earlier reviews and their deletions", () => {
    expect(summary.deleted).toEqual(["gone.md"]);
  });
});

describe("formatWeeklyReview", () => {
  const summary = summariseWeek(
    [
      {
        path: "ideas/new.md",
        title: "A | tricky ] title",
        content: "hello world",
        created: local(2026, 9, 9),
        updatedAt: null,
      },
      {
        path: "work/plan.md",
        title: "Plan",
        content: "- [ ] pay invoice due: 2026-09-01",
        created: null,
        updatedAt: local(2026, 9, 10),
      },
    ],
    NOW,
  );
  const text = formatWeeklyReview(summary);

  it("writes a note with links to what it mentions", () => {
    expect(text.startsWith("# Week 37, 2026\n\nSeptember 7 – September 13.")).toBe(true);
    expect(text).toContain("1 new note, 2 words.");
    expect(text).toContain("- [[ideas/new|A  tricky  title]]");
    expect(text).toContain("## Worked on\n\n- [[work/plan|Plan]]");
    expect(text).toContain("## Coming up\n\nNothing this week.");
    expect(text).toContain("## Looking back");
    expect(text).not.toContain("## Deleted");
  });

  it("never copies a to-do as a box, so it is not counted twice", () => {
    expect(text).toContain("- pay invoice due: 2026-09-01 — [[work/plan|Plan]]");
    expect(findTasks(text)).toEqual([]);
  });
});
