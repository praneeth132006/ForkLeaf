import { describe, expect, it } from "vitest";
import { formatReport, runCheck, sourcesFrom, type CheckResult } from "./notebook-check";

const NOW = Date.parse("2026-09-13T00:00:00Z");

const BROKEN = {
  path: "runbook.md",
  content:
    "---\ntitle: Deploy runbook\nupdated: 2026-09-01\n---\n\n![diagram](assets/gone.png)\n\nSee [[Incident log]].",
};
const SETUP = { path: "setup.md", content: "# Setup\n\n![logo](assets/logo.png) and [[runbook]]." };
const CLEAN_RUNBOOK = { path: "runbook.md", content: "# Runbook\n\nSteps." };
const ALL = ["runbook.md", "setup.md", "assets/logo.png"];

describe("sourcesFrom", () => {
  it("reads a note's age and title from its properties", () => {
    const [runbook, setup] = sourcesFrom([BROKEN, SETUP]);
    expect(runbook).toMatchObject({
      path: "runbook.md",
      updatedAt: "2026-09-01",
      frontmatterTitle: "Deploy runbook",
    });
    expect(runbook!.content).not.toContain("title:");
    expect(setup!.updatedAt).toBeNull();
  });
});

describe("runCheck", () => {
  it("fails on a missing file or a link to no note, and names both", () => {
    const result = runCheck([BROKEN, SETUP], ALL, NOW);
    expect(result.ok).toBe(false);
    const runbook = result.survey.notes.find((note) => note.path === "runbook.md")!;
    expect(runbook.missingFiles).toEqual(["assets/gone.png"]);
    expect(runbook.missingLinks).toEqual(["Incident log"]);
    // A picture that exists, and a link that finds its note, are not findings.
    expect(result.survey.notes.find((note) => note.path === "setup.md")).toBeUndefined();
  });

  it("passes a notebook whose references all resolve", () => {
    const result = runCheck([CLEAN_RUNBOOK, SETUP], ALL, NOW);
    expect(result.ok).toBe(true);
    expect(result.survey.notes).toEqual([]);
  });

  it("counts a link to a note that the notebook is missing as broken", () => {
    expect(runCheck([SETUP], ALL, NOW).ok).toBe(false);
  });
});

describe("formatReport", () => {
  it("names the repository, the notes and what is broken in each", () => {
    const text = formatReport(runCheck([BROKEN, SETUP], ALL, NOW), {
      repository: "ada/notes",
      ref: "main",
    });
    expect(text.startsWith("### Notebook check: 1 note with broken references")).toBe(true);
    expect(text).toContain("Read 2 notes in `ada/notes` at `main`.");
    expect(text).toContain("- **Deploy runbook** — `runbook.md`");
    expect(text).toContain("points at `assets/gone.png`, which is not in the repository");
    expect(text).toContain("links to `[[Incident log]]`, which matches no note");
  });

  it("lists aged notes after broken ones, as worth re-reading rather than failing", () => {
    const result: CheckResult = {
      ok: false,
      survey: {
        scanned: 2,
        counts: { missingFiles: 1, missingLinks: 0, likelyStale: 1, worthChecking: 0 },
        notes: [
          {
            path: "a.md",
            title: "Broken",
            updatedAt: null,
            ageMonths: null,
            verdict: "likely-stale",
            reasons: [],
            missingFiles: ["x.png"],
            missingLinks: [],
          },
          {
            path: "b.md",
            title: "Old",
            updatedAt: "2019-01-01",
            ageMonths: 80,
            verdict: "likely-stale",
            reasons: ["Mentions Node 12, and has not been edited in 80 months"],
            missingFiles: [],
            missingLinks: [],
          },
        ],
      },
    };
    const text = formatReport(result, { repository: "a/b", ref: "main" });
    expect(text.indexOf("#### Broken references")).toBeGreaterThan(-1);
    expect(text.indexOf("#### Broken references")).toBeLessThan(
      text.indexOf("#### Worth re-reading"),
    );
    expect(text).toContain("They never fail the check.");
    expect(text).toContain("  - Mentions Node 12, and has not been edited in 80 months");
  });

  it("says plainly when everything is fine, and mentions skipped files", () => {
    const text = formatReport(runCheck([CLEAN_RUNBOOK, SETUP], ALL, NOW), {
      repository: "ada/notes",
      ref: "abc1234",
      skipped: 2,
    });
    expect(text.startsWith("### Notebook check passed")).toBe(true);
    expect(text).toContain("2 files were too large or too many to read");
    expect(text).toContain("every link finds its note");
  });

  it("escapes titles so a note cannot put markup into the report", () => {
    const hostile = {
      path: "x.md",
      content: '---\ntitle: "<img src=x onerror=alert(1)> **bold** | pipe"\n---\n\n[[nowhere]]',
    };
    const text = formatReport(runCheck([hostile], ["x.md"], NOW), {
      repository: "a/b",
      ref: "main",
    });
    expect(text).not.toMatch(/(^|[^\\])<img/);
    expect(text).toContain("\\<img");
    expect(text).toContain("\\*\\*bold\\*\\*");
    expect(text).toContain("\\| pipe");
  });
});
