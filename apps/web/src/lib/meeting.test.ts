import { describe, expect, it } from "vitest";
import {
  SUMMARY_HEADING,
  extractMeeting,
  formatSummary,
  meetingNote,
  withMeetingSummary,
  withoutSummary,
} from "./meeting";

const notes = [
  "# Launch sync",
  "",
  "## Notes",
  "",
  "- Decision: ship the beta on 2026-10-03",
  "- We agreed to keep the free plan.",
  "- Action: Sam to draft the announcement by 2026-09-20",
  "- @Priya will book the venue",
  "- Leo will review the pricing page 📅 2026-09-25",
  "- Question: do we need a waitlist?",
  "- Marketing is excited",
  "- [ ] An existing to-do stays where it is",
  "",
  "> **Ana:** Action: send the survey to beta users",
  "> **Ana:** I think the colours are fine",
  "",
  "```",
  "Decision: this is code, not a decision",
  "```",
].join("\n");

describe("extractMeeting", () => {
  it("gathers decisions, action items with owners and dates, and open questions", () => {
    expect(extractMeeting(notes)).toEqual({
      decisions: ["Ship the beta on 2026-10-03", "We agreed to keep the free plan"],
      actions: [
        { text: "Sam to draft the announcement", owner: "Sam", due: "2026-09-20" },
        { text: "@Priya will book the venue", owner: "Priya", due: null },
        { text: "Leo will review the pricing page", owner: "Leo", due: "2026-09-25" },
        { text: "Send the survey to beta users", owner: "Ana", due: null },
      ],
      questions: ["Do we need a waitlist?"],
    });
  });

  it("reads nothing into ordinary notes", () => {
    expect(extractMeeting("# Notes\n\nThe weather was nice.\nWe talked about lunch.")).toEqual({
      decisions: [],
      actions: [],
      questions: [],
    });
  });
});

describe("the summary", () => {
  it("writes action items as to-dos, with the owner and date, under its own heading", () => {
    const summary = formatSummary(extractMeeting(notes));
    expect(summary.startsWith(`${SUMMARY_HEADING}\n\n### Decisions`)).toBe(true);
    expect(summary).not.toContain("<!--");
    expect(summary).toContain("- [ ] Sam to draft the announcement @Sam 📅 2026-09-20");
    expect(summary).toContain("- [ ] @Priya will book the venue\n");
    expect(summary).toContain("### Open questions\n\n- Do we need a waitlist?");
  });

  it("replaces its earlier summary instead of adding another, and never reads it back in", () => {
    const once = withMeetingSummary(notes, extractMeeting(notes));
    const twice = withMeetingSummary(once, extractMeeting(once));
    expect(twice).toBe(once);
    expect(once.split(SUMMARY_HEADING)).toHaveLength(2);
    expect(withoutSummary(once).trim()).toBe(notes.trim());

    const more = `${notes}\n- Decision: hire a designer`;
    const updated = withMeetingSummary(once.replace(notes, more), extractMeeting(more));
    expect(updated.split(SUMMARY_HEADING)).toHaveLength(2);
    expect(updated).toContain("- Hire a designer");
  });

  it("finds its summary after the rich editor has re-spaced it, and keeps what follows", () => {
    const edited = [
      "# Sync",
      "",
      "- Decision: go",
      "",
      "## Meeting summary",
      "",
      "### Decisions",
      "",
      "- Go",
      "",
      "### Action items",
      "",
      "- [ ] Old action @Sam",
      "",
      "- [ ] Another old one",
      "",
      "## Next meeting",
      "",
      "Bring the numbers.",
    ].join("\n");
    const rewritten = withMeetingSummary(edited, extractMeeting(edited));
    expect(rewritten.split(SUMMARY_HEADING)).toHaveLength(2);
    expect(rewritten).not.toContain("Old action");
    expect(rewritten.endsWith("## Next meeting\n\nBring the numbers.")).toBe(true);
    expect(extractMeeting(edited).actions).toEqual([]);
  });

  it("says so when a list is empty", () => {
    expect(formatSummary({ decisions: [], actions: [], questions: [] })).toContain(
      "### Decisions\n\nNothing noted.",
    );
  });
});

describe("meetingNote", () => {
  it("starts a dated note with the headings a meeting needs", () => {
    const made = meetingNote("Launch sync", new Date(2026, 8, 13, 10));
    expect(made.title).toBe("2026-09-13 Launch sync");
    expect(made.content).toContain("**Date:** 2026-09-13");
    expect(made.content).toContain("## Agenda");
    expect(made.content).toContain("## Notes");
  });
});
