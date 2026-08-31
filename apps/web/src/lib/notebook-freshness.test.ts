import { describe, expect, it } from "vitest";
import {
  isDismissed,
  surveyNotebook,
  withDismissal,
  type StaleNote,
  type SurveySource,
} from "./notebook-freshness";

const NOW = new Date("2026-08-31T00:00:00.000Z").getTime();
const YEARS_AGO = "2022-01-01T00:00:00.000Z";
const YESTERDAY = "2026-08-30T00:00:00.000Z";

const note = (over: Partial<SurveySource> & { path: string }): SurveySource => ({
  content: "# A note\n\nOrdinary prose.",
  updatedAt: YESTERDAY,
  ...over,
});

const survey = (notes: SurveySource[], files: string[] = []) =>
  surveyNotebook(notes, { files: new Set([...files, ...notes.map((n) => n.path)]), now: NOW });

describe("surveyNotebook — files that are not there", () => {
  it("names a picture the note points at and the repository does not have", () => {
    const result = survey([note({ path: "a.md", content: "# A\n\n![chart](assets/chart.png)" })]);

    expect(result.notes[0]?.missingFiles).toEqual(["assets/chart.png"]);
    expect(result.counts.missingFiles).toBe(1);
  });

  it("says nothing about a picture that is right where it should be", () => {
    const result = survey(
      [note({ path: "a.md", content: "# A\n\n![chart](assets/chart.png)" })],
      ["assets/chart.png"],
    );

    expect(result.notes).toEqual([]);
  });

  it("resolves what the note points at against the note, not the root", () => {
    const result = survey(
      [note({ path: "deep/folder/a.md", content: "# A\n\n![c](../shared/c.png)" })],
      ["deep/shared/c.png"],
    );

    expect(result.notes).toEqual([]);
  });

  /**
   * The hard evidence outranks every heuristic: a note edited yesterday is
   * normally left alone, but a note pointing at a file that is gone is wrong
   * however recently it was written.
   */
  it("reports a fresh note whose file has gone, age notwithstanding", () => {
    const result = survey([
      note({ path: "a.md", content: "# A\n\n![c](assets/c.png)", updatedAt: YESTERDAY }),
    ]);

    expect(result.notes[0]?.verdict).toBe("likely-stale");
    expect(result.notes[0]?.reasons.join(" ")).toMatch(/assets\/c\.png/);
  });
});

describe("surveyNotebook — links that match no note", () => {
  it("names the target as it was typed, which is what has to be fixed", () => {
    const result = survey([
      note({ path: "a.md", content: "# A\n\nSee [[Old Roadmap]] for the plan." }),
    ]);

    expect(result.notes[0]?.missingLinks).toEqual(["Old Roadmap"]);
  });

  it("leaves a link that resolves alone", () => {
    const result = survey([
      note({ path: "a.md", content: "# A\n\nSee [[Roadmap]]." }),
      note({ path: "roadmap.md", content: "# Roadmap\n\nThe plan." }),
    ]);

    expect(result.notes).toEqual([]);
  });

  it("counts one broken target once, however often it is written", () => {
    const result = survey([note({ path: "a.md", content: "# A\n\n[[Gone]] and [[Gone]] again." })]);

    expect(result.notes[0]?.missingLinks).toEqual(["Gone"]);
  });
});

describe("surveyNotebook — claims that have aged", () => {
  it("flags an old note full of version numbers", () => {
    const result = survey([
      note({
        path: "runbook.md",
        content: "# Runbook\n\nNeeds v14.2, and Postgres 15.1, as of March 2022. Currently v14.",
        updatedAt: YEARS_AGO,
      }),
    ]);

    expect(result.notes[0]?.verdict).toBe("likely-stale");
    expect(result.notes[0]?.ageMonths).toBeGreaterThan(50);
  });

  it("leaves prose alone however old it is, because thinking does not expire", () => {
    const result = survey([
      note({
        path: "essay.md",
        content: "# On attention\n\nWhat I think about how people read, at length.",
        updatedAt: YEARS_AGO,
      }),
    ]);

    expect(result.notes).toEqual([]);
  });

  it("leaves a note edited last week alone however many versions it names", () => {
    const result = survey([
      note({ path: "a.md", content: "# A\n\nv1.2, v3.4, v5.6 as of now.", updatedAt: YESTERDAY }),
    ]);

    expect(result.notes).toEqual([]);
  });
});

describe("surveyNotebook — the list itself", () => {
  it("puts facts before inferences", () => {
    const result = survey([
      note({
        path: "old.md",
        content: "# Old\n\nv1.2 and v3.4 and v5.6 and 2019, currently.",
        updatedAt: YEARS_AGO,
      }),
      note({ path: "broken.md", content: "# Broken\n\n![c](assets/c.png)" }),
      note({ path: "unlinked.md", content: "# Unlinked\n\n[[Nowhere]]" }),
    ]);

    expect(result.notes.map((entry) => entry.path)).toEqual(["broken.md", "unlinked.md", "old.md"]);
  });

  it("reports a clean notebook as clean, and says how much it read", () => {
    const result = survey([note({ path: "a.md" }), note({ path: "b.md" }), note({ path: "c.md" })]);

    expect(result.notes).toEqual([]);
    expect(result.scanned).toBe(3);
  });

  it("names a note by its title, not by its filename", () => {
    const result = survey([
      note({ path: "2026-03-14-x.md", content: "# The deploy runbook\n\n![c](c.png)" }),
    ]);

    expect(result.notes[0]?.title).toBe("The deploy runbook");
  });
});

describe("dismissals", () => {
  const stale: StaleNote = {
    path: "a.md",
    title: "A",
    updatedAt: YESTERDAY,
    ageMonths: 0,
    verdict: "likely-stale",
    reasons: [],
    missingFiles: [],
    missingLinks: [],
  };

  it("stays dismissed while the note is untouched", () => {
    expect(isDismissed(withDismissal({}, stale), stale)).toBe(true);
  });

  /**
   * Editing the note is the only moment its claims could have changed, so it
   * is the moment the dismissal stops meaning anything.
   */
  it("comes back once the note has been edited again", () => {
    const dismissals = withDismissal({}, stale);
    expect(isDismissed(dismissals, { ...stale, updatedAt: "2026-08-31T09:00:00.000Z" })).toBe(
      false,
    );
  });

  it("handles a note that has never been edited here", () => {
    const never = { ...stale, updatedAt: null };
    expect(isDismissed(withDismissal({}, never), never)).toBe(true);
  });

  it("says nothing is dismissed when nothing has been", () => {
    expect(isDismissed({}, stale)).toBe(false);
  });
});

describe("surveyNotebook — the counts under the headline", () => {
  /**
   * The summary is read as a description of the rows below it. A note counted
   * as both a broken link and an aged one makes numbers that do not add up to
   * what is on screen, which reads as the app being confused.
   */
  it("counts each note once, under its worst problem", () => {
    const result = survey([
      note({
        path: "both.md",
        content: "# Both\n\n![c](assets/c.png)\n\nv1.2, v3.4, v5.6, currently, 2019.",
        updatedAt: YEARS_AGO,
      }),
    ]);

    expect(result.counts.missingFiles).toBe(1);
    expect(result.counts.likelyStale).toBe(0);
    expect(result.notes).toHaveLength(1);
  });
});
