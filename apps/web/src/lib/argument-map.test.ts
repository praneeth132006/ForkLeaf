import { describe, expect, it } from "vitest";
import { parseCanvas } from "@forkleaf/markdown-engine";
import { argumentCanvas, argumentStats, readArgument } from "./argument-map";
import { noteMapMarkdown } from "./note-map";

const ESSAY = `---
title: Remote work
---

# Remote work makes teams more productive

## Fewer interruptions

People get longer stretches of focus at home. A 2023 Stanford study found output rose 13% [Bloom](https://example.com/bloom).

## Wider hiring

Teams can hire from anywhere, not just within a commute.

## Objections

Collaboration suffers without hallway conversations.

> Spontaneous meetings fell 40% after offices closed.
`;

describe("readArgument", () => {
  it("finds the claim, the reasons under headings, their evidence and the objections", () => {
    const shape = readArgument(ESSAY);
    expect(shape.claim.text).toBe("Remote work makes teams more productive");
    expect(shape.reasons.map((reason) => reason.text)).toEqual([
      "Fewer interruptions",
      "Wider hiring",
    ]);
    expect(shape.evidence).toHaveLength(1);
    expect(shape.evidence[0]).toMatchObject({ backs: 0, line: 9 });
    expect(shape.evidence[0]!.text).toContain("2023 Stanford study");
    expect(shape.objections.map((point) => point.text)).toEqual([
      "Collaboration suffers without hallway conversations.",
      "Spontaneous meetings fell 40% after offices closed.",
    ]);
  });

  it("marks a reason with nothing behind it as weak", () => {
    expect(argumentStats(readArgument(ESSAY))).toEqual({
      reasons: 2,
      weak: 1,
      evidence: 1,
      objections: 2,
    });
  });

  it("reads an argument written as plain paragraphs", () => {
    const shape = readArgument(
      [
        "Cities should build more bike lanes.",
        "",
        "First, cycling is the cheapest way to move people short distances.",
        "Protected lanes cut injuries by 45% in one survey.",
        "Moreover, bike lanes take cars off the road.",
        "However, shop owners worry about losing parking.",
      ].join("\n"),
    );
    expect(shape.claim.text).toBe("Cities should build more bike lanes.");
    expect(shape.reasons.map((reason) => reason.text)).toEqual([
      "First, cycling is the cheapest way to move people short distances.",
      "Moreover, bike lanes take cars off the road.",
    ]);
    expect(shape.evidence).toEqual([
      expect.objectContaining({
        backs: 0,
        text: "Protected lanes cut injuries by 45% in one survey.",
      }),
    ]);
    expect(shape.objections.map((point) => point.text)).toEqual([
      "However, shop owners worry about losing parking.",
    ]);
  });

  it("honours explicit labels", () => {
    const shape = readArgument(
      "Claim: Tests save time.\nReason: Bugs are caught early.\nEvidence: The 2024 incident log shows it.\nObjection: Tests take time to write.\nRebuttal: Less than debugging takes.",
    );
    expect(shape.claim.text).toBe("Tests save time.");
    expect(shape.reasons.map((reason) => reason.text)).toEqual([
      "Bugs are caught early.",
      "Less than debugging takes.",
    ]);
    expect(shape.evidence[0]).toMatchObject({ backs: 0, text: "The 2024 incident log shows it." });
    expect(shape.objections[0]!.text).toBe("Tests take time to write.");
  });

  it("falls back to the title when the note has no first line to stand on", () => {
    expect(readArgument("", "Untitled").claim.text).toBe("Untitled");
  });

  it("leaves code and flashcards out", () => {
    const shape = readArgument(
      "# Claim here\n\n```\nbecause 2024 data\n```\n\nWhy? :: Because 2024",
    );
    expect(shape.reasons).toEqual([]);
    expect(shape.evidence).toEqual([]);
  });
});

describe("argumentCanvas", () => {
  it("draws every point as a card with arrows to what it supports", () => {
    const canvas = argumentCanvas(readArgument(ESSAY));
    expect(canvas.nodes).toHaveLength(1 + 2 + 1 + 2);
    expect(canvas.edges).toHaveLength(2 + 1 + 2);

    const text = (id: string) =>
      (canvas.nodes.find((node) => node.id === id) as { text: string }).text;
    const claim = canvas.nodes.find((node) =>
      (node as { text?: string }).text?.startsWith("**Claim**"),
    )!;
    expect(claim.color).toBe("6");

    const weak = canvas.nodes.find((node) =>
      (node as { text?: string }).text?.includes("Wider hiring"),
    )!;
    expect(weak.color).toBe("1");
    expect((weak as { text: string }).text).toContain("No evidence yet");

    const labels = canvas.edges.map((edge) => [edge.label, text(edge.toNode).split("\n")[0]]);
    expect(labels).toEqual(
      expect.arrayContaining([
        ["supports", "**Claim**"],
        ["evidence", "**Reason**"],
        ["objects", "**Claim**"],
      ]),
    );
  });

  it("never overlaps two cards", () => {
    const canvas = argumentCanvas(readArgument(ESSAY));
    const boxes = canvas.nodes;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("round-trips through the canvas block it is inserted as", () => {
    const canvas = argumentCanvas(readArgument(ESSAY));
    const markdown = noteMapMarkdown(canvas);
    expect(markdown.startsWith("```canvas\n")).toBe(true);
    const parsed = parseCanvas(markdown.replace(/^```canvas\n/, "").replace(/\n```\n$/, ""));
    expect(parsed.problem).toBeNull();
    expect(parsed.dropped).toBe(0);
    expect(parsed.canvas.nodes).toHaveLength(canvas.nodes.length);
    expect(parsed.canvas.edges).toHaveLength(canvas.edges.length);
  });
});
