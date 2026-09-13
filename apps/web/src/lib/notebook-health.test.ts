import { describe, expect, it } from "vitest";
import {
  COLOURS,
  badgeMarkdown,
  badgeSvg,
  healthBadge,
  healthMessage,
  healthOf,
  streakFrom,
} from "./notebook-health";

const TODAY = new Date("2026-09-13T12:00:00Z");

describe("streakFrom", () => {
  it("counts days in a row ending today", () => {
    expect(
      streakFrom(
        [
          "2026-09-13T08:00:00Z",
          "2026-09-12T21:00:00Z",
          "2026-09-12T07:00:00Z",
          "2026-09-11T10:00:00Z",
          "2026-09-09T10:00:00Z",
        ],
        TODAY,
      ),
    ).toBe(3);
  });

  it("keeps a streak alive until the end of a day with no review yet", () => {
    expect(streakFrom(["2026-09-12T08:00:00Z", "2026-09-11T08:00:00Z"], TODAY)).toBe(2);
    expect(streakFrom(["2026-09-10T08:00:00Z"], TODAY)).toBe(0);
    expect(streakFrom(["not a date"], TODAY)).toBe(0);
  });
});

describe("healthOf", () => {
  const counts = { missingFiles: 0, missingLinks: 0, likelyStale: 0 };

  it("is healthy, needs attention, or is broken", () => {
    expect(healthOf({ counts, scanned: 10, reviewedAt: [], today: TODAY }).status).toBe("healthy");
    expect(
      healthOf({ counts: { ...counts, likelyStale: 2 }, scanned: 10, reviewedAt: [], today: TODAY })
        .status,
    ).toBe("attention");
    expect(
      healthOf({
        counts: { ...counts, missingFiles: 1, missingLinks: 2, likelyStale: 2 },
        scanned: 10,
        reviewedAt: [],
        today: TODAY,
      }),
    ).toMatchObject({ status: "broken", broken: 3, stale: 2 });
  });

  it("says it in a few words", () => {
    const health = healthOf({
      counts: { ...counts, missingLinks: 1, likelyStale: 2 },
      scanned: 10,
      reviewedAt: ["2026-09-13T08:00:00Z"],
      today: TODAY,
    });
    expect(healthMessage(health)).toBe("1 broken · 2 stale · 1-day streak");
    expect(healthMessage({ ...health, broken: 0, streak: 0 })).toBe("links ok · 2 stale");
  });
});

describe("the badge", () => {
  it("is an SVG with the label, the message and the status colour", () => {
    const svg = healthBadge({ status: "broken", broken: 1, stale: 0, streak: 0, scanned: 3 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('aria-label="notebook: 1 broken · 0 stale"');
    expect(svg).toContain(`fill="${COLOURS.broken}"`);
  });

  it("escapes what it draws, and refuses a colour that is not one", () => {
    const svg = badgeSvg({ label: "<a>", message: '"x" & y', color: "red;background:url(x)" });
    expect(svg).not.toContain("<a>");
    expect(svg).toContain("&#60;a&#62;");
    expect(svg).toContain("&#34;x&#34; &#38; y");
    expect(svg).toContain(`fill="${COLOURS.unknown}"`);
  });

  it("makes the README markdown, with the folder when the notebook lives in one", () => {
    expect(badgeMarkdown("https://forkleaf.app", { owner: "me", repo: "notes" })).toBe(
      "[![Notebook health](https://forkleaf.app/api/badge?owner=me&repo=notes)](https://github.com/me/notes)",
    );
    expect(
      badgeMarkdown("https://forkleaf.app", {
        owner: "me",
        repo: "notes",
        directory: "work/notes",
      }),
    ).toContain("repo=notes&dir=work%2Fnotes");
  });
});
