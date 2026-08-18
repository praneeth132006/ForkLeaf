/**
 * The model behind the visual (drag-and-drop) diagram builder.
 *
 * The builder never edits mermaid text directly. It edits this graph, and the
 * graph is serialised to mermaid. It can also parse mermaid back into a graph,
 * which is what lets someone open a diagram they typed by hand and keep editing
 * it visually — without that round trip the two modes would fight.
 *
 * Two mermaid dialects map onto the same node-and-edge shape, so the same
 * canvas edits both: flowcharts and state diagrams. Everything a dialect uses
 * that this model has no concept of (styles, notes, class definitions) is kept
 * verbatim in `extras` and written back out, so round-tripping a hand-written
 * diagram through the canvas never quietly deletes parts of it.
 *
 * Pure data and pure functions: no React, no DOM, fully unit-testable.
 */

/** Which mermaid dialect a graph serialises to. */
export type GraphKind = "flowchart" | "state";

export type NodeShape =
  // Flowchart shapes.
  | "rect" // process step
  | "round" // rounded step
  | "stadium" // start / end
  | "diamond" // decision
  | "circle" // connector
  | "cylinder" // storage
  | "parallelogram" // input / output
  | "hexagon" // preparation
  // State diagram shapes.
  | "state" // a plain state
  | "start" // the initial [*] pseudo-state
  | "end" // a final [*] pseudo-state
  | "choice" // <<choice>>
  | "fork"; // <<fork>> / <<join>>

export type EdgeStyle = "arrow" | "open" | "dotted" | "thick";

export type FlowDirection = "TD" | "TB" | "LR" | "RL" | "BT";

export interface GraphNode {
  id: string;
  label: string;
  shape: NodeShape;
  /** Canvas position, in pixels. Persisted as a mermaid comment. */
  x: number;
  y: number;
  /** Optional subgraph (flowchart) or composite state this node belongs to. */
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
  kind: GraphKind;
  direction: FlowDirection;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /**
   * Lines the parser recognised as valid mermaid but has no model for —
   * `classDef`, `style`, `click`, `note … end note`. Re-emitted unchanged so
   * editing one node on the canvas cannot silently drop the rest of a diagram.
   */
  extras?: string[];
}

export const EMPTY_GRAPH: Graph = { kind: "flowchart", direction: "TD", nodes: [], edges: [] };

/** Which shapes the palette should offer for each dialect. */
export const SHAPES_FOR_KIND: Record<GraphKind, NodeShape[]> = {
  flowchart: [
    "rect",
    "round",
    "stadium",
    "diamond",
    "circle",
    "cylinder",
    "parallelogram",
    "hexagon",
  ],
  state: ["state", "start", "end", "choice", "fork"],
};

/** The pseudo-states mermaid writes as `[*]` rather than as a named state. */
const PSEUDO_SHAPES = new Set<NodeShape>(["start", "end"]);

// ─── Shape syntax table ─────────────────────────────────────────────────────

/** Opening and closing delimiters for each mermaid flowchart node shape. */
const SHAPE_DELIMITERS: Partial<Record<NodeShape, [string, string]>> = {
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
 * Node positions are written into a `%% forkleaf:layout` comment. Mermaid
 * ignores it, GitHub renders the diagram fine, and reopening the visual builder
 * restores the exact layout the user arranged.
 */
export function graphToMermaid(graph: Graph): string {
  const body = graph.kind === "state" ? stateBody(graph) : flowchartBody(graph);

  for (const extra of graph.extras ?? []) body.push(indent(extra));

  const layout = graph.nodes.map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}`).join(";");
  if (layout) body.push(`    %% forkleaf:layout ${layout}`);

  return body.join("\n");
}

/** Re-indents a preserved line to sit with the rest of the body. */
function indent(line: string): string {
  return `    ${line.trim()}`;
}

function groupNodes(graph: Graph): {
  grouped: Map<string, GraphNode[]>;
  ungrouped: GraphNode[];
} {
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

  return { grouped, ungrouped };
}

// ── Flowchart ───────────────────────────────────────────────────────────────

function flowchartBody(graph: Graph): string[] {
  const lines: string[] = [`flowchart ${graph.direction}`];
  const { grouped, ungrouped } = groupNodes(graph);

  for (const node of ungrouped) lines.push(`    ${renderNode(node)}`);

  for (const [group, nodes] of grouped) {
    lines.push(`    subgraph ${escapeId(group)}[${quoteLabel(group)}]`);
    for (const node of nodes) lines.push(`        ${renderNode(node)}`);
    lines.push("    end");
  }

  for (const edge of graph.edges) lines.push(`    ${renderEdge(edge)}`);

  return lines;
}

function renderNode(node: GraphNode): string {
  const [open, close] = SHAPE_DELIMITERS[node.shape] ?? SHAPE_DELIMITERS.rect!;
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

// ── State diagram ───────────────────────────────────────────────────────────

const STATE_ANNOTATIONS: Partial<Record<NodeShape, string>> = {
  choice: "<<choice>>",
  fork: "<<fork>>",
};

function stateBody(graph: Graph): string[] {
  const lines: string[] = ["stateDiagram-v2"];

  // Mermaid's state renderer only understands two directions; the four-way
  // flowchart values collapse onto them.
  if (graph.direction === "LR" || graph.direction === "RL") lines.push("    direction LR");
  else lines.push("    direction TB");

  const { grouped, ungrouped } = groupNodes(graph);
  const connected = new Set(graph.edges.flatMap((edge) => [edge.from, edge.to]));

  for (const node of ungrouped) {
    const declaration = renderStateDeclaration(node, connected);
    if (declaration) lines.push(`    ${declaration}`);
  }

  for (const [group, nodes] of grouped) {
    lines.push(`    state ${escapeId(group)} {`);
    for (const node of nodes) {
      // Inside a composite the member states have to be declared even when a
      // transition already mentions them, otherwise mermaid puts them outside
      // the box.
      lines.push(`        ${renderStateDeclaration(node, new Set()) ?? escapeId(node.id)}`);
    }
    lines.push("    }");
  }

  for (const edge of graph.edges) {
    const from = stateRef(graph, edge.from);
    const to = stateRef(graph, edge.to);
    lines.push(`    ${from} --> ${to}${edge.label ? ` : ${edge.label}` : ""}`);
  }

  return lines;
}

/**
 * A state's declaration line, or null when mermaid can infer it.
 *
 * `[*]` pseudo-states are never declared — they only ever appear inside a
 * transition — and a plainly-named state that already features in one needs no
 * line of its own.
 */
function renderStateDeclaration(node: GraphNode, connected: Set<string>): string | null {
  if (PSEUDO_SHAPES.has(node.shape)) return null;

  const id = escapeId(node.id);
  const annotation = STATE_ANNOTATIONS[node.shape];
  if (annotation) return `state ${id} ${annotation}`;

  if (node.label !== node.id) return `state "${node.label.replace(/"/g, "”")}" as ${id}`;
  return connected.has(node.id) ? null : id;
}

/** How a node is referred to inside a transition. */
function stateRef(graph: Graph, id: string): string {
  const node = graph.nodes.find((n) => n.id === id);
  return node && PSEUDO_SHAPES.has(node.shape) ? "[*]" : escapeId(id);
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
 * Parses mermaid source back into a graph.
 *
 * Deliberately forgiving: anything it does not understand is kept aside rather
 * than throwing, because this runs against half-typed source as the user works.
 * Returns null only when the source is a dialect the canvas cannot edit — the
 * caller uses that to explain why the visual tab is unavailable.
 */
export function mermaidToGraph(code: string): Graph | null {
  const lines = code.split("\n");
  const header = lines.map((l) => l.trim()).find((l) => l !== "" && !l.startsWith("%%"));
  if (!header) return null;

  const flowchart = /^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.exec(header);
  if (flowchart) {
    return parseFlowchart(code, lines, (flowchart[1]!.toUpperCase() as FlowDirection) ?? "TD");
  }

  if (/^stateDiagram(?:-v2)?\b/i.test(header)) return parseStateDiagram(code, lines);

  return null;
}

/**
 * Shared bookkeeping for both dialects: node upserts that fill in a placeholder
 * for ids first seen in a transition, and a fallback layout for nodes that have
 * no saved position.
 */
function createNodeStore(graph: Graph, layout: Map<string, { x: number; y: number }>) {
  const nodesById = new Map<string, GraphNode>();
  let autoIndex = 0;

  return {
    nodesById,
    upsert(
      id: string,
      label?: string,
      shape?: NodeShape,
      group?: string,
      defaultShape: NodeShape = "rect",
    ): GraphNode {
      const existing = nodesById.get(id);
      if (existing) {
        if (label !== undefined) existing.label = label;
        if (shape !== undefined) existing.shape = shape;
        if (group !== undefined) existing.group = group;
        return existing;
      }

      const position = layout.get(id);
      const node: GraphNode = {
        id,
        label: label ?? id,
        shape: shape ?? defaultShape,
        // Lay unpositioned nodes out in a readable column rather than stacking
        // them all at the origin.
        x: position?.x ?? 80 + (autoIndex % 3) * 220,
        y: position?.y ?? 60 + Math.floor(autoIndex / 3) * 130,
        ...(group ? { group } : {}),
      };
      autoIndex += 1;
      nodesById.set(id, node);
      graph.nodes.push(node);
      return node;
    },
  };
}

// ── Flowchart ───────────────────────────────────────────────────────────────

function parseFlowchart(code: string, lines: string[], direction: FlowDirection): Graph {
  const graph: Graph = { kind: "flowchart", direction, nodes: [], edges: [], extras: [] };
  const store = createNodeStore(graph, parseLayoutComment(code));
  let currentGroup: string | undefined;

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
      store.upsert(edge.from.id, edge.from.label, edge.from.shape, currentGroup);
      store.upsert(edge.to.id, edge.to.label, edge.to.shape, currentGroup);
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
    if (node) store.upsert(node.id, node.label, node.shape, currentGroup);
    else graph.extras!.push(line);
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
    const [open, close] = SHAPE_DELIMITERS[shape]!;
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

// ── State diagram ───────────────────────────────────────────────────────────

/**
 * Parses `stateDiagram-v2`.
 *
 * The one structural difference from a flowchart is `[*]`: mermaid draws every
 * `[*]` in a scope as a single start or end marker depending on which side of
 * the arrow it sits, so the parser folds them into one node per scope per role
 * rather than creating a marker per mention.
 */
function parseStateDiagram(code: string, lines: string[]): Graph {
  const graph: Graph = { kind: "state", direction: "TD", nodes: [], edges: [], extras: [] };
  const store = createNodeStore(graph, parseLayoutComment(code));

  const groups: string[] = [];
  const currentGroup = () => groups[groups.length - 1];

  /** The `[*]` marker for the current scope, created on first mention. */
  const pseudoId = (role: "start" | "end") => {
    const scope = currentGroup();
    const id = `__${role}${scope ? `_${escapeId(scope)}` : ""}`;
    store.upsert(id, "", role, scope, role);
    return id;
  };

  const body = lines.slice(1);

  for (let i = 0; i < body.length; i += 1) {
    const line = body[i]!.trim();
    if (line === "" || line.startsWith("%%")) continue;

    const direction = /^direction\s+(TB|TD|LR|RL|BT)\b/i.exec(line);
    if (direction) {
      graph.direction = direction[1]!.toUpperCase() as FlowDirection;
      continue;
    }

    // A note runs to `end note` when it is a block, and is a single line when
    // written with a colon. Either way it is kept verbatim.
    if (/^note\b/i.test(line)) {
      if (/:/.test(line)) {
        graph.extras!.push(line);
      } else {
        const note = [line];
        while (i + 1 < body.length && !/^end note\b/i.test(body[i + 1]!.trim())) {
          i += 1;
          note.push(body[i]!.trim());
        }
        if (i + 1 < body.length) {
          i += 1;
          note.push(body[i]!.trim());
        }
        graph.extras!.push(note.join("\n    "));
      }
      continue;
    }

    // `state Name {` opens a composite state; a bare `}` closes it.
    const composite = /^state\s+(?:"([^"]*)"\s+as\s+)?([A-Za-z0-9_-]+)\s*\{$/.exec(line);
    if (composite) {
      groups.push(composite[1] ?? composite[2]!);
      continue;
    }
    if (line === "}") {
      groups.pop();
      continue;
    }

    const transition = parseStateTransition(line);
    if (transition) {
      const from =
        transition.from === "[*]"
          ? pseudoId("start")
          : declareState(transition.from, store, currentGroup());
      const to =
        transition.to === "[*]"
          ? pseudoId("end")
          : declareState(transition.to, store, currentGroup());

      graph.edges.push({
        id: `${from}->${to}-${graph.edges.length}`,
        from,
        to,
        ...(transition.label ? { label: transition.label } : {}),
        style: "arrow",
      });
      continue;
    }

    // `state "Long name" as id`
    const aliased = /^state\s+"([^"]*)"\s+as\s+([A-Za-z0-9_-]+)$/.exec(line);
    if (aliased) {
      store.upsert(aliased[2]!, aliased[1]!, "state", currentGroup(), "state");
      continue;
    }

    // `state id <<choice>>`
    const annotated = /^state\s+([A-Za-z0-9_-]+)\s+<<(choice|fork|join)>>$/i.exec(line);
    if (annotated) {
      const shape: NodeShape = annotated[2]!.toLowerCase() === "choice" ? "choice" : "fork";
      store.upsert(annotated[1]!, annotated[1]!, shape, currentGroup(), shape);
      continue;
    }

    // `id : a description of the state`
    const described = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(line);
    if (described) {
      store.upsert(described[1]!, described[2]!.trim(), "state", currentGroup(), "state");
      continue;
    }

    // A state declared on its own.
    if (/^[A-Za-z0-9_-]+$/.test(line)) {
      store.upsert(line, line, "state", currentGroup(), "state");
      continue;
    }

    graph.extras!.push(line);
  }

  return graph;
}

/** Records a named state seen in a transition, without disturbing its label. */
function declareState(
  id: string,
  store: ReturnType<typeof createNodeStore>,
  group: string | undefined,
): string {
  store.upsert(id, undefined, undefined, group, "state");
  return id;
}

function parseStateTransition(line: string): { from: string; to: string; label?: string } | null {
  const match = /^(\[\*\]|[A-Za-z0-9_-]+)\s*-->\s*(\[\*\]|[A-Za-z0-9_-]+)\s*(?::\s*(.*))?$/.exec(
    line,
  );
  if (!match) return null;

  const label = match[3]?.trim();
  return { from: match[1]!, to: match[2]!, ...(label ? { label } : {}) };
}

// ── Shared ──────────────────────────────────────────────────────────────────

function stripQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseLayoutComment(code: string): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const match = /%%\s*forkleaf:layout\s+(.+)/.exec(code);
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
  state: "State",
  start: "Start",
  end: "End",
  choice: "Choice",
  fork: "Fork / Join",
};

export const EDGE_LABELS: Record<EdgeStyle, string> = {
  arrow: "Arrow",
  open: "Line",
  dotted: "Dotted",
  thick: "Thick",
};
