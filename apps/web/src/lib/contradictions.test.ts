import { describe, expect, it } from "vitest";
import { findContradictions, sentencesOf, type ContradictionSource } from "./contradictions";

const note = (path: string, content: string): ContradictionSource => ({
  path,
  title: path.replace(/\.md$/, ""),
  content,
});

describe("findContradictions", () => {
  it("catches the same fact with a different year, across notes", () => {
    const found = findContradictions([
      note(
        "companies.md",
        "# Companies\n\nAcme Robotics was founded in Berlin in 2019 by two engineers.",
      ),
      note("meeting.md", "Notes\n\nAcme Robotics was founded in Berlin in 2021 by two engineers."),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "numbers",
      summary: "2019 or 2021",
      a: { path: "companies.md", line: 3, differs: ["2019"] },
      b: { path: "meeting.md", line: 3, differs: ["2021"] },
    });
  });

  it("treats 1,200 and 1200 as the same number", () => {
    expect(
      findContradictions([
        note("a.md", "The warehouse holds 1,200 pallets of frozen goods."),
        note("b.md", "The warehouse holds 1200 pallets of frozen goods."),
      ]),
    ).toEqual([]);
  });

  it("catches a claim and its denial", () => {
    const found = findContradictions([
      note("a.md", "The staging database is backed up every night automatically."),
      note("b.md", "- The staging database is not backed up every night automatically."),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe("negation");
    expect(found[0]!.b.differs).toEqual(["not"]);
  });

  it("catches opposite words about the same subject", () => {
    const found = findContradictions([
      note("a.md", "After the redesign, checkout conversion rose sharply for mobile shoppers."),
      note("b.md", "After the redesign, checkout conversion fell sharply for mobile shoppers."),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "opposites", summary: "rose or fell" });
  });

  it("stays quiet about sentences that only share a few words", () => {
    expect(
      findContradictions([
        note("a.md", "Our team was founded in 2019 and ships a calendar app."),
        note("b.md", "The calendar app crashed in 2021 on older Android phones."),
      ]),
    ).toEqual([]);
  });

  it("stays quiet when two sentences agree", () => {
    expect(
      findContradictions([
        note("a.md", "Acme Robotics was founded in Berlin in 2019 by two engineers."),
        note("b.md", "Acme Robotics was founded in Berlin in 2019 by two engineers!"),
      ]),
    ).toEqual([]);
  });

  it("ignores code, front matter, headings and flashcards", () => {
    const found = findContradictions([
      note(
        "a.md",
        "---\ntitle: Release 2019 notes for the build server\n---\n\n```\nThe build server runs version 2019 of the toolchain\n```\n\nWhen did the build server switch toolchain versions? :: In 2019 after the outage",
      ),
      note(
        "b.md",
        "# The build server runs version 2021 of the toolchain\n\nWhen did the build server switch toolchain versions? :: In 2021 after the outage",
      ),
    ]);
    expect(found).toEqual([]);
  });

  it("leaves out pairs already judged fine, and keeps the id stable", () => {
    const sources = [
      note("a.md", "Acme Robotics was founded in Berlin in 2019 by two engineers."),
      note("b.md", "Acme Robotics was founded in Berlin in 2021 by two engineers."),
    ];
    const [first] = findContradictions(sources);
    expect(findContradictions([...sources].reverse())[0]!.id).toBe(first!.id);
    expect(findContradictions(sources, { dismissed: new Set([first!.id]) })).toEqual([]);
  });

  it("finds contradictions inside one note too", () => {
    const found = findContradictions([
      note(
        "trip.md",
        "The flight to Lisbon departs at 9 from terminal two.\n\nLater: the flight to Lisbon departs at 11 from terminal two.",
      ),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]!.a.line).toBe(1);
    expect(found[0]!.b.line).toBe(3);
  });

  it("copes with a large notebook quickly", () => {
    const sources = Array.from({ length: 400 }, (_, i) =>
      note(
        `n${i}.md`,
        Array.from(
          { length: 20 },
          (_, j) =>
            `Sentence ${j} about topic ${i} mentions widget ${i * 20 + j} and gadgets galore.`,
        ).join("\n"),
      ),
    );
    const started = Date.now();
    findContradictions(sources);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});

describe("sentencesOf", () => {
  it("splits prose into sentences with their line numbers", () => {
    const sentences = sentencesOf(
      note(
        "a.md",
        "Intro line here is long enough. Second sentence is also long.\n\n- A list item that counts too",
      ),
    );
    expect(sentences.map((sentence) => [sentence.line, sentence.text])).toEqual([
      [1, "Intro line here is long enough."],
      [1, "Second sentence is also long."],
      [3, "A list item that counts too"],
    ]);
  });
});
