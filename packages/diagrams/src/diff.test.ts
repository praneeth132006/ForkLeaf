import { describe, expect, it } from "vitest";
import {
  diffDiagrams,
  pairDiagrams,
  summarizeDiff,
  type GraphDiff,
  type SequenceDiff,
} from "./diff";

const graph = (body: string) => `flowchart TD\n${body}\n`;

/** Narrows to the graph shape, failing the test rather than the type checker. */
function asGraph(diff: ReturnType<typeof diffDiagrams>): GraphDiff {
  if (diff.shape !== "graph") throw new Error(`expected a graph diff, got ${diff.shape}`);
  return diff;
}

function asSequence(diff: ReturnType<typeof diffDiagrams>): SequenceDiff {
  if (diff.shape !== "sequence") throw new Error(`expected a sequence diff, got ${diff.shape}`);
  return diff;
}

describe("diffDiagrams — flowcharts", () => {
  it("reports no change for the same diagram", () => {
    const code = graph("  a[One] --> b[Two]");
    const diff = asGraph(diffDiagrams(code, code));

    expect(diff.identical).toBe(true);
    expect(summarizeDiff(diff)).toBe("No change");
  });

  it("ignores reordering and whitespace, which text diffs cannot", () => {
    const before = graph("  a[One] --> b[Two]\n  b --> c[Three]");
    const after = graph("  b[Two] --> c[Three]\n\n  a[One]    -->   b");

    expect(asGraph(diffDiagrams(before, after)).identical).toBe(true);
  });

  it("finds an added node and the edge that reaches it", () => {
    const before = graph("  a[One] --> b[Two]");
    const after = graph("  a[One] --> b[Two]\n  b --> c[Three]");

    const diff = asGraph(diffDiagrams(before, after));

    expect(diff.nodeCounts.added).toBe(1);
    expect(diff.edgeCounts.added).toBe(1);
    expect(diff.nodes.find((node) => node.status === "added")?.after?.label).toBe("Three");
    expect(summarizeDiff(diff)).toBe("1 node added, 1 edge added");
  });

  it("finds a removed node", () => {
    const before = graph("  a[One] --> b[Two]\n  b --> c[Three]");
    const after = graph("  a[One] --> b[Two]");

    const diff = asGraph(diffDiagrams(before, after));

    expect(diff.nodeCounts.removed).toBe(1);
    expect(diff.edgeCounts.removed).toBe(1);
    expect(diff.nodes.find((node) => node.status === "removed")?.before?.label).toBe("Three");
  });

  it("reads a rewired edge as one removal and one addition, not a rename", () => {
    const before = graph("  a[One] --> b[Two]\n  a --> c[Three]");
    const after = graph("  a[One] --> b[Two]\n  b --> c[Three]");

    const diff = asGraph(diffDiagrams(before, after));

    expect(diff.nodeCounts.same).toBe(3);
    expect(diff.edgeCounts.added).toBe(1);
    expect(diff.edgeCounts.removed).toBe(1);
  });

  it("matches a renamed id by its label, so the box is changed and not replaced", () => {
    const before = graph("  svc1[Rate limiter] --> db[(Store)]");
    const after = graph("  rateLimiter[Rate limiter] --> db[(Store)]");

    const diff = asGraph(diffDiagrams(before, after));

    expect(diff.nodeCounts.changed).toBe(1);
    expect(diff.nodeCounts.added).toBe(0);
    expect(diff.nodeCounts.removed).toBe(0);
    // And the edge that touches it survives the rename.
    expect(diff.edgeCounts.same).toBe(1);

    const renamed = diff.nodes.find((node) => node.status === "changed");
    expect(renamed?.changes).toContainEqual({ field: "id", before: "svc1", after: "rateLimiter" });
  });

  it("separates a moved node from a changed one", () => {
    const before =
      "flowchart TD\n    %% forkleaf:layout a:100,50;b:100,200\n    a[One] --> b[Two]\n";
    const after =
      "flowchart TD\n    %% forkleaf:layout a:300,50;b:100,200\n    a[One] --> b[Two]\n";

    const diff = asGraph(diffDiagrams(before, after));

    expect(diff.nodeCounts.moved).toBe(1);
    expect(diff.nodeCounts.changed).toBe(0);
    expect(diff.layoutOnly).toBe(true);
    expect(diff.identical).toBe(false);
    expect(summarizeDiff(diff)).toBe("Layout only");
  });

  it("notices a relabelled node", () => {
    const before = graph("  a[Worker] --> b[Queue]");
    const after = graph("  a[Consumer] --> b[Queue]");

    const diff = asGraph(diffDiagrams(before, after));

    expect(diff.nodeCounts.changed).toBe(1);
    expect(diff.nodes.find((node) => node.status === "changed")?.changes).toContainEqual({
      field: "label",
      before: "Worker",
      after: "Consumer",
    });
  });

  it("notices an edge label and a flow direction change", () => {
    const before = "flowchart TD\n  a[One] -- yes --> b[Two]\n";
    const after = "flowchart LR\n  a[One] -- no --> b[Two]\n";

    const diff = asGraph(diffDiagrams(before, after));

    expect(diff.edgeCounts.changed).toBe(1);
    expect(diff.changes).toContainEqual({ field: "direction", before: "TD", after: "LR" });
  });
});

describe("diffDiagrams — sequence diagrams", () => {
  const sequence = (body: string) => `sequenceDiagram\n${body}\n`;

  it("reports no change for the same diagram", () => {
    const code = sequence("  App->>Api: fetch\n  Api-->>App: rows");
    expect(asSequence(diffDiagrams(code, code)).identical).toBe(true);
  });

  it("reports an inserted message where it happened, leaving the rest alone", () => {
    const before = sequence("  App->>Api: fetch\n  Api-->>App: rows");
    const after = sequence("  App->>Auth: token\n  App->>Api: fetch\n  Api-->>App: rows");

    const diff = asSequence(diffDiagrams(before, after));

    expect(diff.messageCounts.added).toBe(1);
    expect(diff.messageCounts.same).toBe(2);
    expect(diff.participantCounts.added).toBe(1);
    expect(diff.messages[0]?.status).toBe("added");
  });

  it("reads an edited message as a change rather than a swap", () => {
    const before = sequence("  App->>Api: fetch\n  Api-->>App: rows");
    const after = sequence("  App->>Api: fetch all\n  Api-->>App: rows");

    const diff = asSequence(diffDiagrams(before, after));

    expect(diff.messageCounts.changed).toBe(1);
    expect(diff.messageCounts.added).toBe(0);
    expect(diff.messageCounts.removed).toBe(0);
  });

  it("reports a removed message", () => {
    const before = sequence("  App->>Api: fetch\n  Api-->>App: rows");
    const after = sequence("  App->>Api: fetch");

    expect(asSequence(diffDiagrams(before, after)).messageCounts.removed).toBe(1);
  });
});

describe("diffDiagrams — everything else", () => {
  it("falls back to an opaque diff for a type with no model", () => {
    const before = 'pie\n  "a" : 1\n';
    const after = 'pie\n  "a" : 2\n';

    const diff = diffDiagrams(before, after);

    expect(diff.shape).toBe("opaque");
    expect(diff.identical).toBe(false);
    expect(summarizeDiff(diff)).toBe("Source changed");
  });

  it("still recognises an unchanged opaque diagram", () => {
    const code = 'pie\n  "a" : 1\n';
    expect(diffDiagrams(code, code).identical).toBe(true);
  });

  it("says so when the diagram type changed", () => {
    const diff = diffDiagrams('pie\n  "a" : 1\n', "sequenceDiagram\n  A->>B: hi\n");
    expect(diff.shape).toBe("opaque");
  });
});

describe("pairDiagrams", () => {
  it("pairs one diagram with one diagram", () => {
    const pairs = pairDiagrams([graph("  a[One] --> b[Two]")], [graph("  a[One] --> b[Three]")]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.beforeIndex).toBe(0);
    expect(pairs[0]?.afterIndex).toBe(0);
  });

  it("keeps diagrams paired when one is inserted above them", () => {
    const flow = graph("  a[Ingest] --> b[Transform]");
    const states = "stateDiagram-v2\n  idle --> running\n";
    const fresh = graph("  x[Brand] --> y[New]");

    const pairs = pairDiagrams([flow, states], [fresh, flow, states]);

    const paired = pairs.filter((pair) => pair.before !== null && pair.after !== null);
    expect(paired).toHaveLength(2);
    expect(pairs.find((pair) => pair.before === null)?.afterIndex).toBe(0);
  });

  it("reports a diagram with no counterpart on either side", () => {
    const pairs = pairDiagrams([graph("  a[Gone] --> b[Away]")], []);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.afterIndex).toBeNull();
  });
});
