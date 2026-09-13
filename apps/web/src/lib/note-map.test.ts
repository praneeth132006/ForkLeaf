import { describe, expect, it } from "vitest";
import { buildLinkGraph, parseCanvas, type CanvasNode } from "@forkleaf/markdown-engine";
import { mapNote, noteMapMarkdown } from "./note-map";

const note = (path: string, content: string) => ({
  path,
  title: path.replace(/\.md$/, "").split("/").pop()!,
  content,
});

const GRAPH = buildLinkGraph([
  note("Plan.md", "See [[Risks]] and [[Budget]]."),
  note("Risks.md", "Back to [[Plan]]. Also [[Hiring]]."),
  note("Budget.md", "Costs."),
  note("Retro.md", "Looked at [[Plan]]."),
  note("Hiring.md", "People [[Budget]]."),
  note("Unrelated.md", "Nothing."),
]);

const files = (nodes: CanvasNode[]) =>
  nodes.map((node) => (node.type === "file" ? node.file : "")).sort();

describe("mapNote", () => {
  it("puts the note in the middle and everything it links with around it", () => {
    const canvas = mapNote(GRAPH, "Plan.md");
    expect(files(canvas.nodes)).toEqual(["Budget.md", "Plan.md", "Retro.md", "Risks.md"]);
    const centre = canvas.nodes.find((node) => node.type === "file" && node.file === "Plan.md")!;
    expect(centre.x + centre.width / 2).toBe(0);
    expect(centre.y + centre.height / 2).toBe(0);
  });

  it("links out to the right, in from the left, both ways at the top", () => {
    const canvas = mapNote(GRAPH, "Plan.md");
    const at = (file: string) => {
      const node = canvas.nodes.find((each) => each.type === "file" && each.file === file)!;
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    };
    expect(at("Budget.md").x).toBeGreaterThan(0);
    expect(at("Retro.md").x).toBeLessThan(0);
    expect(at("Risks.md").y).toBeLessThan(0);
  });

  it("draws an arrow for each link between notes on the map, in its direction", () => {
    const canvas = mapNote(GRAPH, "Plan.md");
    const fileOf = new Map(
      canvas.nodes.map((node) => [node.id, node.type === "file" ? node.file : ""]),
    );
    const arrows = canvas.edges.map(
      (edge) => `${fileOf.get(edge.fromNode)}→${fileOf.get(edge.toNode)}`,
    );
    expect(arrows.sort()).toEqual([
      "Plan.md→Budget.md",
      "Plan.md→Risks.md",
      "Retro.md→Plan.md",
      "Risks.md→Plan.md",
    ]);
  });

  it("follows links one step further when asked, and keeps within the limit", () => {
    expect(files(mapNote(GRAPH, "Plan.md", { depth: 2 }).nodes)).toContain("Hiring.md");
    expect(mapNote(GRAPH, "Plan.md", { depth: 2, limit: 3 }).nodes).toHaveLength(3);
  });

  it("never stacks two cards on the same spot", () => {
    const nodes = mapNote(GRAPH, "Plan.md", { depth: 2 }).nodes;
    const spots = new Set(nodes.map((node) => `${node.x},${node.y}`));
    expect(spots.size).toBe(nodes.length);
  });

  it("maps a note with no links as just the note", () => {
    const canvas = mapNote(GRAPH, "Unrelated.md");
    expect(canvas.nodes).toHaveLength(1);
    expect(canvas.edges).toEqual([]);
  });

  it("writes a canvas block that reads back as the same board", () => {
    const canvas = mapNote(GRAPH, "Plan.md");
    const markdown = noteMapMarkdown(canvas);
    expect(markdown.startsWith("```canvas\n")).toBe(true);
    const body = markdown.replace(/^```canvas\n/, "").replace(/\n```\n$/, "");
    const read = parseCanvas(body);
    expect(read.problem).toBeNull();
    expect(read.canvas.nodes).toHaveLength(canvas.nodes.length);
    expect(read.canvas.edges).toHaveLength(canvas.edges.length);
  });
});
