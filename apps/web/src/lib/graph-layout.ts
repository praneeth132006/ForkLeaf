import type { LinkGraph } from "@forkleaf/markdown-engine";

/**
 * The notebook as a picture of its links.
 *
 * Two halves, both pure. `graphFrom` turns the link graph the backlinks panel
 * already builds into nodes and undirected edges, optionally cut down to the
 * neighbourhood of one note. `layoutGraph` places them with a force-directed
 * layout — linked notes pull together, every note pushes every other away —
 * written out here rather than taken from a library, because it is sixty lines
 * and deterministic: the same notebook draws the same picture every time,
 * which is what lets somebody learn where things are.
 */

export interface GraphNode {
  id: string;
  title: string;
  /** How many other notes it is linked with, either direction. */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface PlacedNode extends GraphNode {
  x: number;
  y: number;
}

export interface GraphOptions {
  /** Keep notes with no links at all. They are most of a young notebook. */
  includeOrphans?: boolean;
  /** Only the notes within `depth` links of this one. */
  focus?: string | null;
  depth?: number;
}

export function graphFrom(
  graph: LinkGraph,
  titleFor: (path: string) => string,
  options: GraphOptions = {},
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const adjacency = new Map<string, Set<string>>();
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const path of graph.outgoing.keys()) adjacency.set(path, new Set());

  for (const [from, refs] of graph.outgoing) {
    for (const ref of refs) {
      if (!ref.to || ref.to === from) continue;
      // One line between two notes, however many times and in whichever
      // direction they link to each other.
      const key = from < ref.to ? `${from}\n${ref.to}` : `${ref.to}\n${from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(
        from < ref.to ? { source: from, target: ref.to } : { source: ref.to, target: from },
      );
      if (!adjacency.has(ref.to)) adjacency.set(ref.to, new Set());
      adjacency.get(from)!.add(ref.to);
      adjacency.get(ref.to)!.add(from);
    }
  }

  let keep: Set<string>;
  if (options.focus && adjacency.has(options.focus)) {
    keep = new Set([options.focus]);
    let frontier = [options.focus];
    for (let hop = 0; hop < (options.depth ?? 2); hop += 1) {
      const next: string[] = [];
      for (const path of frontier) {
        for (const neighbour of adjacency.get(path) ?? []) {
          if (!keep.has(neighbour)) {
            keep.add(neighbour);
            next.push(neighbour);
          }
        }
      }
      frontier = next;
    }
  } else {
    keep = new Set(
      [...adjacency.entries()]
        .filter(([, neighbours]) => options.includeOrphans || neighbours.size > 0)
        .map(([path]) => path),
    );
  }

  const nodes = [...keep]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, title: titleFor(id), degree: adjacency.get(id)?.size ?? 0 }));

  return {
    nodes,
    edges: edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target)),
  };
}

export function layoutGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  size: { width: number; height: number },
  iterations = nodes.length > 400 ? 80 : 250,
): PlacedNode[] {
  const { width, height } = size;
  const count = nodes.length;
  if (count === 0) return [];

  const centreX = width / 2;
  const centreY = height / 2;
  if (count === 1) return [{ ...nodes[0]!, x: centreX, y: centreY }];

  // A sunflower spiral to start from: spread evenly, and the same every time.
  const golden = Math.PI * (3 - Math.sqrt(5));
  const radius = Math.min(width, height) * 0.45;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  nodes.forEach((_, i) => {
    const r = radius * Math.sqrt((i + 0.5) / count);
    xs[i] = centreX + r * Math.cos(i * golden);
    ys[i] = centreY + r * Math.sin(i * golden);
  });

  const index = new Map(nodes.map((node, i) => [node.id, i] as const));
  const links = edges
    .map((edge) => [index.get(edge.source), index.get(edge.target)] as const)
    .filter(
      (pair): pair is readonly [number, number] => pair[0] !== undefined && pair[1] !== undefined,
    );

  const k = Math.sqrt((width * height) / count) * 0.75;
  const dx = new Float64Array(count);
  const dy = new Float64Array(count);
  let temperature = Math.min(width, height) / 8;
  const cooling = temperature / (iterations + 1);
  const margin = 24;

  for (let step = 0; step < iterations; step += 1) {
    dx.fill(0);
    dy.fill(0);

    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        let ox = xs[i]! - xs[j]!;
        let oy = ys[i]! - ys[j]!;
        let distance = Math.hypot(ox, oy);
        if (distance < 0.01) {
          // Two notes in the same place push apart along a fixed direction
          // rather than a random one, so the result stays reproducible.
          ox = 0.01 * ((i % 3) - 1 || 1);
          oy = 0.01;
          distance = Math.hypot(ox, oy);
        }
        const force = (k * k) / distance;
        const fx = (ox / distance) * force;
        const fy = (oy / distance) * force;
        dx[i]! += fx;
        dy[i]! += fy;
        dx[j]! -= fx;
        dy[j]! -= fy;
      }
    }

    for (const [a, b] of links) {
      const ox = xs[a]! - xs[b]!;
      const oy = ys[a]! - ys[b]!;
      const distance = Math.max(Math.hypot(ox, oy), 0.01);
      const force = (distance * distance) / k;
      const fx = (ox / distance) * force;
      const fy = (oy / distance) * force;
      dx[a]! -= fx;
      dy[a]! -= fy;
      dx[b]! += fx;
      dy[b]! += fy;
    }

    for (let i = 0; i < count; i += 1) {
      // A gentle pull to the middle, so separate clusters do not drift off
      // to the walls and pin themselves there.
      dx[i]! += (centreX - xs[i]!) * 0.02 * k * 0.05;
      dy[i]! += (centreY - ys[i]!) * 0.02 * k * 0.05;

      const length = Math.hypot(dx[i]!, dy[i]!);
      if (length > 0) {
        const move = Math.min(length, temperature);
        xs[i] = xs[i]! + (dx[i]! / length) * move;
        ys[i] = ys[i]! + (dy[i]! / length) * move;
      }
      xs[i] = Math.min(width - margin, Math.max(margin, xs[i]!));
      ys[i] = Math.min(height - margin, Math.max(margin, ys[i]!));
    }

    temperature = Math.max(temperature - cooling, 0.5);
  }

  return nodes.map((node, i) => ({ ...node, x: xs[i]!, y: ys[i]! }));
}
