import type { NodeShape } from "@forkleaf/diagrams";

/**
 * How an arrow on the diagram canvas runs from one box to another.
 *
 * Arrows used to leave each box wherever the straight line between the two
 * centres happened to cross its outline — a third of the way along the top
 * edge, a few pixels from a corner — so no two arrows met a box at the same
 * place and a diagram looked scribbled however carefully it was laid out.
 *
 * Whiteboard tools settled this long ago: a connector attaches to the middle
 * of one of a shape's four sides, leaves it at a right angle, and bends
 * smoothly to arrive square-on at the middle of a side of the other. That is
 * what this computes. The side is chosen by where the other box is, so moving
 * a box re-routes its arrows to the sides facing their neighbours.
 *
 * Pure geometry, no React: tested on numbers.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: NodeShape;
}

export type Side = "top" | "right" | "bottom" | "left";

export interface Route {
  start: Point;
  end: Point;
  startSide: Side;
  endSide: Side;
  /** Control points of the cubic Bézier between `start` and `end`. */
  c1: Point;
  c2: Point;
  /** SVG path data for the whole connector. */
  d: string;
}

const NORMAL: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

function centre(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * How far inside its bounding box a shape's outline sits at the middle of a
 * side. Zero for most shapes; a parallelogram's slanted ends and the small
 * state-diagram discs are drawn inset, and an arrow stopping at the bounding
 * box would hang in the air short of them.
 */
function inset(shape: NodeShape | undefined, side: Side): number {
  switch (shape) {
    case "parallelogram":
      return side === "left" || side === "right" ? 10 : 0;
    case "start":
      return 4;
    case "end":
    case "mind-circle":
      return 2;
    default:
      return 0;
  }
}

/** The point in the middle of one side of a box, on the shape's outline. */
export function sidePoint(box: Box, side: Side): Point {
  const { x, y } = centre(box);
  const pull = inset(box.shape, side);
  switch (side) {
    case "top":
      return { x, y: box.y + pull };
    case "bottom":
      return { x, y: box.y + box.height - pull };
    case "left":
      return { x: box.x + pull, y };
    case "right":
      return { x: box.x + box.width - pull, y };
  }
}

/**
 * The side of `box` facing `target`.
 *
 * Compared relative to the boxes' sizes rather than in raw pixels, so two wide
 * boxes stacked with a small vertical gap still connect top-to-bottom instead
 * of sideways across their long edges.
 */
export function facingSide(box: Box, target: Point, targetSize = { width: 0, height: 0 }): Side {
  const from = centre(box);
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const reachX = (box.width + targetSize.width) / 2 || 1;
  const reachY = (box.height + targetSize.height) / 2 || 1;

  if (Math.abs(dx) / reachX > Math.abs(dy) / reachY) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/** How far the curve's handles reach out of each side. */
function handleLength(start: Point, end: Point): number {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return Math.max(24, Math.min(distance * 0.45, 140));
}

function curve(start: Point, startSide: Side, end: Point, endSide: Side | null): Route {
  const reach = handleLength(start, end);
  const out = NORMAL[startSide];
  const c1 = { x: start.x + out.x * reach, y: start.y + out.y * reach };
  // A free end (the cursor, mid-drag) has no side; the curve simply heads
  // for it from the first handle.
  const back = endSide ? NORMAL[endSide] : { x: 0, y: 0 };
  const c2 = { x: end.x + back.x * reach, y: end.y + back.y * reach };

  return {
    start,
    end,
    startSide,
    endSide: endSide ?? OPPOSITE[startSide],
    c1,
    c2,
    d: `M ${fmt(start)} C ${fmt(c1)} ${fmt(c2)} ${fmt(end)}`,
  };
}

/** A connector from one box to another. */
export function routeConnector(from: Box, to: Box): Route {
  if (from === to || (from.x === to.x && from.y === to.y && from.width === to.width)) {
    return selfLoop(from);
  }

  const startSide = facingSide(from, centre(to), to);
  const endSide = OPPOSITE[startSide];
  return curve(sidePoint(from, startSide), startSide, sidePoint(to, endSide), endSide);
}

/** A connector from a box to a loose point — the one being dragged out. */
export function routeToPoint(from: Box, point: Point): Route {
  const startSide = facingSide(from, point);
  return curve(sidePoint(from, startSide), startSide, point, null);
}

/** A node connected to itself: out of the right side, round, into the top. */
function selfLoop(box: Box): Route {
  const start = sidePoint(box, "right");
  const end = sidePoint(box, "top");
  const reach = Math.max(40, Math.min(box.width, box.height));
  const c1 = { x: start.x + reach, y: start.y };
  const c2 = { x: end.x, y: end.y - reach };
  return {
    start,
    end,
    startSide: "right",
    endSide: "top",
    c1,
    c2,
    d: `M ${fmt(start)} C ${fmt(c1)} ${fmt(c2)} ${fmt(end)}`,
  };
}

/** One connector to route, by the ids of the boxes at its ends. */
export interface Connection {
  id: string;
  from: string;
  to: string;
}

/**
 * Shapes whose sides are flat enough to share. A diamond's "side" is a corner
 * and a circle's is a single point of its curve: arrows into those all meet
 * at that point, as they do in mermaid's own drawing.
 */
const FLAT_SIDES = new Set<NodeShape | undefined>([
  undefined,
  "rect",
  "round",
  "stadium",
  "cylinder",
  "parallelogram",
  "state",
  "class",
  "entity",
  "mind-square",
  "mind-round",
]);

/** Space between arrows sharing one side of a box. */
const PORT_SPACING = 18;

/**
 * Every connector in a diagram, routed together.
 *
 * Routed one at a time, two arrows using the same side of a box — the arrow
 * out of a step and the retry arrow back into it — met at exactly the same
 * point and read as one line that forked. Arrows sharing a side are spread
 * a little apart around its middle instead, in the order of where their other
 * ends are, so they leave side by side without crossing. One arrow on a side
 * still meets it dead centre.
 */
export function routeAll(
  connections: readonly Connection[],
  boxes: ReadonlyMap<string, Box>,
): Map<string, Route> {
  interface End {
    connection: string;
    end: "start" | "end";
    node: string;
    side: Side;
    /** Where the other end is, for ordering ends along a shared side. */
    toward: Point;
  }

  const routes = new Map<string, Route>();
  const sides = new Map<string, { start: Side; end: Side }>();
  const ends: End[] = [];

  for (const connection of connections) {
    const from = boxes.get(connection.from);
    const to = boxes.get(connection.to);
    if (!from || !to) continue;

    if (connection.from === connection.to) {
      routes.set(connection.id, selfLoop(from));
      continue;
    }

    const start = facingSide(from, centre(to), to);
    const end = OPPOSITE[start];
    sides.set(connection.id, { start, end });
    ends.push(
      {
        connection: connection.id,
        end: "start",
        node: connection.from,
        side: start,
        toward: centre(to),
      },
      {
        connection: connection.id,
        end: "end",
        node: connection.to,
        side: end,
        toward: centre(from),
      },
    );
  }

  // Group the ends by the side of the box they use.
  const groups = new Map<string, End[]>();
  for (const end of ends) {
    const key = `${end.node}\u0000${end.side}`;
    const group = groups.get(key);
    if (group) group.push(end);
    else groups.set(key, [end]);
  }

  const points = new Map<string, Point>();
  for (const group of groups.values()) {
    const { node, side } = group[0]!;
    const box = boxes.get(node)!;
    const middle = sidePoint(box, side);
    const runsAcross = side === "top" || side === "bottom";

    if (group.length === 1 || !FLAT_SIDES.has(box.shape)) {
      for (const end of group) points.set(`${end.connection}:${end.end}`, middle);
      continue;
    }

    const length = runsAcross ? box.width : box.height;
    const spacing = Math.min(PORT_SPACING, (length * 0.7) / (group.length - 1));
    const ordered = [...group].sort((a, b) =>
      runsAcross ? a.toward.x - b.toward.x : a.toward.y - b.toward.y,
    );
    ordered.forEach((end, index) => {
      const offset = (index - (ordered.length - 1) / 2) * spacing;
      points.set(
        `${end.connection}:${end.end}`,
        runsAcross ? { x: middle.x + offset, y: middle.y } : { x: middle.x, y: middle.y + offset },
      );
    });
  }

  for (const [id, { start, end }] of sides) {
    routes.set(id, curve(points.get(`${id}:start`)!, start, points.get(`${id}:end`)!, end));
  }

  return routes;
}

/** A point part-way along the curve, for labels and multiplicities. */
export function pointOnRoute(route: Route, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * route.start.x + b * route.c1.x + c * route.c2.x + e * route.end.x,
    y: a * route.start.y + b * route.c1.y + c * route.c2.y + e * route.end.y,
  };
}

function fmt(point: Point): string {
  return `${round(point.x)} ${round(point.y)}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
