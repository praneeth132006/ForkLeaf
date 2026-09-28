import { describe, expect, it } from "vitest";
import { diagramCards } from "./diagram-cards";

const fence = (body: string) => `\`\`\`mermaid\n${body}\n\`\`\``;

describe("diagramCards", () => {
  it("asks what follows each box in a flowchart, under the diagram's heading", () => {
    const note = `# Notes\n\n## Release flow\n\n${fence(
      "flowchart TD\n  A[Write] --> B{Review?}\n  B -->|yes| C[Ship]\n  B -->|no| A",
    )}`;
    expect(
      diagramCards(note, "Notes").map(({ question, answer, line }) => ({ question, answer, line })),
    ).toEqual([
      { question: "Release flow: what comes after “Write”?", answer: "Review?", line: 4 },
      {
        question: "Release flow: from “Review?”, what does “yes” lead to?",
        answer: "Ship",
        line: 4,
      },
      {
        question: "Release flow: from “Review?”, what does “no” lead to?",
        answer: "Write",
        line: 4,
      },
    ]);
  });

  it("puts every target of the same arrow in one answer", () => {
    const cards = diagramCards(
      fence("flowchart LR\n  A[Plan] --> B[Build]\n  A --> C[Test]"),
      "Work",
    );
    expect(cards).toEqual([
      expect.objectContaining({
        question: "Work: what comes after “Plan”?",
        answer: "Build, Test",
      }),
    ]);
  });

  it("names the start and end of a state diagram", () => {
    const cards = diagramCards(
      fence("stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : start\n  Busy --> [*]"),
      "Machine",
    );
    expect(cards.map((card) => [card.question, card.answer])).toEqual([
      ["Machine: what comes after “the start”?", "Idle"],
      ["Machine: from “Idle”, what does “start” lead to?", "Busy"],
      ["Machine: what comes after “Busy”?", "the end"],
    ]);
  });

  it("asks for a mind map's branches", () => {
    const cards = diagramCards(fence("mindmap\n  root((Biology))\n    Cells\n    Genetics"), "Bio");
    expect(cards.map((card) => [card.question, card.answer])).toEqual([
      ["Bio: what branches from “Biology”?", "Cells, Genetics"],
    ]);
  });

  it("leaves other code, and diagrams with no arrows, alone", () => {
    expect(diagramCards("```js\nA --> B\n```", "x")).toEqual([]);
    expect(diagramCards(fence('pie\n  "a" : 1'), "x")).toEqual([]);
  });
});
