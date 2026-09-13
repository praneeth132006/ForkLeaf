import { describe, expect, it } from "vitest";
import { ask, highlight, stem, terms, type AskSource } from "./ask";

const sources: AskSource[] = [
  {
    path: "projects/Launch.md",
    title: "Launch",
    content: [
      "# Launch",
      "",
      "## Dates",
      "",
      "We ship the beta on October 3rd, after the security review.",
      "",
      "- Marketing starts in November",
      "- The **public** launch is planned for January",
      "",
      "```bash",
      "ship --beta",
      "```",
    ].join("\n"),
  },
  {
    path: "cooking/Bread.md",
    title: "Bread",
    content: "Bake the bread at 220 degrees for 35 minutes.\n\nLet it cool before slicing.",
  },
  {
    path: "journal/2025-10-01.md",
    title: "October 1",
    content: "Shipping the beta slipped again. The review found two problems.",
  },
  { path: "Secret.md", title: "Secret", content: "<!-- forkleaf:encrypted v1 -->\nbeta ship date" },
  { path: "templates/meeting.md", title: "Meeting", content: "When do we ship the beta?" },
];

describe("terms and stem", () => {
  it("keeps the words that carry meaning, and brings word forms together", () => {
    expect(terms("When do we ship the beta?")).toEqual(["ship", "beta"]);
    expect(["shipping", "ships", "shipped"].map(stem)).toEqual(["ship", "ship", "ship"]);
    expect(stem("stories")).toBe("story");
    expect(stem("glass")).toBe("glass");
  });
});

describe("ask", () => {
  it("finds the passage that answers the question, with where it is", () => {
    const answer = ask("When do we ship the beta?", sources);
    expect(answer.terms).toEqual(["ship", "beta"]);
    expect(answer.passages[0]).toMatchObject({
      path: "projects/Launch.md",
      title: "Launch",
      heading: "Dates",
      line: 5,
      text: "We ship the beta on October 3rd, after the security review.",
    });
    expect(answer.passages[0]!.matched).toEqual(["ship", "beta"]);
    expect(answer.passages.map((passage) => passage.path)).toContain("journal/2025-10-01.md");
  });

  it("answers from list items, reads through formatting, and uses the heading as context", () => {
    const answer = ask("public launch date", sources);
    expect(answer.passages[0]).toMatchObject({
      text: "The public launch is planned for January",
      line: 8,
    });
  });

  it("never quotes code, templates or encrypted notes", () => {
    const quoted = ask("ship beta", sources).passages;
    expect(quoted.map((passage) => passage.path)).not.toContain("Secret.md");
    expect(quoted.map((passage) => passage.path)).not.toContain("templates/meeting.md");
    expect(quoted.some((passage) => passage.text.includes("--beta"))).toBe(false);
  });

  it("needs most of the question to be there", () => {
    expect(ask("bread temperature degrees", sources).passages.map((p) => p.path)).toEqual([
      "cooking/Bread.md",
    ]);
    expect(ask("bread ship", sources).passages).toEqual([]);
  });

  it("says nothing for a question with no words worth searching for", () => {
    expect(ask("what is it?", sources)).toEqual({ terms: [], passages: [] });
  });

  it("quotes at most two passages from one note", () => {
    const many: AskSource[] = [
      {
        path: "a.md",
        title: "A",
        content: "beta one\n\nbeta two\n\nbeta three",
      },
      { path: "b.md", title: "B", content: "beta four" },
    ];
    const paths = ask("beta", many).passages.map((passage) => passage.path);
    expect(paths.filter((path) => path === "a.md")).toHaveLength(2);
    expect(paths).toContain("b.md");
  });
});

describe("highlight", () => {
  it("marks the matched words as whole words, whatever their case", () => {
    expect(highlight("We Ship the beta; shipyard", ["Ship", "beta"])).toEqual([
      { text: "We ", hit: false },
      { text: "Ship", hit: true },
      { text: " the ", hit: false },
      { text: "beta", hit: true },
      { text: "; shipyard", hit: false },
    ]);
  });
});
