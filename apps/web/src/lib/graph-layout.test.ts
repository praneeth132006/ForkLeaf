import { describe, expect, it } from "vitest";
import { buildLinkGraph } from "@forkleaf/markdown-engine";
import { graphFrom, layoutGraph } from "./graph-layout";

const note = (path: string, content: string) => ({ path, title: path.replace(".md", ""), content });

const GRAPH = buildLinkGraph([
  note("a.md", "[[b]] and [[b]] again, and [[c]]"),
  note("b.md", "back to [[a]]"),
  note("c.md", "[[d]]"),
  note("d.md", ""),
  note("lonely.md", "no links, and [[missing]]"),
  note("self.md", "[[self]]"),
]);

const title = (path: string) => path.toUpperCase();

describe("graphFrom", () => {
  it("draws one undirected edge per linked pair, and no self-links", () => {
    const { edges } = graphFrom(GRAPH, title);
    expect(edges).toEqual([
      { source: "a.md", target: "b.md" },
      { source: "a.md", target: "c.md" },
      { source: "c.md", target: "d.md" },
    ]);
  });

  it("leaves out notes with no links unless asked", () => {
    expect(graphFrom(GRAPH, title).nodes.map((node) => node.id)).toEqual([
      "a.md",
      "b.md",
      "c.md",
      "d.md",
    ]);
    const all = graphFrom(GRAPH, title, { includeOrphans: true }).nodes.map((node) => node.id);
    expect(all).toContain("lonely.md");
    expect(all).toContain("self.md");
  });

  it("counts degree in both directions and names nodes", () => {
    const a = graphFrom(GRAPH, title).nodes.find((node) => node.id === "a.md");
    expect(a).toEqual({ id: "a.md", title: "A.MD", degree: 2 });
  });

  it("cuts down to the neighbourhood of a note", () => {
    const one = graphFrom(GRAPH, title, { focus: "b.md", depth: 1 });
    expect(one.nodes.map((node) => node.id)).toEqual(["a.md", "b.md"]);
    expect(one.edges).toEqual([{ source: "a.md", target: "b.md" }]);

    const two = graphFrom(GRAPH, title, { focus: "b.md", depth: 2 });
    expect(two.nodes.map((node) => node.id)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("shows a focused note with no links on its own", () => {
    expect(graphFrom(GRAPH, title, { focus: "lonely.md" }).nodes.map((n) => n.id)).toEqual([
      "lonely.md",
    ]);
  });
});

describe("layoutGraph", () => {
  const size = { width: 800, height: 600 };

  it("is deterministic and stays inside the frame", () => {
    const { nodes, edges } = graphFrom(GRAPH, title, { includeOrphans: true });
    const first = layoutGraph(nodes, edges, size);
    expect(layoutGraph(nodes, edges, size)).toEqual(first);
    for (const node of first) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(size.width);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(size.height);
    }
  });

  it("puts linked notes closer together than unlinked ones", () => {
    const nodes = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, title: id, degree: 1 }));
    const edges = [
      { source: "a", target: "b" },
      { source: "c", target: "d" },
      { source: "e", target: "f" },
    ];
    const placed = new Map(layoutGraph(nodes, edges, size).map((node) => [node.id, node]));
    const gap = (x: string, y: string) =>
      Math.hypot(placed.get(x)!.x - placed.get(y)!.x, placed.get(x)!.y - placed.get(y)!.y);

    const linked = (gap("a", "b") + gap("c", "d") + gap("e", "f")) / 3;
    const unlinked = (gap("a", "c") + gap("b", "e") + gap("d", "f")) / 3;
    expect(linked).toBeLessThan(unlinked);
  });

  it("handles no nodes and one node", () => {
    expect(layoutGraph([], [], size)).toEqual([]);
    expect(layoutGraph([{ id: "x", title: "x", degree: 0 }], [], size)).toEqual([
      { id: "x", title: "x", degree: 0, x: 400, y: 300 },
    ]);
  });

  it("finishes a few hundred notes quickly", () => {
    const nodes = Array.from({ length: 300 }, (_, i) => ({
      id: `n${i}`,
      title: `n${i}`,
      degree: 1,
    }));
    const edges = nodes.slice(1).map((node, i) => ({ source: `n${i}`, target: node.id }));
    const started = performance.now();
    layoutGraph(nodes, edges, size);
    expect(performance.now() - started).toBeLessThan(3000);
  });
});
