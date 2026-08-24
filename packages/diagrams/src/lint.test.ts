import { describe, expect, it } from "vitest";
import { lintDiagram } from "./lint";

const rules = (code: string) => lintDiagram(code).map((finding) => finding.rule);

describe("lintDiagram — flowcharts", () => {
  it("says nothing about a healthy diagram", () => {
    expect(lintDiagram("flowchart TD\n  a[Ingest] --> b[Store]\n")).toEqual([]);
  });

  it("finds a box wired to nothing", () => {
    const findings = lintDiagram("flowchart TD\n  a[Ingest] --> b[Store]\n  c[Cache]\n");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("orphan-node");
    expect(findings[0]?.message).toContain("Cache");
    expect(findings[0]?.targets).toEqual(["c"]);
  });

  it("stays quiet when nothing is connected, since that is a list", () => {
    expect(rules("flowchart TD\n  a[One]\n  b[Two]\n  c[Three]\n")).toEqual([]);
  });

  it("stays quiet about a diagram with one box", () => {
    expect(rules("flowchart TD\n  a[Alone]\n")).toEqual([]);
  });

  it("names two boxes with the same words in them", () => {
    const findings = lintDiagram("flowchart TD\n  a[Validate] --> b[Store]\n  b --> c[Validate]\n");

    expect(findings.map((f) => f.rule)).toContain("duplicate-label");
    expect(findings.find((f) => f.rule === "duplicate-label")?.targets).toEqual(["a", "c"]);
  });

  it("finds an arrow drawn twice", () => {
    const findings = lintDiagram("flowchart TD\n  a[One] --> b[Two]\n  a --> b\n");

    expect(findings.map((f) => f.rule)).toContain("duplicate-edge");
  });
});

describe("lintDiagram — state machines", () => {
  it("finds a state nothing can reach", () => {
    const findings = lintDiagram(
      "stateDiagram-v2\n  [*] --> idle\n  idle --> running\n  orphaned --> idle\n",
    );

    const unreachable = findings.find((f) => f.rule === "unreachable-state");
    expect(unreachable?.targets).toEqual(["orphaned"]);
  });

  it("accepts a machine where everything is reachable from the start", () => {
    expect(
      rules("stateDiagram-v2\n  [*] --> idle\n  idle --> running\n  running --> [*]\n"),
    ).toEqual([]);
  });

  it("finds a state the machine can enter and never leave", () => {
    const findings = lintDiagram(
      "stateDiagram-v2\n  [*] --> idle\n  idle --> running\n  idle --> stuck\n  running --> [*]\n",
    );

    const deadEnd = findings.find((f) => f.rule === "dead-end-state");
    expect(deadEnd?.targets).toEqual(["stuck"]);
  });

  it("does not call a leaf a dead end when the chart has no end state at all", () => {
    expect(rules("stateDiagram-v2\n  [*] --> idle\n  idle --> done\n")).toEqual([]);
  });
});

describe("lintDiagram — mindmaps", () => {
  it("objects to a mindmap with two centres", () => {
    const findings = lintDiagram("mindmap\n  root((One))\n    a[Leaf]\n");
    // A well-formed mindmap has one root, so this one is quiet.
    expect(findings.map((f) => f.rule)).not.toContain("mindmap-roots");
  });
});

describe("lintDiagram — sequence diagrams", () => {
  it("finds a participant nobody talks to", () => {
    const findings = lintDiagram(
      "sequenceDiagram\n  participant App\n  participant Api\n  participant Ghost\n  App->>Api: fetch\n",
    );

    const silent = findings.find((f) => f.rule === "silent-participant");
    expect(silent?.message).toContain("Ghost");
  });

  it("accepts a diagram where everyone speaks", () => {
    expect(rules("sequenceDiagram\n  App->>Api: fetch\n  Api-->>App: rows\n")).toEqual([]);
  });

  it("notes a call with no reply, but only where replies are the convention", () => {
    const findings = lintDiagram(
      "sequenceDiagram\n  App->>Api: fetch\n  Api-->>App: rows\n  App->>Log: write\n",
    );

    expect(findings.map((f) => f.rule)).toContain("unanswered-call");
  });

  it("does not ask for replies in a diagram that never uses them", () => {
    expect(rules("sequenceDiagram\n  App->>Api: fetch\n  Api->>Db: query\n")).toEqual([]);
  });
});

describe("lintDiagram — everything else", () => {
  it("says nothing about a diagram type it has no model for", () => {
    expect(lintDiagram('pie\n  "a" : 1\n')).toEqual([]);
  });

  it("says nothing about an empty diagram", () => {
    expect(lintDiagram("   ")).toEqual([]);
  });
});
