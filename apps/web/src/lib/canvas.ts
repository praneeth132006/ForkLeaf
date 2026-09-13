/**
 * Canvases: notes, cards, links and pictures placed freely on a board.
 *
 * Stored as JSON Canvas 1.0 (jsoncanvas.org), the open format Obsidian's
 * canvases use, in a `.canvas` file beside the notes. So a board made here
 * opens in Obsidian and the other way round, it is diffable text in the
 * repository, and nothing about it lives only inside this app.
 *
 * Everything here is pure: the board component calls these functions and
 * saves what they return. Fields this app does not understand are kept as they
 * were read, because a format is only open if a round trip through one tool
 * does not strip what another tool wrote.
 */

export type Side = "top" | "right" | "bottom" | "left";

interface NodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** "1"–"6" for the preset colours, or a `#rrggbb` hex. */
  color?: string;
  [extra: string]: unknown;
}

export interface TextNode extends NodeBase {
  type: "text";
  text: string;
}

export interface FileNode extends NodeBase {
  type: "file";
  file: string;
  subpath?: string;
}

export interface LinkNode extends NodeBase {
  type: "link";
  url: string;
}

export interface GroupNode extends NodeBase {
  type: "group";
  label?: string;
}

export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;
export type NewNode =
  Omit<TextNode, "id"> | Omit<FileNode, "id"> | Omit<LinkNode, "id"> | Omit<GroupNode, "id">;

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: Side;
  toNode: string;
  toSide?: Side;
  toEnd?: "none" | "arrow";
  fromEnd?: "none" | "arrow";
  color?: string;
  label?: string;
  [extra: string]: unknown;
}

export interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  [extra: string]: unknown;
}

/** What is on screen: the world point at the top-left, and the zoom. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export const CANVAS_FOLDER = "canvases";
export const MIN_WIDTH = 80;
export const MIN_HEIGHT = 40;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;

const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

export const isCanvasPath = (path: string) => /\.canvas$/i.test(path);
export const emptyCanvas = (): Canvas => ({ nodes: [], edges: [] });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function readNode(raw: unknown): CanvasNode | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (!isNumber(raw.x) || !isNumber(raw.y) || !isNumber(raw.width) || !isNumber(raw.height)) {
    return null;
  }
  if (raw.width <= 0 || raw.height <= 0) return null;
  switch (raw.type) {
    case "text":
      return typeof raw.text === "string" ? (raw as TextNode) : null;
    case "file":
      return typeof raw.file === "string" && raw.file ? (raw as FileNode) : null;
    case "link":
      return typeof raw.url === "string" && raw.url ? (raw as LinkNode) : null;
    case "group":
      return raw as GroupNode;
    default:
      return null;
  }
}

/**
 * Reads a `.canvas` file.
 *
 * An empty file is an empty board. A file that is not a canvas at all is
 * reported rather than opened as an empty board, because saving that board
 * would replace whatever the file held. Nodes and edges that are malformed —
 * or edges whose ends are gone — are dropped, and the count is reported.
 */
export function parseCanvas(text: string): {
  canvas: Canvas;
  problem: string | null;
  dropped: number;
} {
  if (!text.trim()) return { canvas: emptyCanvas(), problem: null, dropped: 0 };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      canvas: emptyCanvas(),
      problem: "This file is not valid JSON Canvas, so it cannot be shown as a board.",
      dropped: 0,
    };
  }
  if (!isObject(data)) {
    return {
      canvas: emptyCanvas(),
      problem: "This file is not a JSON Canvas board.",
      dropped: 0,
    };
  }

  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const rawEdges = Array.isArray(data.edges) ? data.edges : [];
  const nodes = rawNodes.map(readNode).filter((node): node is CanvasNode => node !== null);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = rawEdges.filter(
    (edge): edge is CanvasEdge =>
      isObject(edge) &&
      typeof edge.id === "string" &&
      typeof edge.fromNode === "string" &&
      typeof edge.toNode === "string" &&
      ids.has(edge.fromNode) &&
      ids.has(edge.toNode),
  );

  return {
    canvas: { ...data, nodes, edges },
    problem: null,
    dropped: rawNodes.length - nodes.length + (rawEdges.length - edges.length),
  };
}

/** JSON Canvas as Obsidian writes it: tab-indented, whole-pixel positions. */
export function serializeCanvas(canvas: Canvas): string {
  const round = <T extends NodeBase>(node: T): T => ({
    ...node,
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: Math.round(node.width),
    height: Math.round(node.height),
  });
  return `${JSON.stringify({ ...canvas, nodes: canvas.nodes.map(round), edges: canvas.edges }, null, "\t")}\n`;
}

/** A 16-character hex id, as Obsidian makes them, not already on the board. */
export function newId(canvas: Canvas): string {
  const taken = new Set([
    ...canvas.nodes.map((node) => node.id),
    ...canvas.edges.map((edge) => edge.id),
  ]);
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (!taken.has(id)) return id;
  }
}

export function addNode(canvas: Canvas, node: NewNode): { canvas: Canvas; id: string } {
  const id = newId(canvas);
  return { canvas: { ...canvas, nodes: [...canvas.nodes, { ...node, id } as CanvasNode] }, id };
}

const inside = (node: NodeBase, group: NodeBase) =>
  node.x >= group.x &&
  node.y >= group.y &&
  node.x + node.width <= group.x + group.width &&
  node.y + node.height <= group.y + group.height;

/** Moves nodes by a distance. A group carries the nodes that sit inside it. */
export function moveNodes(
  canvas: Canvas,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): Canvas {
  const moving = new Set(ids);
  for (const node of canvas.nodes) {
    if (node.type !== "group" || !ids.has(node.id)) continue;
    for (const other of canvas.nodes) {
      if (other.id !== node.id && inside(other, node)) moving.add(other.id);
    }
  }
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      moving.has(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node,
    ),
  };
}

export function resizeNode(canvas: Canvas, id: string, width: number, height: number): Canvas {
  return updateNode(canvas, id, {
    width: Math.max(MIN_WIDTH, width),
    height: Math.max(MIN_HEIGHT, height),
  });
}

export function updateNode(canvas: Canvas, id: string, patch: Partial<CanvasNode>): Canvas {
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      node.id === id ? ({ ...node, ...patch } as CanvasNode) : node,
    ),
  };
}

/** Removes nodes and every edge touching them. */
export function removeNodes(canvas: Canvas, ids: ReadonlySet<string>): Canvas {
  return {
    ...canvas,
    nodes: canvas.nodes.filter((node) => !ids.has(node.id)),
    edges: canvas.edges.filter((edge) => !ids.has(edge.fromNode) && !ids.has(edge.toNode)),
  };
}

export function removeEdge(canvas: Canvas, id: string): Canvas {
  return { ...canvas, edges: canvas.edges.filter((edge) => edge.id !== id) };
}

/** Which side of `a` faces `b`. */
export function sideFacing(a: NodeBase, b: NodeBase): Side {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/** Joins two nodes with an arrow, on the sides that face each other. Once only. */
export function connect(canvas: Canvas, from: string, to: string): Canvas {
  if (from === to) return canvas;
  const a = canvas.nodes.find((node) => node.id === from);
  const b = canvas.nodes.find((node) => node.id === to);
  if (!a || !b) return canvas;
  const exists = canvas.edges.some(
    (edge) =>
      (edge.fromNode === from && edge.toNode === to) ||
      (edge.fromNode === to && edge.toNode === from),
  );
  if (exists) return canvas;
  const edge: CanvasEdge = {
    id: newId(canvas),
    fromNode: from,
    fromSide: sideFacing(a, b),
    toNode: to,
    toSide: sideFacing(b, a),
    toEnd: "arrow",
  };
  return { ...canvas, edges: [...canvas.edges, edge] };
}

/** The middle of one side of a node, where an edge meets it. */
export function anchor(node: NodeBase, side: Side): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
    default:
      return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
}

const NORMAL: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** An SVG path for an edge: a curve that leaves and arrives square to each side. */
export function edgePath(
  from: NodeBase,
  to: NodeBase,
  edge: Pick<CanvasEdge, "fromSide" | "toSide">,
): string {
  const fromSide =
    edge.fromSide && SIDES.includes(edge.fromSide) ? edge.fromSide : sideFacing(from, to);
  const toSide = edge.toSide && SIDES.includes(edge.toSide) ? edge.toSide : sideFacing(to, from);
  const start = anchor(from, fromSide);
  const end = anchor(to, toSide);
  const reach = Math.max(40, Math.min(160, Math.hypot(end.x - start.x, end.y - start.y) / 2));
  const c1 = { x: start.x + NORMAL[fromSide].x * reach, y: start.y + NORMAL[fromSide].y * reach };
  const c2 = { x: end.x + NORMAL[toSide].x * reach, y: end.y + NORMAL[toSide].y * reach };
  const f = (n: number) => Math.round(n * 10) / 10;
  return `M ${f(start.x)} ${f(start.y)} C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(end.x)} ${f(end.y)}`;
}

export function bounds(
  nodes: readonly NodeBase[],
): { x: number; y: number; width: number; height: number } | null {
  if (nodes.length === 0) return null;
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The view that shows the whole board, centred, never zoomed in past 100%. */
export function fitView(
  canvas: Canvas,
  viewport: { width: number; height: number },
  padding = 48,
): View {
  const box = bounds(canvas.nodes);
  if (!box) return { x: -viewport.width / 2, y: -viewport.height / 2, zoom: 1 };
  const zoom = clampZoom(
    Math.min(
      1,
      (viewport.width - padding * 2) / Math.max(1, box.width),
      (viewport.height - padding * 2) / Math.max(1, box.height),
    ),
  );
  return {
    x: box.x + box.width / 2 - viewport.width / (2 * zoom),
    y: box.y + box.height / 2 - viewport.height / (2 * zoom),
    zoom,
  };
}

/** Zooms around a screen point, so what is under the cursor stays under it. */
export function zoomAt(view: View, screen: { x: number; y: number }, factor: number): View {
  const zoom = clampZoom(view.zoom * factor);
  const worldX = view.x + screen.x / view.zoom;
  const worldY = view.y + screen.y / view.zoom;
  return { x: worldX - screen.x / zoom, y: worldY - screen.y / zoom, zoom };
}

export const toWorld = (view: View, screen: { x: number; y: number }) => ({
  x: view.x + screen.x / view.zoom,
  y: view.y + screen.y / view.zoom,
});

/** Where a new card goes: the middle of the view, stepped clear of the cards already there. */
export function placeNew(
  canvas: Canvas,
  view: View,
  viewport: { width: number; height: number },
  size: { width: number; height: number },
): { x: number; y: number } {
  let x = Math.round(view.x + viewport.width / (2 * view.zoom) - size.width / 2);
  let y = Math.round(view.y + viewport.height / (2 * view.zoom) - size.height / 2);
  // Cards of different sizes centred on the same point overlap without sharing
  // a corner, so this checks the whole rectangle, not the top-left.
  const overlaps = () =>
    canvas.nodes.some(
      (node) =>
        node.type !== "group" &&
        x < node.x + node.width &&
        x + size.width > node.x &&
        y < node.y + node.height &&
        y + size.height > node.y,
    );
  for (let step = 0; step < 40 && overlaps(); step += 1) {
    x += 32;
    y += 32;
  }
  return { x, y };
}

/** A path for a new board that nothing else is at. */
export function newCanvasPath(taken: Iterable<string>, now: Date): string {
  const existing = new Set(taken);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  let path = `${CANVAS_FOLDER}/Canvas ${date}.canvas`;
  for (let n = 2; existing.has(path); n += 1) path = `${CANVAS_FOLDER}/Canvas ${date} ${n}.canvas`;
  return path;
}

export const canvasTitle = (path: string) =>
  (path.split("/").pop() ?? path).replace(/\.canvas$/i, "");

const PRESETS: Record<string, string> = {
  "1": "#e5484d",
  "2": "#f76b15",
  "3": "#ffc53d",
  "4": "#30a46c",
  "5": "#05a2c2",
  "6": "#8e4ec6",
};

/** A node's or edge's colour as CSS, or null for the default. */
export function colorOf(color: string | undefined): string | null {
  if (!color) return null;
  if (PRESETS[color]) return PRESETS[color]!;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}
