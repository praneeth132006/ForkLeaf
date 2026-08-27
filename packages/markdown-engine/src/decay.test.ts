import { describe, expect, it } from "vitest";
import { assessDecay, findPerishable } from "./decay";

const NOW = Date.parse("2026-08-27T00:00:00.000Z");
/**
 * A timestamp comfortably inside the Nth month back.
 *
 * The extra hour is not noise: landing exactly on the boundary made this fall
 * a month short under floating-point division, which had these tests asserting
 * against a helper's rounding rather than against the code.
 */
const monthsAgo = (months: number) =>
  new Date(NOW - months * 30.44 * 24 * 60 * 60 * 1000 - 3_600_000).toISOString();

const kinds = (content: string) => findPerishable(content).map((m) => `${m.kind}:${m.text}`);

describe("findPerishable — versions", () => {
  it("finds a two-part version", () => {
    expect(kinds("We ran nmap 7.80 against it.")).toContain("version:7.80");
  });

  it("finds a three-part version and a v prefix", () => {
    expect(kinds("Pinned to v1.2.3 for now.")).toContain("version:v1.2.3");
  });

  it("finds a pre-release suffix", () => {
    expect(kinds("Running 2.0.0-beta.1 here.")).toContain("version:2.0.0-beta.1");
  });

  it("ignores a bare v1, which is usually a heading", () => {
    // "Chapter v1" and "attempt v2" do not expire.
    expect(kinds("See draft v1 and v2.")).toEqual([]);
  });

  it("ignores a plain integer", () => {
    expect(kinds("There were 3 hosts and 12 findings.")).toEqual([]);
  });

  it("finds versions inside a code fence, where pins actually live", () => {
    expect(kinds("```\nrequests==2.31.0\n```")).toContain("version:2.31.0");
  });
});

describe("findPerishable — CVEs and dates", () => {
  it("finds a CVE", () => {
    expect(kinds("Exploited CVE-2024-3094 on the host.")).toContain("cve:CVE-2024-3094");
  });

  it("finds a CVE however it is cased", () => {
    expect(kinds("cve-2021-44228 again")).toContain("cve:cve-2021-44228");
  });

  it("does not read a CVE as a date or a version", () => {
    // The more specific reading has to win, or one span is reported twice.
    expect(kinds("CVE-2024-3094")).toEqual(["cve:CVE-2024-3094"]);
  });

  it("finds an ISO date", () => {
    expect(kinds("Checked on 2024-03-15.")).toContain("date:2024-03-15");
  });

  it("finds a written month and year", () => {
    expect(kinds("Reported in March 2024 by the vendor.")).toContain("date:March 2024");
  });

  it("ignores a month with no year", () => {
    expect(kinds("We start in March.")).toEqual([]);
  });
});

describe("findPerishable — claims about now", () => {
  it("finds the hedges that quietly go false", () => {
    for (const phrase of [
      "currently",
      "at the time of writing",
      "the latest",
      "at present",
      "nowadays",
    ]) {
      expect(findPerishable(`This is ${phrase} true.`)).toHaveLength(1);
    }
  });

  it("finds them however they are cased", () => {
    expect(kinds("Currently unpatched.")).toContain("hedge:Currently");
  });

  it("does not report the same span under two names", () => {
    const found = findPerishable("As of 2024-03-15 the latest is v1.2.3.");
    const spans = found.map((m) => `${m.start}-${m.end}`);
    expect(new Set(spans).size).toBe(spans.length);

    for (let i = 1; i < found.length; i += 1) {
      expect(found[i]!.start).toBeGreaterThanOrEqual(found[i - 1]!.end);
    }
  });

  it("reports mentions in the order they appear", () => {
    const found = findPerishable("v1.2.3 then CVE-2024-3094");
    expect(found.map((m) => m.kind)).toEqual(["version", "cve"]);
  });

  it("points at the text it found, so a reader can locate it", () => {
    const content = "We ran nmap 7.80 there.";
    const [mention] = findPerishable(content);
    expect(content.slice(mention!.start, mention!.end)).toBe("7.80");
  });

  it("finds nothing in prose that does not expire", () => {
    expect(findPerishable("This is how I think about the problem.")).toEqual([]);
  });

  it("handles an empty note", () => {
    expect(findPerishable("")).toEqual([]);
  });
});

describe("assessDecay — what it refuses to call stale", () => {
  it("never calls a note with no datable claims stale, however old", () => {
    // Prose about how you think does not expire.
    const report = assessDecay("This is how I approach the problem.", {
      updatedAt: monthsAgo(60),
      now: NOW,
    });

    expect(report.verdict).toBe("fresh");
    expect(report.reasons[0]).toMatch(/no.*shelf life|nothing.*shelf life/i);
  });

  it("leaves a recently edited note alone however much it pins", () => {
    const report = assessDecay("nmap 7.80, CVE-2024-3094, currently, 2024-03-15", {
      updatedAt: monthsAgo(1),
      now: NOW,
    });

    expect(report.verdict).toBe("fresh");
    expect(report.reasons[0]).toMatch(/edited 1 month ago/);
  });

  it("says it does not know when the note has never been edited here", () => {
    const report = assessDecay("nmap 7.80", { updatedAt: null, now: NOW });
    expect(report.verdict).toBe("unknown");
    expect(report.reasons[0]).toMatch(/knows when it was last checked/);
  });

  it("says it does not know when the timestamp cannot be read", () => {
    expect(assessDecay("nmap 7.80", { updatedAt: "not a date", now: NOW }).verdict).toBe("unknown");
  });
});

describe("assessDecay — the verdicts", () => {
  it("calls an old, heavily pinned note likely stale", () => {
    const report = assessDecay("nmap 7.80 and v1.2.3 and 2.31.0 and 3.11.4", {
      updatedAt: monthsAgo(24),
      now: NOW,
    });

    expect(report.verdict).toBe("likely-stale");
    expect(report.reasons[0]).toMatch(/4 version numbers.*24 months/);
  });

  it("treats a CVE as enough on its own, given age", () => {
    // A published vulnerability has a fix by now, by definition.
    const report = assessDecay("Exploited CVE-2024-3094.", {
      updatedAt: monthsAgo(24),
      now: NOW,
    });

    expect(report.verdict).toBe("likely-stale");
  });

  it("calls a middling note worth checking rather than stale", () => {
    const report = assessDecay("We ran nmap 7.80.", { updatedAt: monthsAgo(10), now: NOW });

    expect(report.verdict).toBe("worth-checking");
    expect(report.reasons[0]).toMatch(/1 version number.*10 months/);
  });

  it("does not jump to stale on age alone", () => {
    const report = assessDecay("We ran nmap 7.80.", { updatedAt: monthsAgo(36), now: NOW });
    expect(report.verdict).toBe("worth-checking");
  });

  it("counts the months since it was last touched", () => {
    expect(assessDecay("x", { updatedAt: monthsAgo(7), now: NOW }).ageMonths).toBe(7);
  });

  it("agrees with itself about the singular", () => {
    const report = assessDecay("nmap 7.80", { updatedAt: monthsAgo(1), now: NOW });
    expect(report.reasons[0]).toContain("1 month ago");
    expect(report.reasons[0]).not.toContain("1 months");
  });

  it("never reports a negative age from a clock that moved", () => {
    const future = new Date(NOW + 86_400_000).toISOString();
    expect(assessDecay("nmap 7.80", { updatedAt: future, now: NOW }).ageMonths).toBe(0);
  });
});

describe("assessDecay — a changed file outranks every guess", () => {
  it("calls a note stale when a file it links to has moved on", () => {
    const report = assessDecay("This is how I think.", {
      updatedAt: monthsAgo(1),
      now: NOW,
      changedFiles: ["scripts/scan.sh"],
    });

    // Recent, and with nothing perishable in it — but this is a fact about
    // the repository, not a guess about the world.
    expect(report.verdict).toBe("likely-stale");
    expect(report.reasons[0]).toBe("scripts/scan.sh has changed since this note described it.");
  });

  it("names the file when there is one, and counts them when there are more", () => {
    const report = assessDecay("x", {
      updatedAt: monthsAgo(1),
      now: NOW,
      changedFiles: ["a.sh", "b.sh"],
    });

    expect(report.reasons[0]).toBe(
      "2 files this note links to have changed since it described them.",
    );
  });
});

describe("assessDecay — counting", () => {
  it("counts mentions by kind", () => {
    const report = assessDecay("v1.2.3 v2.0.0 CVE-2024-3094 currently", {
      updatedAt: monthsAgo(1),
      now: NOW,
    });

    expect(report.counts).toEqual({ version: 2, cve: 1, date: 0, hedge: 1 });
  });

  it("describes what it found in the reader's own terms", () => {
    const report = assessDecay("CVE-2024-3094 and v1.2.3", { updatedAt: monthsAgo(24), now: NOW });
    expect(report.reasons[0]).toContain("1 CVE, 1 version number");
  });

  it("gets the singulars right", () => {
    const report = assessDecay("CVE-2024-3094 CVE-2024-3095 and v1.2.3 v2.0.0", {
      updatedAt: monthsAgo(24),
      now: NOW,
    });
    expect(report.reasons[0]).toContain("2 CVEs, 2 version numbers");
  });
});
