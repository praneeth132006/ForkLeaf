import { describe, expect, it } from "vitest";
import {
  dailyNotePath,
  dateStamp,
  defaultDailyNote,
  fillTemplate,
  noteFromTemplate,
  templatesIn,
} from "./templates";

// Local time, deliberately: "today" is wherever the writer is.
const NOW = new Date(2026, 8, 12, 9, 5);

describe("templatesIn", () => {
  it("finds markdown files under templates/, named by filename", () => {
    expect(
      templatesIn([
        "notes/a.md",
        "templates/meeting.md",
        "templates/logo.png",
        "templates/Daily.md",
      ]),
    ).toEqual([
      { path: "templates/Daily.md", name: "Daily" },
      { path: "templates/meeting.md", name: "meeting" },
    ]);
  });

  it("does not count a folder that only starts with the word", () => {
    expect(templatesIn(["templates-old/x.md"])).toEqual([]);
  });
});

describe("dates", () => {
  it("stamps the local day, zero-padded", () => {
    expect(dateStamp(new Date(2026, 0, 3))).toBe("2026-01-03");
    expect(dailyNotePath(NOW)).toBe("journal/2026-09-12.md");
  });
});

describe("fillTemplate", () => {
  it("fills every placeholder it knows, spaced or not", () => {
    expect(
      fillTemplate("{{title}} {{ date }} {{time}} {{weekday}} {{yesterday}} {{tomorrow}}", {
        title: "Standup",
        now: NOW,
      }),
    ).toBe("Standup 2026-09-12 09:05 Saturday 2026-09-11 2026-09-13");
  });

  it("leaves braces it does not know alone", () => {
    expect(fillTemplate("{{attendees}} and {{#each}}", { title: "", now: NOW })).toBe(
      "{{attendees}} and {{#each}}",
    );
  });

  it("crosses a month boundary", () => {
    expect(fillTemplate("{{tomorrow}}", { title: "", now: new Date(2026, 8, 30) })).toBe(
      "2026-10-01",
    );
  });
});

describe("noteFromTemplate", () => {
  it("keeps the template's own properties but not its title or dates", () => {
    const raw =
      "---\ntitle: Meeting template\ncreated: 2020-01-01\ntags: [meeting]\n---\n\n# {{title}}\n";
    expect(noteFromTemplate(raw, { title: "Q3 kickoff", now: NOW })).toEqual({
      content: "# Q3 kickoff\n",
      frontmatter: { tags: ["meeting"] },
    });
  });

  it("accepts a template with no properties", () => {
    expect(noteFromTemplate("# {{date}}", { title: "x", now: NOW })).toEqual({
      content: "# 2026-09-12",
      frontmatter: {},
    });
  });
});

describe("defaultDailyNote", () => {
  it("heads the note with the day written out", () => {
    expect(defaultDailyNote(NOW).split("\n")[0]).toBe("# Saturday, September 12, 2026");
  });
});
