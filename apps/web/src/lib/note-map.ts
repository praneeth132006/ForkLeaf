import {
  emptyCanvas,
  newId,
  serializeCanvas,
  type Canvas,
  type CanvasEdge,
  type CanvasNode,
  type LinkGraph,
} from "@forkleaf/markdown-engine";

/**
 * Map this note: a canvas of a note and everything it links to, laid out.
 *
 * The note sits in the middle. The notes it links to and the notes that link
 * to it sit on a ring around it — links out on the right half, links in on the
 * left, both ways at the top — and, one step further, the notes those link to
 * sit on an outer ring beside the note that led to them. Arrows follow the
 * links. It is an ordinary canvas block, so every card can be moved after.
 */

export interface NoteMapOptions {
  /** 1 for the note's own links; 2 to follow each of those one step further. */
  depth?: 1 | 2;
  /** The most notes on the map, the note itself included. */
  limit?: number;
}

const CARD = { width: 260, height: 110 };
const RING = 380;
const OUTER = 760;

type Direction = "out" | "in" | "both";

function neighbours(graph: LinkGraph, path: string): Map<string, Direction> {
  const found = new Map<string, Direction>();
  for (const ref of graph.outgoing.get(path) ?? []) {
    if (ref.to && ref.to !== path) found.set(ref.to, "out");
  }
  for (const ref of graph.backlinks.get(path) ?? []) {
    if (ref.from === path) continue;
    found.set(ref.from, found.get(ref.from) === "out" ? "both" : (found.get(ref.from) ?? "in"));
  }
  return found;
}

const linksTo = (graph: LinkGraph, from: string, to: string) =>
  (graph.outgoing.get(from) ?? []).some((ref) => ref.to === to);

/** Angles, in radians, for `count` cards spread over an arc. */
function spread(count: number, from: number, to: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [(from + to) / 2];
  const step = (to - from) / count;
  return Array.from({ length: count }, (_, index) => from + step * (index + 0.5));
}

export function mapNote(graph: LinkGraph, path: string, options: NoteMapOptions = {}): Canvas {
  const limit = Math.max(1, options.limit ?? 40);
  let canvas = emptyCanvas();
  const ids = new Map<string, string>();

  const place = (file: string, x: number, y: number) => {
    const id = newId(canvas);
    const node = {
      id,
      type: "file",
      file,
      x: Math.round(x - CARD.width / 2),
      y: Math.round(y - CARD.height / 2),
      ...CARD,
    } as CanvasNode;
    canvas = { ...canvas, nodes: [...canvas.nodes, node] };
    ids.set(file, id);
  };

  place(path, 0, 0);

  const first = neighbours(graph, path);
  const byTitle = (list: string[]) => [...list].sort((a, b) => a.localeCompare(b));
  const groups: Record<Direction, string[]> = { out: [], in: [], both: [] };
  for (const [file, direction] of first) groups[direction].push(file);

  // Out on the right half, in on the left, both ways across the top.
  const arcs: [Direction, number, number][] = [
    ["both", -Math.PI * 0.75, -Math.PI * 0.25],
    ["out", -Math.PI * 0.25, Math.PI * 0.5],
    ["in", Math.PI * 0.5, Math.PI * 1.25],
  ];
  const angleOf = new Map<string, number>();
  for (const [direction, from, to] of arcs) {
    const files = byTitle(groups[direction]).filter((_, index) => ids.size + index < limit);
    spread(files.length, from, to).forEach((angle, index) => {
      const file = files[index]!;
      if (ids.size >= limit) return;
      place(file, Math.cos(angle) * RING, Math.sin(angle) * RING);
      angleOf.set(file, angle);
    });
  }

  if (options.depth === 2) {
    for (const [file, angle] of angleOf) {
      const further = byTitle([...neighbours(graph, file).keys()].filter((next) => !ids.has(next)));
      const width = Math.min(Math.PI / 3, 0.25 * Math.max(1, further.length));
      spread(further.length, angle - width / 2, angle + width / 2).forEach((each, index) => {
        if (ids.size >= limit) return;
        place(further[index]!, Math.cos(each) * OUTER, Math.sin(each) * OUTER);
      });
    }
  }

  // An arrow for every link between two notes on the map, in the direction written.
  const edges: CanvasEdge[] = [];
  const files = [...ids.keys()];
  for (const from of files) {
    for (const to of files) {
      if (from === to || !linksTo(graph, from, to)) continue;
      const edge: CanvasEdge = {
        id: newId({ ...canvas, edges }),
        fromNode: ids.get(from)!,
        toNode: ids.get(to)!,
        toEnd: "arrow",
      };
      edges.push(edge);
    }
  }
  return { ...canvas, edges };
}

/** The map as a ```canvas block to put in a note. */
export function noteMapMarkdown(canvas: Canvas): string {
  const json = serializeCanvas(canvas).trimEnd();
  const longest = Math.max(0, ...(json.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}canvas\n${json}\n${fence}\n`;
}
