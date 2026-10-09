import { sizeOf } from "./geometry";
import type { Graph, GraphEdge, GraphNode } from "./graph-model";

/**
 * Lays the graph out in layers, so a diagram dragged into a mess can be
 * straightened without being redrawn.
 *
 * Depth comes from the edges: a node sits one layer below the deepest thing
 * pointing at it. That is what makes the result meaningful rather than merely
 * tidy — the layers *are* the flow, so reading down the page reads the diagram
 * in order.
 *
 * Three things the first version got wrong, each of which made "Tidy up" look
 * worse than the mess it replaced:
 *
 *  - **Loops.** A flowchart's "No → try again" arrow points back up the page.
 *    Counted as an ordinary edge it pushed the step it returns to below
 *    everything else, and the main arrow into that step then ran straight
 *    through every box in between. Edges that close a loop are found first (by
 *    walking the graph from its starting points) and left out of the layering,
 *    so a loop is drawn as an arrow going back, not as a reason to move boxes.
 *  - **Order within a layer.** Nodes kept the order they were written in,
 *    which crossed arrows for no reason. Each layer is now sorted by where the
 *    nodes it hangs from sit — the usual barycentre heuristic — a few sweeps
 *    down and up, ties broken by written order so the result is stable.
 *  - **Uneven boxes.** Positions were top-left corners on a fixed grid, so a
 *    narrow "Start" sat off to the left of a wide "Save to database" below it.
 *    Every box is now centred on its column, with each layer as tall (or, left
 *    to right, as wide) as its largest box.
 *
 * `direction` decides which way the layers run, matching what mermaid will do
 * with the same graph — including bottom-to-top and right-to-left.
 */
export function tidyLayout(graph: Graph): Graph {
  if (graph.nodes.length === 0) return graph;

  const ids = graph.nodes.map((node) => node.id);
  const known = new Set(ids);
  const writtenOrder = new Map(ids.map((id, index) => [id, index]));
  const edges = graph.edges.filter(
    (edge) => known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to,
  );

  const forward = acyclicEdges(ids, edges);
  const layer = longestPathLayers(ids, forward);
  const rows = orderWithinLayers(ids, forward, layer, writtenOrder);

  return { ...graph, nodes: place(graph, rows) };
}

/**
 * The edges left once every loop is broken.
 *
 * A depth-first walk from each starting point — a node nothing points at, in
 * the order written; then anything not yet reached — marks an edge as closing a
 * loop when it leads back to a node still being walked. Those are dropped.
 */
function acyclicEdges(ids: string[], edges: GraphEdge[]): GraphEdge[] {
  const outgoing = new Map<string, GraphEdge[]>(ids.map((id) => [id, []]));
  const hasIncoming = new Set<string>();
  for (const edge of edges) {
    outgoing.get(edge.from)!.push(edge);
    hasIncoming.add(edge.to);
  }

  const state = new Map<string, "walking" | "done">();
  const backEdges = new Set<GraphEdge>();

  const walk = (start: string) => {
    // Iterative, so a long chain cannot overflow the stack.
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    state.set(start, "walking");

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const out = outgoing.get(frame.id)!;

      if (frame.next >= out.length) {
        state.set(frame.id, "done");
        stack.pop();
        continue;
      }

      const edge = out[frame.next]!;
      frame.next += 1;
      const seen = state.get(edge.to);
      if (seen === "walking") backEdges.add(edge);
      else if (seen === undefined) {
        state.set(edge.to, "walking");
        stack.push({ id: edge.to, next: 0 });
      }
    }
  };

  for (const id of ids) if (!hasIncoming.has(id) && !state.has(id)) walk(id);
  // Whatever is only reachable through a loop — a graph that is one big cycle.
  for (const id of ids) if (!state.has(id)) walk(id);

  return edges.filter((edge) => !backEdges.has(edge));
}

/** Each node one layer below the deepest node pointing at it. */
function longestPathLayers(ids: string[], edges: GraphEdge[]): Map<string, number> {
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) incoming.get(edge.to)!.push(edge.from);

  const layer = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    // The edges are acyclic, so this recursion ends; marking first is only a
    // guard against a bug elsewhere turning into a hang.
    layer.set(id, 0);
    const parents = incoming.get(id)!;
    const value = parents.length === 0 ? 0 : Math.max(...parents.map(depthOf)) + 1;
    layer.set(id, value);
    return value;
  };

  for (const id of ids) depthOf(id);
  return layer;
}

/**
 * Each layer's nodes, in an order that crosses as few arrows as it can.
 *
 * Sorted by the average position of their neighbours in the layer above (on
 * the way down) and below (on the way up). Four sweeps settle every diagram
 * small enough to draw by hand; ties keep the order the nodes were written in.
 */
function orderWithinLayers(
  ids: string[],
  edges: GraphEdge[],
  layer: Map<string, number>,
  writtenOrder: Map<string, number>,
): string[][] {
  const depth = Math.max(...ids.map((id) => layer.get(id)!)) + 1;
  const rows: string[][] = Array.from({ length: depth }, () => []);
  for (const id of ids) rows[layer.get(id)!]!.push(id);

  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) {
    parents.get(edge.to)!.push(edge.from);
    children.get(edge.from)!.push(edge.to);
  }

  const position = new Map<string, number>();
  const remember = (row: string[]) => row.forEach((id, index) => position.set(id, index));
  rows.forEach(remember);

  const sortBy = (row: string[], neighbours: Map<string, string[]>) => {
    const score = (id: string) => {
      const near = neighbours.get(id)!.filter((other) => position.has(other));
      if (near.length === 0) return position.get(id)!;
      return near.reduce((sum, other) => sum + position.get(other)!, 0) / near.length;
    };
    const scored = row.map((id) => ({ id, score: score(id) }));
    scored.sort((a, b) => a.score - b.score || writtenOrder.get(a.id)! - writtenOrder.get(b.id)!);
    return scored.map((entry) => entry.id);
  };

  for (let sweep = 0; sweep < 4; sweep += 1) {
    const down = sweep % 2 === 0;
    const order = down ? rows.keys() : [...rows.keys()].reverse();
    for (const index of order) {
      if (down ? index === 0 : index === rows.length - 1) continue;
      rows[index] = sortBy(rows[index]!, down ? parents : children);
      remember(rows[index]!);
    }
  }

  return rows;
}

/** Gaps between layers and between neighbours in a layer, in canvas pixels. */
const LAYER_GAP = { vertical: 72, horizontal: 96 };
const SIBLING_GAP = { vertical: 56, horizontal: 40 };
const ORIGIN = 80;

function place(graph: Graph, rows: string[][]): GraphNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const size = new Map(graph.nodes.map((node) => [node.id, sizeOf(node)]));
  const horizontal = graph.direction === "LR" || graph.direction === "RL";
  const reversed = graph.direction === "BT" || graph.direction === "RL";

  // How deep each layer is along the flow, and how wide each layer spreads
  // across it, so the whole drawing can be centred on one axis.
  const along = (id: string) => (horizontal ? size.get(id)!.width : size.get(id)!.height);
  const across = (id: string) => (horizontal ? size.get(id)!.height : size.get(id)!.width);
  const layerGap = horizontal ? LAYER_GAP.horizontal : LAYER_GAP.vertical;
  const siblingGap = horizontal ? SIBLING_GAP.horizontal : SIBLING_GAP.vertical;

  const depthOf = rows.map((row) => Math.max(...row.map(along)));
  const spreadOf = rows.map(
    (row) => row.reduce((sum, id) => sum + across(id), 0) + siblingGap * (row.length - 1),
  );
  const widest = Math.max(...spreadOf);
  const axis = ORIGIN + widest / 2;

  const placed = new Map<string, { x: number; y: number }>();
  const order = reversed ? [...rows.keys()].reverse() : [...rows.keys()];
  let cursor = ORIGIN;

  for (const index of order) {
    const row = rows[index]!;
    const rowDepth = depthOf[index]!;
    let offset = axis - spreadOf[index]! / 2;

    for (const id of row) {
      // Centred within the layer's depth, so a short box lines up with the
      // middle of a tall neighbour rather than with its top.
      const alongPos = cursor + (rowDepth - along(id)) / 2;
      const acrossPos = offset;
      placed.set(
        id,
        horizontal
          ? { x: snap(alongPos), y: snap(acrossPos) }
          : { x: snap(acrossPos), y: snap(alongPos) },
      );
      offset += across(id) + siblingGap;
    }

    cursor += rowDepth + layerGap;
  }

  return graph.nodes.map((node) => ({ ...byId.get(node.id)!, ...placed.get(node.id)! }));
}

/** To the canvas grid, so a tidied box nudges by whole steps like any other. */
function snap(value: number): number {
  return Math.round(value / 8) * 8;
}
