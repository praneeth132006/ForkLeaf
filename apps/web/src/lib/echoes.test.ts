import { describe, expect, it } from "vitest";
import { answerKey, echoes, parseAnswers, sentencesIn, withAnswer } from "./echoes";

describe("sentencesIn", () => {
  it("keeps prose sentences and drops headings, code, cards and stubs", () => {
    const note = [
      "# Monday",
      "",
      "- [ ] Call",
      "- We decided the **launch** should wait until the billing bug is fixed. Everyone agreed.",
      "Question :: Answer that is long enough to count as a sentence",
      "```",
      "const notASentence = 'but it is long enough to be one otherwise';",
      "```",
      "I think [[Pricing]] matters more than the roadmap says it does right now.",
    ].join("\n");
    expect(sentencesIn(note)).toEqual([
      "We decided the launch should wait until the billing bug is fixed.",
      "I think Pricing matters more than the roadmap says it does right now.",
    ]);
  });
});

describe("echoes", () => {
  const sources = [
    {
      id: "a",
      path: "journal/2026-09-27.md",
      title: "27",
      text: "Yesterday I thought the new onboarding flow was far too long.",
    },
    {
      id: "b",
      path: "journal/2026-09-21.md",
      title: "21",
      text: "The team should move standups to the afternoon for the new hires.",
    },
    {
      id: "c",
      path: "journal/2025-09-28.md",
      title: "Last year",
      text: "Rust feels too slow to write for a small team like ours today.",
    },
    {
      id: "d",
      path: "notes/ideas.md",
      title: "Ideas",
      text: "Not dated, so this sentence is never brought back as an echo.",
    },
  ];

  it("brings back a sentence from each span that has a note", () => {
    const found = echoes(sources, "2026-09-28");
    expect(found.map((echo) => [echo.label, echo.source.id])).toEqual([
      ["Yesterday", "a"],
      ["A week ago", "b"],
      ["A year ago", "c"],
    ]);
  });

  it("chooses the same sentence all day", () => {
    const many = [
      {
        id: "x",
        path: "journal/2026-09-27.md",
        title: "x",
        text: "First sentence here is long enough to count. Second sentence here is also long enough to count. Third sentence here is also long enough to count.",
      },
    ];
    expect(echoes(many, "2026-09-28")[0]!.sentence).toBe(echoes(many, "2026-09-28")[0]!.sentence);
  });
});

describe("answers", () => {
  it("keep a month and read back only known answers", () => {
    const echo = echoes(
      [
        {
          id: "a",
          path: "journal/2026-09-27.md",
          title: "",
          text: "A sentence long enough to be brought back tomorrow.",
        },
      ],
      "2026-09-28",
    )[0]!;
    const key = answerKey(echo, "2026-09-28");
    const old = { "2026-07-01:1": "true" as const };
    expect(withAnswer(old, key, "changed", "2026-09-28")).toEqual({ [key]: "changed" });
    expect(parseAnswers(JSON.stringify({ a: "true", b: "maybe" }))).toEqual({ a: "true" });
  });
});
