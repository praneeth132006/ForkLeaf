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
export type GraphKind = "flowchart" | "state" | "class" | "er" | "mindmap";

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
  | "fork" // <<fork>> / <<join>>
  // Class and ER diagrams. One box each, whose label carries the members.
  | "class"
  | "entity"
  // Mindmap branches. Mermaid draws these itself; the shape is the outline.
  | "mind-square"
  | "mind-round"
  | "mind-circle"
  | "mind-cloud"
  | "mind-bang"
  | "mind-hexagon";

export type EdgeStyle =
  // Flowchart and state diagrams.
  | "arrow"
  | "open"
  | "dotted"
  | "thick"
  // Class diagrams.
  | "inherit"
  | "compose"
  | "aggregate"
  | "associate"
  | "depend"
  // Entity-relationship diagrams.
  | "one-one"
  | "one-many"
  | "many-one"
  | "many-many"
  // Mindmaps, which have exactly one kind of connection: the branch.
  | "branch";

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
  /**
   * Multiplicity written at each end, as in `Workspace "1" --> "*" Note`.
   *
   * The whole reason anybody draws a class or ER diagram rather than listing
   * the types is to say how many of each there are, so it is a field rather
   * than something folded into the label.
   */
  fromCardinality?: string;
  toCardinality?: string;
  /** ER only: a non-identifying relationship, which mermaid draws dotted. */
  dashed?: boolean;
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
  class: ["class"],
  er: ["entity"],
  mindmap: ["mind-square", "mind-round", "mind-circle", "mind-cloud", "mind-bang", "mind-hexagon"],
};

/**
 * Which connections the palette should offer for each dialect.
 *
 * A flowchart arrow and a class-diagram inheritance triangle are not the same
 * thing drawn differently — they mean different things and are written with
 * different syntax — so each dialect gets its own vocabulary rather than one
 * list with most of it greyed out.
 */
export const EDGE_STYLES_FOR_KIND: Record<GraphKind, EdgeStyle[]> = {
  flowchart: ["arrow", "open", "dotted", "thick"],
  state: ["arrow"],
  class: ["inherit", "compose", "aggregate", "associate", "depend", "open"],
  er: ["one-one", "one-many", "many-one", "many-many"],
  mindmap: ["branch"],
};

/** The connection drawn when one is made without a style being chosen. */
export const DEFAULT_EDGE_STYLE: Record<GraphKind, EdgeStyle> = {
  flowchart: "arrow",
  state: "arrow",
  class: "associate",
  er: "one-many",
  mindmap: "branch",
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

/**
 * Flowchart arrow syntax. Only the four styles a flowchart can express — the
 * class and ER vocabularies are written by their own dialects below.
 */
const EDGE_SYNTAX: Record<
  "arrow" | "open" | "dotted" | "thick",
  { plain: string; labelled: [string, string] }
> = {
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
  const body = bodyFor(graph);

  for (const extra of graph.extras ?? []) body.push(indent(extra));

  const layout = graph.nodes.map((n) => `${n.id}:${Math.round(n.x)},${Math.round(n.y)}`).join(";");
  if (layout) body.push(`    %% forkleaf:layout ${layout}`);

  return body.join("\n");
}

function bodyFor(graph: Graph): string[] {
  switch (graph.kind) {
    case "state":
      return stateBody(graph);
    case "class":
      return classBody(graph);
    case "er":
      return erBody(graph);
    case "mindmap":
      return mindmapBody(graph);
    case "flowchart":
    default:
      return flowchartBody(graph);
  }
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
  // A graph switched from another dialect can carry an edge style a flowchart
  // has no syntax for; a plain arrow is the honest fallback.
  const syntax = EDGE_SYNTAX[edge.style as keyof typeof EDGE_SYNTAX] ?? EDGE_SYNTAX.arrow;
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
  if (/^classDiagram\b/i.test(header)) return parseClassDiagram(code, lines);
  if (/^erDiagram\b/i.test(header)) return parseErDiagram(code, lines);
  if (/^mindmap\b/i.test(header)) return parseMindmap(code, lines);

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

// ── Class diagram ───────────────────────────────────────────────────────────

/**
 * A node's label, split into the name and the members under it.
 *
 * Class and ER boxes are a name plus a list, and the graph model has one string
 * per node — so the string holds both, the first line being the name. That
 * keeps every existing operation (rename, drag, delete) working unchanged
 * rather than needing a parallel "members" concept threaded through all of it.
 */
export function splitMembers(label: string): { name: string; members: string[] } {
  const [first = "", ...rest] = label.split("\n");
  return {
    name: first.trim(),
    members: rest.map((line) => line.trim()).filter((line) => line !== ""),
  };
}

/** The inverse of `splitMembers`. */
export function joinMembers(name: string, members: string[]): string {
  return [name, ...members].join("\n");
}

/** Mermaid's arrow for each class relationship, read left to right. */
const CLASS_RELATIONS: Partial<Record<EdgeStyle, string>> = {
  inherit: "--|>",
  compose: "*--",
  aggregate: "o--",
  associate: "-->",
  depend: "..>",
  open: "--",
};

function classBody(graph: Graph): string[] {
  const lines: string[] = ["classDiagram"];
  if (graph.direction === "LR" || graph.direction === "RL") lines.push("    direction LR");
  else lines.push("    direction TB");

  for (const node of graph.nodes) {
    const { name, members } = splitMembers(node.label);
    const id = escapeId(node.id);

    // A class with no members is one line; mermaid accepts both forms and the
    // short one is what somebody would have typed.
    if (members.length === 0) {
      lines.push(`    class ${id}${name && name !== node.id ? `["${name}"]` : ""}`);
      continue;
    }

    lines.push(`    class ${id}${name && name !== node.id ? `["${name}"]` : ""} {`);
    for (const member of members) lines.push(`        ${member}`);
    lines.push("    }");
  }

  for (const edge of graph.edges) {
    const relation = CLASS_RELATIONS[edge.style] ?? CLASS_RELATIONS.associate!;
    const from = escapeId(edge.from);
    const to = escapeId(edge.to);
    const left = edge.fromCardinality ? ` "${edge.fromCardinality}"` : "";
    const right = edge.toCardinality ? ` "${edge.toCardinality}"` : "";

    lines.push(
      `    ${from}${left} ${relation}${right} ${to}${edge.label ? ` : ${edge.label}` : ""}`,
    );
  }

  return lines;
}

/** Longest first, so `--|>` is not read as `--`. */
const CLASS_RELATION_PATTERNS: { syntax: string; style: EdgeStyle; flipped?: boolean }[] = [
  { syntax: "<|--", style: "inherit", flipped: true },
  { syntax: "--|>", style: "inherit" },
  { syntax: "--*", style: "compose", flipped: true },
  { syntax: "*--", style: "compose" },
  { syntax: "--o", style: "aggregate", flipped: true },
  { syntax: "o--", style: "aggregate" },
  { syntax: "<..", style: "depend", flipped: true },
  { syntax: "..>", style: "depend" },
  { syntax: "<--", style: "associate", flipped: true },
  { syntax: "-->", style: "associate" },
  { syntax: "..", style: "depend" },
  { syntax: "--", style: "open" },
];

function parseClassDiagram(code: string, lines: string[]): Graph {
  const graph: Graph = { kind: "class", direction: "TD", nodes: [], edges: [], extras: [] };
  const store = createNodeStore(graph, parseLayoutComment(code));

  const body = lines.slice(1);
  /** The class whose `{ … }` block we are inside, if any. */
  let openClass: string | null = null;
  const members = new Map<string, string[]>();

  for (const raw of body) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;

    if (openClass) {
      if (line === "}") {
        openClass = null;
        continue;
      }
      members.get(openClass)!.push(line);
      continue;
    }

    const direction = /^direction\s+(TB|TD|LR|RL|BT)\b/i.exec(line);
    if (direction) {
      graph.direction = direction[1]!.toUpperCase() as FlowDirection;
      continue;
    }

    // `class Name["Display"] {` or `class Name` on its own.
    const declaration = /^class\s+([A-Za-z0-9_-]+)\s*(?:\[\s*"?([^\]"]*)"?\s*\])?\s*(\{)?$/.exec(
      line,
    );
    if (declaration) {
      const id = declaration[1]!;
      store.upsert(id, declaration[2]?.trim() || id, "class", undefined, "class");
      if (declaration[3]) {
        openClass = id;
        if (!members.has(id)) members.set(id, []);
      }
      continue;
    }

    const relation = parseClassRelation(line);
    if (relation) {
      store.upsert(relation.from, undefined, "class", undefined, "class");
      store.upsert(relation.to, undefined, "class", undefined, "class");
      graph.edges.push({
        id: `${relation.from}->${relation.to}-${graph.edges.length}`,
        from: relation.from,
        to: relation.to,
        style: relation.style,
        ...(relation.label ? { label: relation.label } : {}),
        ...(relation.fromCardinality ? { fromCardinality: relation.fromCardinality } : {}),
        ...(relation.toCardinality ? { toCardinality: relation.toCardinality } : {}),
      });
      continue;
    }

    // `Name : +field` — the one-line way of adding a member.
    const member = /^([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(line);
    if (member) {
      const id = member[1]!;
      store.upsert(id, undefined, "class", undefined, "class");
      const list = members.get(id) ?? [];
      list.push(member[2]!.trim());
      members.set(id, list);
      continue;
    }

    graph.extras!.push(line);
  }

  // Folded in at the end so a member block that appears before the class is
  // mentioned in a relationship still lands on the right node.
  for (const node of graph.nodes) {
    const list = members.get(node.id);
    if (list && list.length > 0) node.label = joinMembers(node.label, list);
  }

  return graph;
}

function parseClassRelation(line: string): {
  from: string;
  to: string;
  style: EdgeStyle;
  label?: string;
  fromCardinality?: string;
  toCardinality?: string;
} | null {
  const [head, ...labelParts] = line.split(" : ");
  const label = labelParts.join(" : ").trim();

  for (const { syntax, style, flipped } of CLASS_RELATION_PATTERNS) {
    const index = head!.indexOf(syntax);
    if (index <= 0) continue;

    const left = head!.slice(0, index).trim();
    const right = head!.slice(index + syntax.length).trim();

    const leftRef = /^([A-Za-z0-9_-]+)(?:\s+"([^"]*)")?$/.exec(left);
    const rightRef = /^(?:"([^"]*)"\s+)?([A-Za-z0-9_-]+)$/.exec(right);
    if (!leftRef || !rightRef) continue;

    const a = { id: leftRef[1]!, cardinality: leftRef[2] };
    const b = { id: rightRef[2]!, cardinality: rightRef[1] };
    // `<|--` reads right to left: `Parent <|-- Child` means the child inherits.
    const [from, to] = flipped ? [b, a] : [a, b];

    return {
      from: from.id,
      to: to.id,
      style,
      ...(label ? { label } : {}),
      ...(from.cardinality ? { fromCardinality: from.cardinality } : {}),
      ...(to.cardinality ? { toCardinality: to.cardinality } : {}),
    };
  }

  return null;
}

// ── Entity-relationship diagram ─────────────────────────────────────────────

/** The two halves of mermaid's crow's-foot notation, per relationship. */
const ER_CARDINALITY: Record<string, [string, string]> = {
  "one-one": ["||", "||"],
  "one-many": ["||", "o{"],
  "many-one": ["}o", "||"],
  "many-many": ["}o", "o{"],
};

function erBody(graph: Graph): string[] {
  const lines: string[] = ["erDiagram"];

  for (const node of graph.nodes) {
    const { name, members } = splitMembers(node.label);
    const id = escapeId(name || node.id);
    if (members.length === 0) continue;

    lines.push(`    ${id} {`);
    for (const member of members) lines.push(`        ${member}`);
    lines.push("    }");
  }

  for (const edge of graph.edges) {
    const [left, right] = ER_CARDINALITY[edge.style] ?? ER_CARDINALITY["one-many"]!;
    const line = edge.dashed ? ".." : "--";
    const from = escapeId(entityName(graph, edge.from));
    const to = escapeId(entityName(graph, edge.to));

    // Mermaid requires a label on every relationship, so an unlabelled one is
    // written as an empty string rather than omitted, which would not parse.
    lines.push(`    ${from} ${left}${line}${right} ${to} : "${edge.label ?? ""}"`);
  }

  // An entity with no attributes and no relationships would otherwise vanish
  // from the source entirely, and reopening the canvas would not find it.
  for (const node of graph.nodes) {
    const { name, members } = splitMembers(node.label);
    const attached = graph.edges.some((edge) => edge.from === node.id || edge.to === node.id);
    if (members.length === 0 && !attached)
      lines.push(`    ${escapeId(name || node.id)} {`, "    }");
  }

  return lines;
}

/** ER entities are referred to by name, not by an internal id. */
function entityName(graph: Graph, id: string): string {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  return node ? splitMembers(node.label).name || node.id : id;
}

const ER_RELATION =
  /^([A-Za-z0-9_-]+)\s+([|}o][|o{]?)(--|\.\.)([|}o][|o{]?)\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/;

function parseErDiagram(code: string, lines: string[]): Graph {
  const graph: Graph = { kind: "er", direction: "TD", nodes: [], edges: [], extras: [] };
  const store = createNodeStore(graph, parseLayoutComment(code));

  const attributes = new Map<string, string[]>();
  let openEntity: string | null = null;

  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;

    if (openEntity) {
      if (line === "}") {
        openEntity = null;
        continue;
      }
      attributes.get(openEntity)!.push(line);
      continue;
    }

    const block = /^([A-Za-z0-9_-]+)\s*\{$/.exec(line);
    if (block) {
      openEntity = block[1]!;
      store.upsert(openEntity, openEntity, "entity", undefined, "entity");
      if (!attributes.has(openEntity)) attributes.set(openEntity, []);
      continue;
    }

    const relation = ER_RELATION.exec(line);
    if (relation) {
      const from = relation[1]!;
      const to = relation[5]!;
      store.upsert(from, from, "entity", undefined, "entity");
      store.upsert(to, to, "entity", undefined, "entity");

      const label = stripQuotes(relation[6]!.trim());
      graph.edges.push({
        id: `${from}->${to}-${graph.edges.length}`,
        from,
        to,
        style: erStyleFor(relation[2]!, relation[4]!),
        ...(label ? { label } : {}),
        ...(relation[3] === ".." ? { dashed: true } : {}),
      });
      continue;
    }

    graph.extras!.push(line);
  }

  for (const node of graph.nodes) {
    const list = attributes.get(node.id);
    if (list && list.length > 0) node.label = joinMembers(node.label, list);
  }

  return graph;
}

/** Reads crow's-foot notation back into one of the four relationship styles. */
function erStyleFor(left: string, right: string): EdgeStyle {
  const leftMany = left.startsWith("}");
  const rightMany = right.endsWith("{");

  if (leftMany && rightMany) return "many-many";
  if (leftMany) return "many-one";
  if (rightMany) return "one-many";
  return "one-one";
}

// ── Mindmap ─────────────────────────────────────────────────────────────────

const MIND_DELIMITERS: Partial<Record<NodeShape, [string, string]>> = {
  "mind-square": ["[", "]"],
  "mind-round": ["(", ")"],
  "mind-circle": ["((", "))"],
  "mind-bang": ["))", "(("],
  "mind-cloud": [")", "("],
  "mind-hexagon": ["{{", "}}"],
};

/**
 * Mindmaps are written as indentation, not as arrows.
 *
 * So the edges are the tree: a node's parent is whatever points at it. Walking
 * from the roots and emitting two spaces per level is the whole serialiser —
 * and a node that somehow ends up with two parents is emitted under the first,
 * because a mindmap cannot express the second.
 */
function mindmapBody(graph: Graph): string[] {
  const lines: string[] = ["mindmap"];

  const parentOf = new Map<string, string>();
  for (const edge of graph.edges) {
    if (!parentOf.has(edge.to)) parentOf.set(edge.to, edge.from);
  }

  const childrenOf = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    const parent = parentOf.get(node.id);
    if (parent === undefined) continue;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(node);
    else childrenOf.set(parent, [node]);
  }

  const emitted = new Set<string>();

  const walk = (node: GraphNode, depth: number) => {
    // A cycle is not drawable as a tree, and refusing to loop forever matters
    // more here than refusing to draw: this runs against half-edited source.
    if (emitted.has(node.id)) return;
    emitted.add(node.id);

    const [open, close] = MIND_DELIMITERS[node.shape] ?? MIND_DELIMITERS["mind-square"]!;
    lines.push(`${"  ".repeat(depth + 1)}${escapeId(node.id)}${open}${node.label}${close}`);

    for (const child of childrenOf.get(node.id) ?? []) walk(child, depth + 1);
  };

  for (const node of graph.nodes) {
    if (!parentOf.has(node.id)) walk(node, 0);
  }
  // Anything left is inside a cycle; drawn at the root so it is not lost.
  for (const node of graph.nodes) walk(node, 0);

  return lines;
}

function parseMindmap(code: string, lines: string[]): Graph {
  const graph: Graph = { kind: "mindmap", direction: "TD", nodes: [], edges: [], extras: [] };
  const store = createNodeStore(graph, parseLayoutComment(code));

  /** Open ancestors, as `[indentation, nodeId]`. */
  const stack: { indent: number; id: string }[] = [];
  let anonymous = 0;

  for (const raw of lines.slice(1)) {
    if (raw.trim() === "" || raw.trim().startsWith("%%")) continue;

    const indent = raw.length - raw.trimStart().length;
    const parsed = parseMindNode(raw.trim());
    if (!parsed) {
      graph.extras!.push(raw.trim());
      continue;
    }

    const id = parsed.id ?? `m${(anonymous += 1)}`;
    store.upsert(id, parsed.label, parsed.shape, undefined, "mind-square");

    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();

    const parent = stack[stack.length - 1];
    if (parent) {
      graph.edges.push({
        id: `${parent.id}->${id}-${graph.edges.length}`,
        from: parent.id,
        to: id,
        style: "branch",
      });
    }

    stack.push({ indent, id });
  }

  return graph;
}

/** Longest delimiters first, so `((` is not read as `(`. */
const MIND_BY_SPECIFICITY: NodeShape[] = [
  "mind-bang",
  "mind-circle",
  "mind-hexagon",
  "mind-square",
  "mind-cloud",
  "mind-round",
];

function parseMindNode(text: string): { id?: string; label: string; shape: NodeShape } | null {
  if (text === "") return null;

  for (const shape of MIND_BY_SPECIFICITY) {
    const [open, close] = MIND_DELIMITERS[shape]!;
    const index = text.indexOf(open);
    if (index < 0 || !text.endsWith(close)) continue;

    const id = text.slice(0, index).trim();
    const label = text.slice(index + open.length, text.length - close.length).trim();
    // An id is optional in mermaid's syntax — `((Root))` alone is valid.
    if (id !== "" && !/^[A-Za-z0-9_-]+$/.test(id)) continue;

    return { ...(id ? { id } : {}), label, shape };
  }

  return { label: text, shape: "mind-square" };
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
  class: "Class",
  entity: "Entity",
  "mind-square": "Square",
  "mind-round": "Rounded",
  "mind-circle": "Circle",
  "mind-cloud": "Cloud",
  "mind-bang": "Burst",
  "mind-hexagon": "Hexagon",
};

export const EDGE_LABELS: Record<EdgeStyle, string> = {
  arrow: "Arrow",
  open: "Line",
  dotted: "Dotted",
  thick: "Thick",
  inherit: "Inherits",
  compose: "Composed of",
  aggregate: "Has",
  associate: "Association",
  depend: "Depends on",
  "one-one": "One to one",
  "one-many": "One to many",
  "many-one": "Many to one",
  "many-many": "Many to many",
  branch: "Branch",
};
