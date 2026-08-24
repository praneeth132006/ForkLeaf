import {
  mermaidToGraph,
  splitMembers,
  tidyLayout,
  type Graph,
  type GraphEdge,
  type GraphNode,
} from "./graph-model";
import { hasMembers, isMarker, sizeOf, MEMBER_HEADER, MEMBER_HEIGHT, type Size } from "./geometry";
import type { DiagramDiff, DiffStatus, GraphDiff } from "./diff";

/**
 * Drawing a graph as SVG, without a browser.
 *
 * Mermaid cannot do this. It measures text in a live DOM to decide how big a
 * box is, so rendering it outside a browser means shipping a headless one —
 * which rules out rendering a diagram in an API route, in a GitHub Action, or
 * anywhere else the answer is wanted in milliseconds and without a Chromium.
 *
 * We already have something mermaid does not: a parsed graph with real node
 * positions, persisted in the `%% forkleaf:layout` comment. Given positions
 * and a size function that does not need to measure, laying out an SVG is
 * arithmetic. That is what makes the pull-request diff possible at all.
 *
 * This is deliberately not a mermaid clone. It draws the five dialects the
 * graph model covers, in the app's own palette, and it draws them the same way
 * the canvas does — because the canvas and this renderer now share one sizing
 * module. Anything else falls back to mermaid in the browser.
 */

export interface SvgTheme {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  line: string;
  /** Fills for the three diff states, plus their strokes. */
  addedFill: string;
  addedStroke: string;
  removedFill: string;
  removedStroke: string;
  changedFill: string;
  changedStroke: string;
  fontFamily: string;
}

export const LIGHT_SVG_THEME: SvgTheme = {
  background: "#F1EEE6",
  surface: "#FFFFFF",
  text: "#22262E",
  muted: "#6B7280",
  border: "#2A3240",
  line: "#3FA796",
  addedFill: "#DCFCE7",
  addedStroke: "#15803D",
  removedFill: "#FEE2E2",
  removedStroke: "#B91C1C",
  changedFill: "#FEF3C7",
  changedStroke: "#B45309",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
};

export const DARK_SVG_THEME: SvgTheme = {
  background: "#14181F",
  surface: "#1E2530",
  text: "#EDEAE2",
  muted: "#9AA3B2",
  border: "#3FA796",
  line: "#3FA796",
  addedFill: "#14351F",
  addedStroke: "#4ADE80",
  removedFill: "#3A1618",
  removedStroke: "#F87171",
  changedFill: "#3A2C10",
  changedStroke: "#FBBF24",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
};

export interface RenderSvgOptions {
  theme?: SvgTheme;
  /**
   * Status per node id and per edge id. Anything absent is drawn plain, so a
   * caller that has no diff to show simply passes nothing.
   */
  nodeStatus?: Map<string, DiffStatus>;
  edgeStatus?: Map<string, DiffStatus>;
  /** Blank space around the content. */
  padding?: number;
  /** Adds `width`/`height` attributes as well as the viewBox. */
  sized?: boolean;
  /** A `<title>` element, which is what a screen reader announces. */
  title?: string;
}

/** XML-escapes text destined for a text node or an attribute value. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Rounds to one decimal so the output is stable and not full of noise. */
function n(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "0";
}

interface Placed {
  node: GraphNode;
  size: Size;
  /** Centre point, which is what edges aim at. */
  cx: number;
  cy: number;
}

/** Each node's box and centre point, which is what edges aim at. */
function place(graph: Graph): Placed[] {
  return graph.nodes.map((node) => {
    const size = sizeOf(node);
    return { node, size, cx: node.x + size.width / 2, cy: node.y + size.height / 2 };
  });
}

/**
 * Where a line from `from` to `to` crosses `from`'s boundary.
 *
 * Treated as a rectangle for every shape. A circle would want a radial
 * intersection and a diamond a rhombic one, but the error is a few pixels of
 * arrowhead placement and the alternative is four boundary solvers whose bugs
 * would be invisible until somebody drew the wrong diagram.
 */
function edgePoint(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (dx === 0 && dy === 0) return { x: from.cx, y: from.cy };

  const halfW = from.size.width / 2 + 2;
  const halfH = from.size.height / 2 + 2;

  // Scale the direction vector until it lands on whichever edge it reaches
  // first, which is the smaller of the two axis ratios.
  const scale = Math.min(
    dx === 0 ? Infinity : halfW / Math.abs(dx),
    dy === 0 ? Infinity : halfH / Math.abs(dy),
  );

  return { x: from.cx + dx * scale, y: from.cy + dy * scale };
}

function statusColors(
  status: DiffStatus | undefined,
  theme: SvgTheme,
): { fill: string; stroke: string; opacity: number; dash: string | null } {
  switch (status) {
    case "added":
      return { fill: theme.addedFill, stroke: theme.addedStroke, opacity: 1, dash: null };
    case "removed":
      // Ghosted rather than hidden: the reviewer has to see what left, and a
      // dashed outline at reduced weight reads as "was here" without competing
      // with the diagram that actually exists now.
      return { fill: theme.removedFill, stroke: theme.removedStroke, opacity: 0.75, dash: "6 4" };
    case "changed":
      return { fill: theme.changedFill, stroke: theme.changedStroke, opacity: 1, dash: null };
    case "moved":
      return { fill: theme.surface, stroke: theme.muted, opacity: 0.85, dash: "2 3" };
    default:
      return { fill: theme.surface, stroke: theme.border, opacity: 1, dash: null };
  }
}

/** Splits a label into lines that fit the box, on words where it can. */
function wrap(label: string, maxChars: number): string[] {
  const explicit = label.split(/<br\s*\/?>|\\n/);
  const lines: string[] = [];

  for (const chunk of explicit) {
    const words = chunk.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let line = "";
    for (const word of words) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (candidate.length <= maxChars) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines.length > 0 ? lines : [""];
}

function nodeShapePath(placed: Placed, theme: SvgTheme, status: DiffStatus | undefined): string {
  const { node, size } = placed;
  const { x, y } = node;
  const { width: w, height: h } = size;
  const colors = statusColors(status, theme);

  const common = `fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5"${
    colors.dash ? ` stroke-dasharray="${colors.dash}"` : ""
  } opacity="${colors.opacity}"`;

  switch (node.shape) {
    case "start":
      return `<circle cx="${n(placed.cx)}" cy="${n(placed.cy)}" r="${n(w / 2)}" fill="${colors.stroke}" opacity="${colors.opacity}" />`;
    case "end":
      return (
        `<circle cx="${n(placed.cx)}" cy="${n(placed.cy)}" r="${n(w / 2)}" fill="none" stroke="${colors.stroke}" stroke-width="2" opacity="${colors.opacity}" />` +
        `<circle cx="${n(placed.cx)}" cy="${n(placed.cy)}" r="${n(w / 2 - 5)}" fill="${colors.stroke}" opacity="${colors.opacity}" />`
      );
    case "fork":
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${colors.stroke}" opacity="${colors.opacity}" />`;
    case "choice":
    case "diamond":
      return `<polygon points="${n(placed.cx)},${n(y)} ${n(x + w)},${n(placed.cy)} ${n(placed.cx)},${n(y + h)} ${n(x)},${n(placed.cy)}" ${common} />`;
    case "circle":
    case "mind-circle":
    case "mind-bang":
      return `<circle cx="${n(placed.cx)}" cy="${n(placed.cy)}" r="${n(Math.min(w, h) / 2)}" ${common} />`;
    case "stadium":
    case "round":
    case "mind-round":
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(node.shape === "stadium" ? h / 2 : 10)}" ${common} />`;
    case "cylinder": {
      const ry = Math.min(12, h / 4);
      return (
        `<path d="M ${n(x)} ${n(y + ry)} a ${n(w / 2)} ${n(ry)} 0 0 1 ${n(w)} 0 l 0 ${n(h - ry * 2)} a ${n(w / 2)} ${n(ry)} 0 0 1 ${n(-w)} 0 Z" ${common} />` +
        `<path d="M ${n(x)} ${n(y + ry)} a ${n(w / 2)} ${n(ry)} 0 0 0 ${n(w)} 0" fill="none" stroke="${colors.stroke}" opacity="${colors.opacity}" />`
      );
    }
    case "parallelogram": {
      const skew = Math.min(22, w / 5);
      return `<polygon points="${n(x + skew)},${n(y)} ${n(x + w)},${n(y)} ${n(x + w - skew)},${n(y + h)} ${n(x)},${n(y + h)}" ${common} />`;
    }
    case "hexagon":
    case "mind-hexagon": {
      const cut = Math.min(20, w / 6);
      return `<polygon points="${n(x + cut)},${n(y)} ${n(x + w - cut)},${n(y)} ${n(x + w)},${n(placed.cy)} ${n(x + w - cut)},${n(y + h)} ${n(x + cut)},${n(y + h)} ${n(x)},${n(placed.cy)}" ${common} />`;
    }
    default:
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="4" ${common} />`;
  }
}

function nodeText(placed: Placed, theme: SvgTheme, status: DiffStatus | undefined): string {
  const { node, size } = placed;
  if (isMarker(node.shape)) return "";

  const colors = statusColors(status, theme);
  const fill = status === undefined || status === "same" ? theme.text : colors.stroke;

  // A class or entity carries a name and a list of members, and the list is
  // the reason the diagram exists — so it is drawn, left-aligned under a rule,
  // rather than collapsed into the title.
  if (hasMembers(node.shape)) {
    const { name, members } = splitMembers(node.label);
    const lines: string[] = [
      `<text x="${n(placed.cx)}" y="${n(node.y + 20)}" text-anchor="middle" font-size="13" font-weight="600" fill="${fill}" font-family="${theme.fontFamily}">${escapeXml(name)}</text>`,
      `<line x1="${n(node.x)}" y1="${n(node.y + MEMBER_HEADER)}" x2="${n(node.x + size.width)}" y2="${n(node.y + MEMBER_HEADER)}" stroke="${colors.stroke}" opacity="${colors.opacity}" />`,
    ];

    members.forEach((member, index) => {
      const y = node.y + MEMBER_HEADER + 13 + index * MEMBER_HEIGHT;
      lines.push(
        `<text x="${n(node.x + 10)}" y="${n(y)}" font-size="11.5" fill="${theme.muted}" font-family="${theme.fontFamily}">${escapeXml(member)}</text>`,
      );
    });

    return lines.join("");
  }

  const maxChars = Math.max(6, Math.floor((size.width - 16) / 7.4));
  const lines = wrap(node.label, maxChars);
  const lineHeight = 15;
  const top = placed.cy - ((lines.length - 1) * lineHeight) / 2 + 4.5;

  return lines
    .map(
      (line, index) =>
        `<text x="${n(placed.cx)}" y="${n(top + index * lineHeight)}" text-anchor="middle" font-size="13" fill="${fill}" font-family="${theme.fontFamily}">${escapeXml(line)}</text>`,
    )
    .join("");
}

/** Arrowhead markers, one per colour we draw edges in. */
function markers(theme: SvgTheme): string {
  const heads = [
    ["plain", theme.line],
    ["added", theme.addedStroke],
    ["removed", theme.removedStroke],
    ["changed", theme.changedStroke],
    ["moved", theme.muted],
  ];

  return heads
    .map(
      ([id, color]) =>
        `<marker id="fl-arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" /></marker>`,
    )
    .join("");
}

function edgeColor(
  status: DiffStatus | undefined,
  theme: SvgTheme,
): { color: string; head: string } {
  switch (status) {
    case "added":
      return { color: theme.addedStroke, head: "added" };
    case "removed":
      return { color: theme.removedStroke, head: "removed" };
    case "changed":
      return { color: theme.changedStroke, head: "changed" };
    case "moved":
      return { color: theme.muted, head: "moved" };
    default:
      return { color: theme.line, head: "plain" };
  }
}

/** Which edge styles mermaid draws without an arrowhead. */
const HEADLESS = new Set(["open", "associate", "one-one", "one-many", "many-one", "many-many"]);

function edgeSvg(
  edge: GraphEdge,
  from: Placed,
  to: Placed,
  theme: SvgTheme,
  status: DiffStatus | undefined,
): string {
  const start = edgePoint(from, to);
  const end = edgePoint(to, from);
  const { color, head } = edgeColor(status, theme);

  const dashed =
    edge.style === "dotted" ||
    edge.style === "depend" ||
    edge.dashed === true ||
    status === "removed";
  const width = edge.style === "thick" ? 3 : 1.6;

  const attrs = [
    `stroke="${color}"`,
    `stroke-width="${width}"`,
    dashed ? `stroke-dasharray="6 4"` : "",
    status === "removed" ? `opacity="0.75"` : "",
    HEADLESS.has(edge.style) ? "" : `marker-end="url(#fl-arrow-${head})"`,
  ]
    .filter(Boolean)
    .join(" ");

  const line = `<line x1="${n(start.x)}" y1="${n(start.y)}" x2="${n(end.x)}" y2="${n(end.y)}" ${attrs} />`;

  const pieces = [line];

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  if (edge.label) {
    const text = escapeXml(edge.label);
    const boxWidth = text.length * 6.6 + 10;
    pieces.push(
      `<rect x="${n(midX - boxWidth / 2)}" y="${n(midY - 9)}" width="${n(boxWidth)}" height="18" rx="3" fill="${theme.background}" opacity="0.92" />`,
      `<text x="${n(midX)}" y="${n(midY + 4)}" text-anchor="middle" font-size="11.5" fill="${status && status !== "same" ? color : theme.muted}" font-family="${theme.fontFamily}">${text}</text>`,
    );
  }

  // Cardinalities sit at the ends they belong to, which is the whole point of
  // writing them: `1` next to one box and `*` next to the other.
  const cardinality = (
    value: string | undefined,
    at: { x: number; y: number },
    towards: { x: number; y: number },
  ) => {
    if (!value) return;
    const dx = towards.x - at.x;
    const dy = towards.y - at.y;
    const length = Math.hypot(dx, dy) || 1;
    pieces.push(
      `<text x="${n(at.x + (dx / length) * 16)}" y="${n(at.y + (dy / length) * 16 + 4)}" text-anchor="middle" font-size="11" fill="${theme.muted}" font-family="${theme.fontFamily}">${escapeXml(value)}</text>`,
    );
  };

  cardinality(edge.fromCardinality, start, end);
  cardinality(edge.toCardinality, end, start);

  return pieces.join("");
}

/**
 * Renders a graph as a standalone SVG document.
 *
 * The result is self-contained — no external fonts, no scripts, no `<style>`
 * beyond presentation attributes — so it is safe to serve as `image/svg+xml`
 * and safe to embed in a README.
 */
export function graphToSvg(graph: Graph, options: RenderSvgOptions = {}): string {
  const theme = options.theme ?? LIGHT_SVG_THEME;
  const padding = options.padding ?? 24;

  const placed = place(graph);

  if (placed.length === 0) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" role="img">`,
      options.title ? `<title>${escapeXml(options.title)}</title>` : "",
      `<rect width="320" height="120" fill="${theme.background}" />`,
      `<text x="160" y="64" text-anchor="middle" font-size="13" fill="${theme.muted}" font-family="${theme.fontFamily}">Empty diagram</text>`,
      `</svg>`,
    ].join("");
  }

  const minX = Math.min(...placed.map((item) => item.node.x));
  const minY = Math.min(...placed.map((item) => item.node.y));
  const maxX = Math.max(...placed.map((item) => item.node.x + item.size.width));
  const maxY = Math.max(...placed.map((item) => item.node.y + item.size.height));

  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  const byId = new Map(placed.map((item) => [item.node.id, item]));

  const edges = graph.edges
    .map((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return "";
      return edgeSvg(edge, from, to, theme, options.edgeStatus?.get(edge.id));
    })
    .join("");

  const nodes = placed
    .map((item) => {
      const status = options.nodeStatus?.get(item.node.id);
      return nodeShapePath(item, theme, status) + nodeText(item, theme, status);
    })
    .join("");

  const size = options.sized ? ` width="${n(width)}" height="${n(height)}"` : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(minX - padding)} ${n(minY - padding)} ${n(width)} ${n(height)}"${size} role="img">`,
    options.title ? `<title>${escapeXml(options.title)}</title>` : "",
    `<defs>${markers(theme)}</defs>`,
    `<rect x="${n(minX - padding)}" y="${n(minY - padding)}" width="${n(width)}" height="${n(height)}" fill="${theme.background}" />`,
    // Edges under nodes, so an arrow never crosses the label it points at.
    `<g>${edges}</g>`,
    `<g>${nodes}</g>`,
    `</svg>`,
  ].join("");
}

/**
 * Renders mermaid source as SVG, arranging it if it was never arranged.
 *
 * Returns null for a diagram this renderer has no model for — which is not a
 * failure, it is the signal to fall back to mermaid in the browser.
 */
export function mermaidToSvg(code: string, options: RenderSvgOptions = {}): string | null {
  const graph = mermaidToGraph(code);
  if (!graph) return null;

  const arranged = /%%\s*forkleaf:layout\s/.test(code) ? graph : tidyLayout(graph);
  return graphToSvg(arranged, options);
}

// ─── The diff picture ───────────────────────────────────────────────────────

/**
 * One drawing showing both revisions at once.
 *
 * Two pictures side by side make the reader do the comparison; a single
 * overlay does it for them. Everything from the after side is drawn as it now
 * is, and whatever the before side had and lost is drawn ghosted alongside —
 * so "what left" and "what arrived" are in the same coordinate space and the
 * eye can land on the difference without scanning twice.
 */
export function diffToSvg(diff: GraphDiff, options: RenderSvgOptions = {}): string {
  const nodeStatus = new Map<string, DiffStatus>();
  const edgeStatus = new Map<string, DiffStatus>();

  // The overlay graph: the after revision, plus the removed elements put back
  // where they used to be so they can be drawn as ghosts.
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const entry of diff.nodes) {
    const node = entry.after ?? entry.before;
    if (!node) continue;
    nodes.push(node);
    nodeStatus.set(node.id, entry.status);
  }

  for (const entry of diff.edges) {
    const edge = entry.after ?? entry.before;
    if (!edge) continue;
    edges.push(edge);
    edgeStatus.set(edge.id, entry.status);
  }

  // A removed edge references before-side ids. Where the node still exists
  // under a new id the edge would dangle, so those endpoints are remapped.
  const known = new Set(nodes.map((node) => node.id));
  const renamed = new Map<string, string>();
  for (const entry of diff.nodes) {
    if (entry.before && entry.after && entry.before.id !== entry.after.id) {
      renamed.set(entry.before.id, entry.after.id);
    }
  }

  const resolved = edges
    .map((edge) => ({
      ...edge,
      from: known.has(edge.from) ? edge.from : (renamed.get(edge.from) ?? edge.from),
      to: known.has(edge.to) ? edge.to : (renamed.get(edge.to) ?? edge.to),
    }))
    .filter((edge) => known.has(edge.from) && known.has(edge.to));

  const overlay: Graph = {
    kind: diff.after.kind,
    direction: diff.after.direction,
    nodes,
    edges: resolved,
  };

  // The after side owns the layout; a node that only exists on the before side
  // keeps its old position, which is where the reader last saw it.
  const arranged = overlay.nodes.every((node) => node.x === 0 && node.y === 0)
    ? tidyLayout(overlay)
    : overlay;

  return graphToSvg(arranged, { ...options, nodeStatus, edgeStatus });
}

/** True when this diff can be drawn as an overlay rather than described. */
export function isDrawableDiff(diff: DiagramDiff): diff is GraphDiff {
  return diff.shape === "graph";
}
