import { describe, expect, it } from "vitest";
import { ago, resurface, type ResurfaceSource } from "./resurface";

const now = new Date(2026, 8, 13, 10);
const monthsAgo = (months: number) => new Date(2026, 8 - months, 13, 10).toISOString();

const note = (
  path: string,
  content: string,
  over: Partial<ResurfaceSource> = {},
): ResurfaceSource => ({
  path,
  title: path.replace(/\.md$/, "").split("/").pop()!,
  content,
  updatedAt: monthsAgo(6),
  created: null,
  ...over,
});

describe("resurface", () => {
  const notes = [
    note("Launch.md", "# Launch\n\nSee [[Old idea]] before deciding.", {
      updatedAt: now.toISOString(),
    }),
    note("Old idea.md", "# Old idea\n\nShip the **smallest** thing first.", {
      updatedAt: monthsAgo(7),
    }),
    note("Retro.md", "# Retro\n\nWhat went well in [[Launch]].", { updatedAt: monthsAgo(3) }),
    note("Fresh.md", "Edited last week", { updatedAt: new Date(2026, 8, 6).toISOString() }),
    note("Birthday.md", "A year ago", {
      created: new Date(2025, 8, 13).toISOString(),
      updatedAt: monthsAgo(12),
    }),
    note("templates/daily.md", "{{date}}", { updatedAt: monthsAgo(20) }),
    note("Secret.md", "<!-- forkleaf:encrypted v1 -->\nsealed", { updatedAt: monthsAgo(20) }),
    note("Ancient.md", "From long ago", { updatedAt: monthsAgo(30) }),
  ];

  it("leads with the old notes linked to the one being written, and says why", () => {
    const picks = resurface(notes, { current: "Launch.md", now });
    expect(picks.slice(0, 2)).toEqual([
      {
        path: "Old idea.md",
        title: "Old idea",
        reason: "Linked from this note · last edited 7 months ago",
        excerpt: "Ship the smallest thing first.",
      },
      expect.objectContaining({
        path: "Retro.md",
        reason: "Links to this note · last edited 3 months ago",
      }),
    ]);
    expect(picks).toHaveLength(3);
  });

  it("offers what was written on this day, then the longest forgotten", () => {
    const picks = resurface(notes, { current: null, now, limit: 5 });
    expect(picks[0]).toMatchObject({ path: "Birthday.md", reason: "Written a year ago today" });
    expect(picks.map((pick) => pick.path)).toContain("Ancient.md");
  });

  it("never suggests the open note, a recent edit, a template or an encrypted note", () => {
    const paths = resurface(notes, { current: "Launch.md", now, limit: 10 }).map(
      (pick) => pick.path,
    );
    for (const skipped of ["Launch.md", "Fresh.md", "templates/daily.md", "Secret.md"]) {
      expect(paths).not.toContain(skipped);
    }
  });

  it("keeps the same suggestions all day", () => {
    const morning = resurface(notes, { current: null, now: new Date(2026, 8, 13, 8), limit: 2 });
    const evening = resurface(notes, { current: null, now: new Date(2026, 8, 13, 22), limit: 2 });
    expect(evening).toEqual(morning);
  });

  it("has nothing to say about a notebook with nothing old in it", () => {
    expect(
      resurface([note("New.md", "hi", { updatedAt: now.toISOString() })], { current: null, now }),
    ).toEqual([]);
  });
});

describe("ago", () => {
  it("speaks in weeks, months and years", () => {
    expect(ago(new Date(2026, 8, 6), now)).toBe("1 week ago");
    expect(ago(new Date(2026, 7, 13), now)).toBe("4 weeks ago");
    expect(ago(new Date(2026, 1, 13), now)).toBe("7 months ago");
    expect(ago(new Date(2024, 8, 1), now)).toBe("2 years ago");
  });
});
