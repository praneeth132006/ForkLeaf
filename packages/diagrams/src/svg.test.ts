import { describe, expect, it } from "vitest";
import { diffDiagrams, type GraphDiff } from "./diff";
import { mermaidToGraph } from "./graph-model";
import { DARK_SVG_THEME, diffToSvg, graphToSvg, mermaidToSvg } from "./svg";

const arranged = [
  "flowchart TD",
  "    %% forkleaf:layout a:100,50;b:100,200;c:300,200",
  "    a[Gateway] --> b[Worker]",
  "    a --> c[(Store)]",
  "",
].join("\n");

describe("graphToSvg", () => {
  it("draws a graph without a DOM", () => {
    const svg = mermaidToSvg(arranged);

    expect(svg).not.toBeNull();
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox=");
    expect(svg).toContain("Gateway");
    expect(svg).toContain("Worker");
    // Two edges, and the arrowhead marker they reference.
    expect(svg!.match(/<line /g) ?? []).toHaveLength(2);
    expect(svg).toContain("fl-arrow-plain");
  });

  it("escapes labels rather than letting them close a tag", () => {
    const svg = mermaidToSvg('flowchart TD\n  a["<script>alert(1)</script>"] --> b[Safe]\n');

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("arranges a diagram that was never arranged, instead of stacking it", () => {
    const svg = mermaidToSvg("flowchart TD\n  a[One] --> b[Two]\n  b --> c[Three]\n");

    // tidyLayout puts each depth on its own row, so the drawing has height.
    const box = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg!);
    expect(box).not.toBeNull();
    expect(Number(box![4])).toBeGreaterThan(200);
  });

  it("returns null for a diagram it has no model for", () => {
    expect(mermaidToSvg('pie\n  "a" : 1\n')).toBeNull();
  });

  it("draws an empty diagram as a placeholder rather than throwing", () => {
    const svg = graphToSvg({ kind: "flowchart", direction: "TD", nodes: [], edges: [] });
    expect(svg).toContain("Empty diagram");
  });

  it("writes class members into the box, since they are the reason for it", () => {
    const svg = mermaidToSvg("classDiagram\n  class Note {\n    +id: string\n    +save()\n  }\n");

    expect(svg).toContain("Note");
    expect(svg).toContain("+id: string");
    expect(svg).toContain("+save()");
  });

  it("honours the theme it is given", () => {
    const svg = graphToSvg(mermaidToGraph(arranged)!, { theme: DARK_SVG_THEME });
    expect(svg).toContain(DARK_SVG_THEME.background);
  });

  it("adds width and height to the root element only when asked", () => {
    const graph = mermaidToGraph(arranged)!;
    const rootOf = (svg: string) => svg.slice(0, svg.indexOf(">") + 1);

    expect(rootOf(graphToSvg(graph))).not.toContain("width=");
    expect(rootOf(graphToSvg(graph, { sized: true }))).toContain("width=");
  });
});

describe("diffToSvg", () => {
  const before = arranged;
  const after = [
    "flowchart TD",
    "    %% forkleaf:layout a:100,50;b:100,200;d:300,200",
    "    a[Gateway] --> b[Worker]",
    "    a --> d[Cache]",
    "",
  ].join("\n");

  it("draws what left and what arrived in one picture", () => {
    const diff = diffDiagrams(before, after) as GraphDiff;
    const svg = diffToSvg(diff);

    // The added node, the removed one, and both of their colours.
    expect(svg).toContain("Cache");
    expect(svg).toContain("Store");
    expect(svg).toContain("#DCFCE7"); // added fill
    expect(svg).toContain("#FEE2E2"); // removed fill
  });

  it("keeps a removed edge attached to the nodes it ran between", () => {
    const diff = diffDiagrams(
      before,
      "flowchart TD\n  a[Gateway] --> b[Worker]\n  c[(Store)]\n",
    ) as GraphDiff;
    const svg = diffToSvg(diff);

    // One surviving edge plus the ghost of the one that was cut.
    expect(svg.match(/<line /g) ?? []).toHaveLength(2);
    expect(svg).toContain("stroke-dasharray");
  });

  it("draws an unchanged diagram plainly", () => {
    const diff = diffDiagrams(before, before) as GraphDiff;
    const svg = diffToSvg(diff);

    expect(svg).not.toContain("#DCFCE7");
    expect(svg).not.toContain("#FEE2E2");
  });
});
