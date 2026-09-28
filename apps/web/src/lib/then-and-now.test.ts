import { describe, expect, it } from "vitest";
import { ageOf, growth, revisionOn, spanBefore } from "./then-and-now";

const commits = [
  { sha: "c", date: "2026-09-01T10:00:00Z" },
  { sha: "b", date: "2026-02-10T10:00:00Z" },
  { sha: "a", date: "2025-06-01T10:00:00Z" },
];

describe("spanBefore", () => {
  it("counts back months, keeping to the end of a short month", () => {
    expect(spanBefore("2026-09-28", "year")).toBe("2025-09-28");
    expect(spanBefore("2026-09-28", "half-year")).toBe("2026-03-28");
    expect(spanBefore("2026-03-31", "month")).toBe("2026-02-28");
  });
});

describe("revisionOn", () => {
  it("takes the version current on the day", () => {
    expect(revisionOn(commits, "2026-03-28")).toEqual({ revision: commits[1], exact: true });
    expect(revisionOn(commits, "2025-09-28")).toEqual({ revision: commits[2], exact: true });
  });

  it("offers the first version of a younger note, saying so", () => {
    expect(revisionOn(commits, "2024-01-01")).toEqual({ revision: commits[2], exact: false });
    expect(revisionOn([], "2024-01-01")).toBeNull();
  });
});

describe("ageOf", () => {
  it("speaks in days, months or years", () => {
    expect(ageOf("2026-09-20T00:00:00Z", "2026-09-28")).toBe("8 days");
    expect(ageOf("2026-03-28", "2026-09-28")).toBe("6 months");
    expect(ageOf("2025-09-28", "2026-09-28")).toBe("1 year");
  });
});

describe("growth", () => {
  it("counts words and whole paragraphs added and removed", () => {
    expect(growth("# A\n\nOld idea.", "# A\n\nNew idea here.\n\nAnother.")).toEqual({
      wordsThen: 3,
      wordsNow: 5,
      newParagraphs: 2,
      goneParagraphs: 1,
    });
  });
});
