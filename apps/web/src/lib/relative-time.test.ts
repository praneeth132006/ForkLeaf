import { describe, it, expect } from "vitest";
import { relativeTime, relativeAge, durationLabel } from "./relative-time";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("returns nothing for an unparseable date", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });

  it("calls the last minute 'just now'", () => {
    expect(relativeTime(ago(0), NOW)).toBe("just now");
    expect(relativeTime(ago(59 * SECOND), NOW)).toBe("just now");
  });

  it("reads a slightly future timestamp as recent rather than negative", () => {
    expect(relativeTime(new Date(NOW + 30 * SECOND).toISOString(), NOW)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(relativeTime(ago(5 * MINUTE), NOW)).toBe("5m ago");
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(relativeTime(ago(6 * DAY), NOW)).toBe("6d ago");
  });

  it("switches unit exactly on the boundary", () => {
    expect(relativeTime(ago(MINUTE), NOW)).toBe("1m ago");
    expect(relativeTime(ago(HOUR), NOW)).toBe("1h ago");
    expect(relativeTime(ago(DAY), NOW)).toBe("1d ago");
  });

  it("falls back to a date once past a month", () => {
    const result = relativeTime(ago(40 * DAY), NOW);
    expect(result).not.toMatch(/ago/);
    expect(result).toBe(new Date(NOW - 40 * DAY).toLocaleDateString());
  });
});

describe("relativeAge", () => {
  it("agrees with relativeTime while there is something relative to say", () => {
    expect(relativeAge(ago(5 * MINUTE), NOW)).toBe("5m ago");
    expect(relativeAge(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(relativeAge(ago(29 * DAY), NOW)).toBe("29d ago");
  });

  it("gives up rather than repeating a date the caller already printed", () => {
    // "3/12/2026 (3/12/2026)" reads as a bug, so the parenthetical is dropped.
    expect(relativeAge(ago(40 * DAY), NOW)).toBeNull();
  });

  it("switches to null exactly where relativeTime stops counting", () => {
    expect(relativeAge(ago(2592000 * SECOND - SECOND), NOW)).toBe("29d ago");
    expect(relativeAge(ago(2592000 * SECOND), NOW)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(relativeAge("not a date", NOW)).toBeNull();
  });
});

describe("durationLabel", () => {
  it("handles nothing and nonsense", () => {
    expect(durationLabel(0)).toBe("a moment");
    expect(durationLabel(-1)).toBe("a moment");
    expect(durationLabel(Number.NaN)).toBe("a moment");
  });

  it("uses singular forms where they read better", () => {
    expect(durationLabel(MINUTE)).toBe("a minute");
    expect(durationLabel(HOUR)).toBe("an hour");
  });

  it("scales through minutes, hours, days, weeks, months and years", () => {
    expect(durationLabel(20 * MINUTE)).toBe("20 minutes");
    expect(durationLabel(5 * HOUR)).toBe("5 hours");
    expect(durationLabel(4 * DAY)).toBe("4 days");
    expect(durationLabel(30 * DAY)).toBe("4 weeks");
    // Weeks run up to two months and months up to two years, so those two
    // units always read as plural.
    expect(durationLabel(70 * DAY)).toBe("2 months");
    expect(durationLabel(365 * DAY)).toBe("12 months");
    expect(durationLabel(200 * DAY)).toBe("7 months");
    expect(durationLabel(1000 * DAY)).toBe("3 years");
  });
});
