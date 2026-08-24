import { describe, expect, it } from "vitest";
import {
  diagramNodes,
  indexDiagrams,
  normalizeAnchor,
  resolveDiagramAnchor,
  searchDiagramNodes,
} from "./search";

const architecture = "flowchart LR\n  gw[API gateway] --> rl[Rate limiter]\n  rl --> db[(Store)]\n";
const flow = "sequenceDiagram\n  App->>Api: fetch\n  Api-->>App: rows\n";

describe("diagramNodes", () => {
  it("names every box in a flowchart", () => {
    expect(diagramNodes(architecture).map((node) => node.label)).toEqual([
      "API gateway",
      "Rate limiter",
      "Store",
    ]);
  });

  it("names the lifelines in a sequence diagram", () => {
    const nodes = diagramNodes(flow);

    expect(nodes.map((node) => node.label)).toEqual(["App", "Api"]);
    expect(nodes.every((node) => node.role === "participant")).toBe(true);
  });

  it("skips the pseudo-states, which nobody searches for", () => {
    const nodes = diagramNodes("stateDiagram-v2\n  [*] --> idle\n  idle --> [*]\n");
    expect(nodes.map((node) => node.label)).toEqual(["idle"]);
  });

  it("takes only the name from a class box, not its members", () => {
    const nodes = diagramNodes("classDiagram\n  class Note {\n    +id: string\n  }\n");
    expect(nodes[0]?.label).toBe("Note");
  });

  it("returns nothing for a type it has no model for", () => {
    expect(diagramNodes('pie\n  "a" : 1\n')).toEqual([]);
  });
});

describe("indexDiagrams", () => {
  it("keeps track of which diagram each box came from", () => {
    const entries = indexDiagrams([architecture, flow]);

    expect(entries.find((entry) => entry.label === "Store")?.diagramIndex).toBe(0);
    expect(entries.find((entry) => entry.label === "App")?.diagramIndex).toBe(1);
  });
});

describe("resolveDiagramAnchor", () => {
  const entries = indexDiagrams([architecture]);

  it("finds a box by the words written on it", () => {
    expect(resolveDiagramAnchor(entries, "Rate limiter")?.id).toBe("rl");
  });

  it("does not care about spacing or case, which links get tidied into", () => {
    expect(resolveDiagramAnchor(entries, "rate-limiter")?.id).toBe("rl");
    expect(resolveDiagramAnchor(entries, "RateLimiter")?.id).toBe("rl");
  });

  it("falls back to the mermaid id", () => {
    expect(resolveDiagramAnchor(entries, "gw")?.label).toBe("API gateway");
  });

  it("returns nothing for a box that is not there", () => {
    expect(resolveDiagramAnchor(entries, "Nowhere")).toBeNull();
    expect(resolveDiagramAnchor(entries, "")).toBeNull();
  });

  it("prefers a label match over an id match", () => {
    const confusing = indexDiagrams(["flowchart TD\n  api[Worker] --> worker[API]\n"]);
    expect(resolveDiagramAnchor(confusing, "api")?.id).toBe("worker");
  });
});

describe("searchDiagramNodes", () => {
  const entries = indexDiagrams([architecture, flow]);

  it("ranks an exact match above a substring", () => {
    const hits = searchDiagramNodes(entries, "api");

    expect(hits[0]?.label).toBe("Api");
    expect(hits.map((hit) => hit.label)).toContain("API gateway");
  });

  it("matches on the mermaid id too", () => {
    expect(searchDiagramNodes(entries, "rl")[0]?.label).toBe("Rate limiter");
  });

  it("returns nothing for an empty query", () => {
    expect(searchDiagramNodes(entries, "  ")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(searchDiagramNodes(entries, "a", 1)).toHaveLength(1);
  });
});

describe("normalizeAnchor", () => {
  it("reduces the ways one name gets written to one form", () => {
    expect(normalizeAnchor("Rate Limiter")).toBe(normalizeAnchor("rate-limiter"));
    expect(normalizeAnchor("API_Gateway")).toBe(normalizeAnchor("api gateway"));
  });
});
