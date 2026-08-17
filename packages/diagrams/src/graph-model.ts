/**
 * The model behind the visual (drag-and-drop) diagram builder.
 *
 * The builder never edits mermaid text directly. It edits this graph, and the
 * graph is serialised to mermaid. It can also parse a flowchart back into a
 * graph, which is what lets someone open a diagram they typed by hand and keep
 * editing it visually — without that round trip the two modes would fight.
 *
 * Pure data and pure functions: no React, no DOM, fully unit-testable.
 */

export type NodeShape =
  | "rect" // process step
  | "round" // rounded step
  | "stadium" // start / end
  | "diamond" // decision
  | "circle" // connector
  | "cylinder" // storage
  | "parallelogram" // input / output
  | "hexagon"; // preparation

export type EdgeStyle = "arrow" | "open" | "dotted" | "thick";

export type FlowDirection = "TD" | "TB" | "LR" | "RL" | "BT";

export interface GraphNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Canvas position, in pixels. Persisted as a mermaid comment. */
  x: number;
  y: number;
  /** Optional subgraph this node belongs to. */
  group?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  style: EdgeStyle;
}

export interface Graph {
  direction: FlowDirection;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const EMPTY_GRAPH: Graph = { direction: "TD", nodes: [], edges: [] };

// ─── Shape syntax table ─────────────────────────────────────────────────────

/** Opening and closing delimiters for each mermaid node shape. */
const SHAPE_DELIMITERS: Record<NodeShape, [string, string]> = {
  rect: ["[", "]"],
  round: ["(", ")"],
  stadium: ["([", "])"],
  diamond: ["{", "}"],
  circle: ["((", "))"],
  cylinder: ["[(", ")]"],
  parallelogram: ["[/", "/]"],
  hexagon: ["{{", "}}"],
};

/**
 * Longest delimiters first: `([` must be tested before `(`, otherwise a stadium
 * node is misread as a round one with a stray bracket in its label.
 */
const SHAPES_BY_SPECIFICITY: NodeShape[] = [
  "stadium",
  "cylinder",
  "circle",
  "hexagon",
  "parallelogram",
  "rect",
  "diamond",
  "round",
];

const EDGE_SYNTAX: Record<EdgeStyle, { plain: string; labelled: [string, string] }> = {
  arrow: { plain: "-->", labelled: ["-- ", " -->"] },
  open: { plain: "---", labelled: ["-- ", " ---"] },
  dotted: { plain: "-.->", labelled: ["-. ", " .->"] },
  thick: { plain: "==>", labelled: ["== ", " ==>"] },
};

// ─── Serialisation ──────────────────────────────────────────────────────────

/**
 * Renders the graph as mermaid source.
 *
 * Node positions are written into a `%% mdnotion:layout` comment. Mermaid
 * ignores it, GitHub renders the diagram fine, and reopening the visual builder
 * restores the exact layout the user arranged.
 */
export function graphToMermaid(graph: Graph): string {
  const lines: string[] = [`flowchart ${graph.direction}`];

  const grouped = new Map<string, GraphNode[]>();
  const ungrouped: GraphNode[] = [];

  for (const node of graph.nodes) {
    if (node.group) {
      const bucket = grouped.get(node.group);
      if (bucket) bucket.push(node);
      else grouped.set(node.group, [node]);
    } else {
      ungrouped.push(node);
    }
  }

  for (const node of ungrouped) {
    lines.push(`    ${renderNode(node)}`);
  }

  for (const [group, nodes] of grouped) {
    lines.push(`    subgraph ${escapeId(group)}[${quoteLabel(group)}]`);
    for (const node of nodes) lines.push(`        ${renderNode(node)}`);
    lines.push("    end");
  }

  for (const edge of graph.edges) {
    lines.push(`    ${renderEdge(edge)}`);
  }

  const layout = graph.nodes.map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}`).join(";");
  if (layout) lines.push(`    %% mdnotion:layout ${layout}`);

  return lines.join("\n");
}

function renderNode(node: GraphNode): string {
  const [open, close] = SHAPE_DELIMITERS[node.shape];
  return `${escapeId(node.id)}${open}${quoteLabel(node.label)}${close}`;
}

function renderEdge(edge: GraphEdge): string {
  const syntax = EDGE_SYNTAX[edge.style];
  const from = escapeId(edge.from);
  const to = escapeId(edge.to);

  if (!edge.label) return `${from} ${syntax.plain} ${to}`;

  const [prefix, suffix] = syntax.labelled;
  return `${from} ${prefix}${edge.label}${suffix} ${to}`;
}

/**
 * Wraps a label in quotes when it contains characters that would otherwise
 * terminate the node early or be read as syntax.
 */
function quoteLabel(label: string): string {
  if (label === "") return " ";
  // Mermaid has no escape for a literal quote inside a quoted label, so the
  // only safe transformation is to swap it for a typographic one.
  const safe = label.replace(/"/g, "”");
  return /[[\]{}()<>|"#;\-=.]/.test(label) ? `"${safe}"` : safe;
}

/** Node ids must be bare identifiers; anything else is replaced. */
function escapeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_") || "node";
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parses mermaid flowchart source back into a graph.
 *
 * Deliberately forgiving: anything it does not understand is skipped rather
 * than throwing, because this runs against half-typed source as the user works.
 * Returns null only when the source is not a flowchart at all — the caller uses
 * that to keep the visual builder disabled for diagram types it cannot edit.
 */
export function mermaidToGraph(code: string): Graph | null {
  const lines = code.split("\n");

  const header = lines.map((l) => l.trim()).find((l) => l !== "" && !l.startsWith("%%"));
  if (!header) return null;

  const headerMatch = /^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.exec(header);
  if (!headerMatch) return null;

  const graph: Graph = {
    direction: (headerMatch[1]!.toUpperCase() as FlowDirection) ?? "TD",
    nodes: [],
    edges: [],
  };

  const nodesById = new Map<string, GraphNode>();
  const layout = parseLayoutComment(code);
  let currentGroup: string | undefined;
  let autoIndex = 0;

  /** Records a node, filling in a placeholder for ids only seen in an edge. */
  const upsertNode = (id: string, label?: string, shape?: NodeShape) => {
    const existing = nodesById.get(id);
    if (existing) {
      if (label !== undefined) existing.label = label;
      if (shape !== undefined) existing.shape = shape;
      return existing;
    }

    const position = layout.get(id);
    const node: GraphNode = {
      id,
      label: label ?? id,
      shape: shape ?? "rect",
      // Lay unpositioned nodes out in a readable column rather than stacking
      // them all at the origin.
      x: position?.x ?? 80 + (autoIndex % 3) * 220,
      y: position?.y ?? 60 + Math.floor(autoIndex / 3) * 130,
      ...(currentGroup ? { group: currentGroup } : {}),
    };
    autoIndex += 1;
    nodesById.set(id, node);
    graph.nodes.push(node);
    return node;
  };

  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;

    const subgraph = /^subgraph\s+(\S+)(?:\s*\[([^\]]*)\])?/.exec(line);
    if (subgraph) {
      currentGroup = stripQuotes(subgraph[2] ?? subgraph[1]!);
      continue;
    }
    if (/^end\b/.test(line)) {
      currentGroup = undefined;
      continue;
    }

    const edge = parseEdgeLine(line);
    if (edge) {
      upsertNode(edge.from.id, edge.from.label, edge.from.shape);
      upsertNode(edge.to.id, edge.to.label, edge.to.shape);
      graph.edges.push({
        id: `${edge.from.id}->${edge.to.id}-${graph.edges.length}`,
        from: edge.from.id,
        to: edge.to.id,
        ...(edge.label !== undefined ? { label: edge.label } : {}),
        style: edge.style,
      });
      continue;
    }

    const node = parseNodeLine(line);
    if (node) upsertNode(node.id, node.label, node.shape);
  }

  return graph;
}

interface ParsedNodeRef {
  id: string;
  label?: string;
  shape?: NodeShape;
}

/** Matches every supported edge style, capturing an optional inline label. */
const EDGE_PATTERNS: { re: RegExp; style: EdgeStyle }[] = [
  { re: /^(.+?)\s*-\.\s*(.*?)\s*\.->\s*(.+)$/, style: "dotted" },
  { re: /^(.+?)\s*-\.->\s*(.+)$/, style: "dotted" },
  { re: /^(.+?)\s*==\s*(.*?)\s*==>\s*(.+)$/, style: "thick" },
  { re: /^(.+?)\s*==>\s*(.+)$/, style: "thick" },
  { re: /^(.+?)\s*--\s*(.+?)\s*-->\s*(.+)$/, style: "arrow" },
  { re: /^(.+?)\s*-->\s*\|([^|]*)\|\s*(.+)$/, style: "arrow" },
  { re: /^(.+?)\s*-->\s*(.+)$/, style: "arrow" },
  { re: /^(.+?)\s*--\s*(.+?)\s*---\s*(.+)$/, style: "open" },
  { re: /^(.+?)\s*---\s*(.+)$/, style: "open" },
];

function parseEdgeLine(
  line: string,
): { from: ParsedNodeRef; to: ParsedNodeRef; label?: string; style: EdgeStyle } | null {
  for (const { re, style } of EDGE_PATTERNS) {
    const match = re.exec(line);
    if (!match) continue;

    // Three capture groups means the middle one is the edge label.
    const hasLabel = match.length === 4;
    const left = match[1]!;
    const label = hasLabel ? match[2] : undefined;
    const right = (hasLabel ? match[3] : match[2])!;

    const from = parseNodeLine(left.trim());
    const to = parseNodeLine(right.trim());
    if (!from || !to) continue;

    return {
      from,
      to,
      ...(label && label.trim() ? { label: stripQuotes(label.trim()) } : {}),
      style,
    };
  }
  return null;
}

/** Parses `id[Label]` in any shape syntax, or a bare `id`. */
function parseNodeLine(line: string): ParsedNodeRef | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;

  for (const shape of SHAPES_BY_SPECIFICITY) {
    const [open, close] = SHAPE_DELIMITERS[shape];
    const openIdx = trimmed.indexOf(open);
    if (openIdx <= 0) continue;
    if (!trimmed.endsWith(close)) continue;

    const id = trimmed.slice(0, openIdx).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;

    const label = trimmed.slice(openIdx + open.length, trimmed.length - close.length);
    return { id, label: stripQuotes(label).trim(), shape };
  }

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return { id: trimmed };
  return null;
}

function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseLayoutComment(code: string): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const match = /%%\s*mdnotion:layout\s+(.+)/.exec(code);
  if (!match) return positions;

  for (const entry of match[1]!.trim().split(";")) {
    const parsed = /^([^:]+):(-?\d+),(-?\d+)$/.exec(entry.trim());
    if (!parsed) continue;
    positions.set(parsed[1]!, { x: Number(parsed[2]), y: Number(parsed[3]) });
  }

  return positions;
}

// ─── Editing operations ─────────────────────────────────────────────────────

/** Generates an id that does not collide with anything already in the graph. */
export function nextNodeId(graph: Graph, prefix = "n"): string {
  const taken = new Set(graph.nodes.map((n) => n.id));
  for (let i = 1; i < 10_000; i += 1) {
    const candidate = `${prefix}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}${Date.now()}`;
}

export function addNode(graph: Graph, node: Omit<GraphNode, "id"> & { id?: string }): Graph {
  const id = node.id ?? nextNodeId(graph);
  return { ...graph, nodes: [...graph.nodes, { ...node, id }] };
}

export function updateNode(graph: Graph, id: string, patch: Partial<GraphNode>): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}

/** Removes a node and every edge attached to it, so no edge is left dangling. */
export function removeNode(graph: Graph, id: string): Graph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

export function addEdge(graph: Graph, from: string, to: string, style: EdgeStyle = "arrow"): Graph {
  // Self-loops and duplicates are almost always a mis-drag, not an intention.
  if (from === to) return graph;
  if (graph.edges.some((e) => e.from === from && e.to === to)) return graph;

  return {
    ...graph,
    edges: [...graph.edges, { id: `${from}->${to}-${graph.edges.length}`, from, to, style }],
  };
}

export function updateEdge(graph: Graph, id: string, patch: Partial<GraphEdge>): Graph {
  return {
    ...graph,
    edges: graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  };
}

export function removeEdge(graph: Graph, id: string): Graph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

/** Human-readable names for the shape picker. */
export const SHAPE_LABELS: Record<NodeShape, string> = {
  rect: "Process",
  round: "Rounded",
  stadium: "Start / End",
  diamond: "Decision",
  circle: "Connector",
  cylinder: "Database",
  parallelogram: "Input / Output",
  hexagon: "Preparation",
};

export const EDGE_LABELS: Record<EdgeStyle, string> = {
  arrow: "Arrow",
  open: "Line",
  dotted: "Dotted",
  thick: "Thick",
};
