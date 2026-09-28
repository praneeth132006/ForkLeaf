import { describe, expect, it } from "vitest";
import { fading, parseVisits, recall, stability, visit, type Visits } from "./note-memory";

describe("stability", () => {
  it("doubles with each day a note is revisited, up to a year", () => {
    expect(stability(1)).toBe(3);
    expect(stability(2)).toBe(6);
    expect(stability(4)).toBe(24);
    expect(stability(20)).toBe(365);
  });
});

describe("recall", () => {
  it("is whole on the day of a visit and falls with time", () => {
    const seen = { last: "2026-09-01", days: 1 };
    expect(recall(seen, "2026-09-01")).toBe(1);
    expect(recall(seen, "2026-09-04")).toBeCloseTo(Math.exp(-1), 5);
    expect(recall({ last: "2026-09-01", days: 5 }, "2026-09-04")).toBeGreaterThan(0.9);
  });
});

describe("visit", () => {
  it("counts days, not opens", () => {
    let visits: Visits = {};
    visits = visit(visits, "a", "2026-09-01");
    const same = visit(visits, "a", "2026-09-01");
    expect(same).toBe(visits);
    visits = visit(visits, "a", "2026-09-03");
    expect(visits.a).toEqual({ last: "2026-09-03", days: 2 });
  });
});

describe("parseVisits", () => {
  it("keeps only well-formed entries", () => {
    expect(
      parseVisits(
        JSON.stringify({
          a: { last: "2026-09-01", days: 2 },
          b: { last: "yesterday", days: 1 },
          c: { last: "2026-09-01", days: 0 },
        }),
      ),
    ).toEqual({ a: { last: "2026-09-01", days: 2 } });
    expect(parseVisits("[]")).toEqual({});
    expect(parseVisits("nope")).toEqual({});
  });
});

describe("fading", () => {
  const notes = ["kept", "once", "fresh", "old"];
  const visits: Visits = {
    kept: { last: "2026-09-27", days: 3 },
    once: { last: "2026-01-01", days: 1 },
    fresh: { last: "2026-09-28", days: 2 },
    old: { last: "2026-08-01", days: 2 },
  };

  it("lists notes you meant to keep that are slipping, least remembered first", () => {
    const result = fading(notes, (note) => note, visits, "2026-09-28");
    expect(result.map((entry) => entry.item)).toEqual(["old"]);
    expect(result[0]!.since).toBe(58);
    expect(result[0]!.recall).toBeLessThan(0.5);
  });
});
