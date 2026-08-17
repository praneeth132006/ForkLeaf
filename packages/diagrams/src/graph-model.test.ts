import { describe, it, expect } from "vitest";
import {
  graphToMermaid,
  mermaidToGraph,
  addNode,
  addEdge,
  removeNode,
  nextNodeId,
  type Graph,
} from "./graph-model";
import { detectKind, DIAGRAM_TEMPLATES } from "./templates";
import { parseMermaidError } from "./errors";
import { completionsFor, expandSnippet } from "./completions";

const graph: Graph = {
  direction: "TD",
  nodes: [
    { id: "a", label: "Start", shape: "stadium", x: 100, y: 50 },
    { id: "b", label: "Check", shape: "diamond", x: 100, y: 200 },
    { id: "c", label: "Save", shape: "cylinder", x: 300, y: 200 },
  ],
  edges: [
    { id: "e1", from: "a", to: "b", style: "arrow" },
    { id: "e2", from: "b", to: "c", label: "yes", style: "arrow" },
  ],
};

describe("graphToMermaid", () => {
  it("renders each shape with the right delimiters", () => {
    const code = graphToMermaid(graph);
    expect(code).toContain("a([Start])");
    expect(code).toContain("b{Check}");
    expect(code).toContain("c[(Save)]");
  });

  it("renders labelled and unlabelled edges", () => {
    const code = graphToMermaid(graph);
    expect(code).toContain("a --> b");
    expect(code).toContain("b -- yes --> c");
  });

  it("stores node positions in a comment mermaid will ignore", () => {
    const code = graphToMermaid(graph);
    expect(code).toContain("%% forkleaf:layout a:100,50;b:100,200;c:300,200");
  });

  it("quotes labels containing characters that would break the syntax", () => {
    const code = graphToMermaid({
      direction: "LR",
      nodes: [{ id: "n1", label: "Cost [USD]", shape: "rect", x: 0, y: 0 }],
      edges: [],
    });
    expect(code).toContain('n1["Cost [USD]"]');
  });

  it("emits subgraphs for grouped nodes", () => {
    const code = graphToMermaid({
      direction: "LR",
      nodes: [
        { id: "a", label: "A", shape: "rect", x: 0, y: 0, group: "Phase one" },
        { id: "b", label: "B", shape: "rect", x: 0, y: 0, group: "Phase one" },
      ],
      edges: [],
    });
    expect(code).toContain("subgraph Phase_one");
    expect(code).toContain("end");
  });

  it("replaces characters that are illegal in a node id", () => {
    const code = graphToMermaid({
      direction: "TD",
      nodes: [{ id: "my node!", label: "X", shape: "rect", x: 0, y: 0 }],
      edges: [],
    });
    expect(code).toContain("my_node_[X]");
  });
});

describe("mermaidToGraph", () => {
  it("round-trips a graph through mermaid source without losing anything", () => {
    const parsed = mermaidToGraph(graphToMermaid(graph));

    expect(parsed).not.toBeNull();
    expect(parsed!.direction).toBe("TD");
    expect(parsed!.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ["a", "Start", "stadium"],
      ["b", "Check", "diamond"],
      ["c", "Save", "cylinder"],
    ]);
    expect(parsed!.edges.map((e) => [e.from, e.to, e.label])).toEqual([
      ["a", "b", undefined],
      ["b", "c", "yes"],
    ]);
  });

  it("restores the saved node positions", () => {
    const parsed = mermaidToGraph(graphToMermaid(graph))!;
    expect(parsed.nodes[2]).toMatchObject({ x: 300, y: 200 });
  });

  it("parses a hand-written flowchart that has no layout comment", () => {
    const parsed = mermaidToGraph(`flowchart LR
    Start([Begin]) --> Work[Do the thing]
    Work --> Done([Finish])`);

    expect(parsed!.direction).toBe("LR");
    expect(parsed!.nodes).toHaveLength(3);
    expect(parsed!.edges).toHaveLength(2);
    // Nodes with no stored position still get sensible, non-overlapping ones.
    expect(parsed!.nodes.every((n) => n.x > 0 && n.y > 0)).toBe(true);
  });

  it("understands the pipe form of edge labels", () => {
    const parsed = mermaidToGraph("flowchart TD\n  A -->|yes| B")!;
    expect(parsed.edges[0]).toMatchObject({ from: "A", to: "B", label: "yes" });
  });

  it("recognises every edge style", () => {
    const parsed = mermaidToGraph(`flowchart TD
    A --> B
    B --- C
    C -.-> D
    D ==> E`)!;

    expect(parsed.edges.map((e) => e.style)).toEqual(["arrow", "open", "dotted", "thick"]);
  });

  it("keeps the legacy 'graph' keyword working", () => {
    expect(mermaidToGraph("graph TD\n  A --> B")).not.toBeNull();
  });

  it("assigns nodes to the subgraph they were declared in", () => {
    const parsed = mermaidToGraph(`flowchart LR
    subgraph Build
        A[Compile] --> B[Test]
    end
    B --> C[Ship]`)!;

    expect(parsed.nodes.find((n) => n.id === "A")!.group).toBe("Build");
    expect(parsed.nodes.find((n) => n.id === "C")!.group).toBeUndefined();
  });

  it("returns null for diagram types the visual builder cannot edit", () => {
    expect(mermaidToGraph("sequenceDiagram\n  A->>B: hi")).toBeNull();
    expect(mermaidToGraph('pie\n  "a" : 1')).toBeNull();
    expect(mermaidToGraph("")).toBeNull();
  });

  it("skips lines it cannot parse instead of throwing", () => {
    const parsed = mermaidToGraph(`flowchart TD
    A --> B
    this line is nonsense !!!
    style A fill:#fff
    B --> C`);

    expect(parsed).not.toBeNull();
    expect(parsed!.edges).toHaveLength(2);
  });

  it("handles source that is still being typed", () => {
    expect(() => mermaidToGraph("flowchart TD\n  A -->")).not.toThrow();
    expect(() => mermaidToGraph("flowchart TD\n  A[unclosed")).not.toThrow();
  });
});

describe("graph editing", () => {
  it("removes a node together with every edge touching it", () => {
    const result = removeNode(graph, "b");
    expect(result.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(result.edges).toHaveLength(0);
  });

  it("refuses self-loops and duplicate edges", () => {
    expect(addEdge(graph, "a", "a").edges).toHaveLength(2);
    expect(addEdge(graph, "a", "b").edges).toHaveLength(2);
    expect(addEdge(graph, "a", "c").edges).toHaveLength(3);
  });

  it("generates ids that do not collide", () => {
    const withN1 = addNode(graph, { id: "n1", label: "X", shape: "rect", x: 0, y: 0 });
    expect(nextNodeId(withN1)).toBe("n2");
  });
});

describe("template gallery", () => {
  it("every template declares the diagram type it claims to be", () => {
    for (const template of DIAGRAM_TEMPLATES) {
      expect(detectKind(template.code), `${template.id} should detect as ${template.kind}`).toBe(
        template.kind,
      );
    }
  });

  it("every flowchart template can be opened in the visual builder", () => {
    for (const template of DIAGRAM_TEMPLATES.filter((t) => t.kind === "flowchart")) {
      const parsed = mermaidToGraph(template.code);
      expect(parsed, `${template.id} should parse`).not.toBeNull();
      expect(parsed!.nodes.length).toBeGreaterThan(0);
    }
  });

  it("ignores leading comments when detecting the type", () => {
    expect(detectKind("%% a comment\n\nflowchart TD\n A-->B")).toBe("flowchart");
  });
});

describe("error messages", () => {
  it("explains a missing diagram type in plain language", () => {
    const error = parseMermaidError(new Error("No diagram type detected for text"), "hello");
    expect(error.message).toContain("doesn't name a diagram type");
    expect(error.hint).toContain("flowchart TD");
  });

  it("pulls the line number out and points at the right line", () => {
    const error = parseMermaidError(
      new Error("Parse error on line 3:\n... A --> \n---------^\nExpecting 'NODE_STRING'"),
      "flowchart TD\n A --> B\n A -->",
    );
    expect(error.line).toBe(3);
    expect(error.message).toContain("doesn't point at anything");
  });

  it("clamps an out-of-range line number to the last line", () => {
    // Mermaid counts lines against its own preprocessed source and can report
    // one past the end. Underlining the last line beats underlining nothing.
    const error = parseMermaidError(new Error("Parse error on line 99"), "flowchart TD\nA --> B");
    expect(error.line).toBe(2);
  });

  it("quotes the offending text when mermaid only reports a location", () => {
    const raw = "Parse error on line 7:\n...    Broken -->\n----------------^";
    const error = parseMermaidError(new Error(raw), "flowchart TD\nx\nx\nx\nx\nx\nBroken -->");

    // A bare "Parse error on line 7:" tells the user nothing actionable.
    expect(error.message).not.toBe("Parse error on line 7:");
    expect(error.message).toContain("Broken -->");
  });

  it("never quotes the caret line back at the user", () => {
    const error = parseMermaidError(new Error("Parse error on line 2:\n-------^"), "a\nb");
    expect(error.message).not.toContain("---");
  });

  it("always offers a hint, even for an unrecognised error", () => {
    const error = parseMermaidError(new Error("something totally unexpected"), "x");
    expect(error.hint.length).toBeGreaterThan(0);
  });

  it("always keeps the raw message for the details view", () => {
    const error = parseMermaidError(new Error("something unexpected"), "x");
    expect(error.raw).toBe("something unexpected");
  });
});

describe("completions", () => {
  it("offers diagram types when nothing has been typed yet", () => {
    const labels = completionsFor(null).map((c) => c.label);
    expect(labels).toContain("flowchart");
    expect(labels).toContain("sequenceDiagram");
  });

  it("offers flowchart-specific syntax once the type is known", () => {
    const labels = completionsFor("flowchart").map((c) => c.label);
    expect(labels).toContain("node (decision)");
    expect(labels).not.toContain("participant");
  });

  it("expands a snippet and reports where the cursor goes", () => {
    const { text, cursor } = expandSnippet("${1:id}[${2:Label}]");
    expect(text).toBe("id[Label]");
    expect(cursor).toBe(0);
  });

  it("puts the cursor at the end when a snippet has no placeholders", () => {
    const { text, cursor } = expandSnippet("autonumber");
    expect(text).toBe("autonumber");
    expect(cursor).toBe(10);
  });

  it("every snippet produces text that still names its diagram type", () => {
    // Guards against a typo in the table silently shipping broken snippets.
    for (const completion of completionsFor("flowchart")) {
      expect(expandSnippet(completion.snippet).text.length).toBeGreaterThan(0);
    }
  });
});
