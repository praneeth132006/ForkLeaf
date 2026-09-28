import { describe, expect, it } from "vitest";
import { dueToday, isoWeek, readSchedule, scheduledNote } from "./scheduled-notes";

// Monday 28 September 2026, local time.
const MONDAY = new Date(2026, 8, 28, 9);
const SATURDAY = new Date(2026, 9, 3, 9);

describe("readSchedule", () => {
  it("reads the schedules it knows, in any case", () => {
    expect(readSchedule("Weekly")).toBe("weekly");
    expect(readSchedule(" friday ")).toBe("friday");
    expect(readSchedule("fortnightly")).toBeNull();
    expect(readSchedule(3)).toBeNull();
  });
});

describe("dueToday", () => {
  it("keeps weekdays and named days to their days", () => {
    expect(dueToday("weekdays", MONDAY)).toBe(true);
    expect(dueToday("weekdays", SATURDAY)).toBe(false);
    expect(dueToday("monday", MONDAY)).toBe(true);
    expect(dueToday("friday", MONDAY)).toBe(false);
    expect(dueToday("monthly", SATURDAY)).toBe(true);
  });
});

describe("isoWeek", () => {
  it("numbers weeks the ISO way, across a year boundary", () => {
    expect(isoWeek(MONDAY)).toBe("2026-W40");
    expect(isoWeek(new Date(2027, 0, 1))).toBe("2026-W53");
  });
});

describe("scheduledNote", () => {
  it("names a note by its template and period, in the journal by default", () => {
    expect(scheduledNote({ name: "Standup", frontmatter: { schedule: "daily" } }, MONDAY)).toEqual({
      title: "Standup 2026-09-28",
      folder: "journal",
      path: "journal/standup-2026-09-28.md",
    });
    expect(
      scheduledNote({ name: "Review", frontmatter: { schedule: "weekly" } }, MONDAY)?.title,
    ).toBe("Review 2026-W40");
    expect(
      scheduledNote({ name: "Review", frontmatter: { schedule: "monthly" } }, MONDAY)?.title,
    ).toBe("Review 2026-09");
  });

  it("follows the template's own name and folder", () => {
    expect(
      scheduledNote(
        {
          name: "plan",
          frontmatter: { schedule: "monday", folder: "/planning/", name: "Plan for {{week}}" },
        },
        MONDAY,
      ),
    ).toEqual({
      title: "Plan for 2026-W40",
      folder: "planning",
      path: "planning/plan-for-2026-w40.md",
    });
  });

  it("makes nothing on the wrong day, or without a schedule", () => {
    expect(scheduledNote({ name: "x", frontmatter: { schedule: "friday" } }, MONDAY)).toBeNull();
    expect(scheduledNote({ name: "x", frontmatter: {} }, MONDAY)).toBeNull();
  });
});
