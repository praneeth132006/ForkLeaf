import { createLinkResolver, extractWikilinks } from "@forkleaf/markdown-engine";
import { escapeHtml } from "./html";

/**
 * A book, grown into a garden.
 *
 * A book is read front to back; a garden is wandered. The difference is not
 * the pages, which are the same, but what each page says about the others:
 * which notes point here, and how the whole set hangs together. Both answers
 * come from the `[[wikilinks]]` the notes already contain, resolved exactly as
 * the editor resolves them, so the published garden and the notebook it came
 * from cannot disagree about what links to what.
 *
 * The map is drawn here, ahead of time, as a plain SVG. A published garden is
 * static files on GitHub Pages, and a graph that needs a script to lay itself
 * out is a graph that shows nothing until the script arrives — or ever, for a
 * reader with scripts off.
 */

/** What the garden needs to know about a note. */
export interface GardenNote {
  path: string;
  title: string;
  markdown: string;
}

/** Which notes link to which, by index into the list given. */
export interface GardenLinks {
  /** index → the indices it links to, in the order first written. */
  outgoing: number[][];
  /** index → the indices that link to it, in reading order. */
  backlinks: number[][];
}

/** Every link between the notes given, ignoring links to anything else. */
export function gardenLinks(notes: readonly GardenNote[]): GardenLinks {
  const resolve = createLinkResolver(notes);
  const indexOf = new Map(notes.map((note, index) => [note.path, index]));

  const outgoing = notes.map((note, from) => {
    const targets: number[] = [];

    for (const link of extractWikilinks(note.markdown)) {
      if (link.embed) continue;
      const found = resolve(link.target);
      const to = found ? indexOf.get(found.path) : undefined;
      if (to === undefined || to === from || targets.includes(to)) continue;
      targets.push(to);
    }

    return targets;
  });

  const backlinks = notes.map(() => [] as number[]);
  outgoing.forEach((targets, from) => {
    for (const to of targets) backlinks[to]!.push(from);
  });

  return { outgoing, backlinks };
}

/** A point on the map, in the SVG's own units. */
export interface GardenPoint {
  x: number;
  y: number;
}

/** The map's drawing area. Wide, because titles are written sideways. */
export const MAP_WIDTH = 720;
export const MAP_HEIGHT = 480;
const MARGIN = 48;

/**
 * Where each note sits on the map.
 *
 * A force layout — linked notes pull together, every pair pushes apart —
 * started from a circle and run a fixed number of steps. Deterministic on
 * purpose: no randomness, so publishing the same notes twice draws the same
 * map, and a republish does not show up in the repository as a page that
 * changed when nothing in it did.
 */
export function gardenLayout(count: number, outgoing: readonly number[][]): GardenPoint[] {
  if (count === 0) return [];
  if (count === 1) return [{ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }];

  const width = MAP_WIDTH - MARGIN * 2;
  const height = MAP_HEIGHT - MARGIN * 2;
  const ideal = Math.sqrt((width * height) / count);

  const points = Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return { x: Math.cos(angle) * width * 0.4, y: Math.sin(angle) * height * 0.4 };
  });

  const edges: [number, number][] = [];
  outgoing.forEach((targets, from) => {
    for (const to of targets)
      if (from < to || !outgoing[to]?.includes(from)) edges.push([from, to]);
  });

  const steps = 300;
  let temperature = width / 10;

  for (let step = 0; step < steps; step += 1) {
    const moves = points.map(() => ({ x: 0, y: 0 }));

    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        const dx = points[a]!.x - points[b]!.x;
        const dy = points[a]!.y - points[b]!.y;
        const distance = Math.max(0.01, Math.hypot(dx, dy));
        const push = (ideal * ideal) / distance;
        moves[a]!.x += (dx / distance) * push;
        moves[a]!.y += (dy / distance) * push;
        moves[b]!.x -= (dx / distance) * push;
        moves[b]!.y -= (dy / distance) * push;
      }
    }

    for (const [from, to] of edges) {
      const dx = points[from]!.x - points[to]!.x;
      const dy = points[from]!.y - points[to]!.y;
      const distance = Math.max(0.01, Math.hypot(dx, dy));
      const pull = (distance * distance) / ideal;
      moves[from]!.x -= (dx / distance) * pull;
      moves[from]!.y -= (dy / distance) * pull;
      moves[to]!.x += (dx / distance) * pull;
      moves[to]!.y += (dy / distance) * pull;
    }

    points.forEach((point, index) => {
      const move = moves[index]!;
      // A gentle pull to the middle keeps notes nothing links to from
      // drifting to the very edge and taking the scale of the map with them.
      move.x -= point.x * 0.05;
      move.y -= point.y * 0.05;

      const length = Math.max(0.01, Math.hypot(move.x, move.y));
      const limited = Math.min(length, temperature);
      point.x += (move.x / length) * limited;
      point.y += (move.y / length) * limited;
    });

    temperature = Math.max(0.5, temperature * 0.97);
  }

  // Fitted to the drawing area, keeping the proportions the layout found.
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const scale = Math.min(width / spanX, height / spanY);
  const offsetX = MARGIN + (width - spanX * scale) / 2;
  const offsetY = MARGIN + (height - spanY * scale) / 2;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return points.map((point) => ({
    x: round(offsetX + (point.x - minX) * scale),
    y: round(offsetY + (point.y - minY) * scale),
  }));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A title short enough to sit under a dot without colliding with the next. */
function shortTitle(title: string): string {
  return title.length > 28 ? `${title.slice(0, 27).trimEnd()}…` : title;
}

/**
 * The map, as an SVG every note on it links out of.
 *
 * Each note is an `<a>` around its dot and its name, so the map is a way into
 * the garden and not only a picture of it; the more notes point at one, the
 * larger its dot, which is the quickest way to see where a garden's centre is.
 */
export function gardenMapSvg(
  notes: readonly { title: string; href: string }[],
  links: GardenLinks,
): string {
  const points = gardenLayout(notes.length, links.outgoing);

  const lines: string[] = [];
  links.outgoing.forEach((targets, from) => {
    for (const to of targets) {
      const a = points[from]!;
      const b = points[to]!;
      lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    }
  });

  const nodes = notes.map((note, index) => {
    const point = points[index]!;
    const radius = Math.min(14, 5 + Math.sqrt(links.backlinks[index]!.length) * 3);
    const name = escapeHtml(note.title);

    return `<a href="${escapeHtml(note.href)}"><title>${name}</title><circle cx="${point.x}" cy="${point.y}" r="${round(radius)}"/><text x="${point.x}" y="${round(point.y + radius + 13)}">${escapeHtml(shortTitle(note.title))}</text></a>`;
  });

  return `<svg class="garden-map" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="How the notes link to each other">
<g class="garden-edges">${lines.join("")}</g>
<g class="garden-nodes">${nodes.join("\n")}</g>
</svg>`;
}

/** The styles the garden adds to a book. */
export const GARDEN_STYLES = `
/* ── Garden: the map and the links back ── */
.garden { margin: 3rem 0 0; }
.garden h2 { font-size: 1rem; margin: 0 0 0.75rem; }
.garden-map { width: 100%; height: auto; border: 1px solid var(--rule); border-radius: 12px; }
.garden-edges line { stroke: var(--muted); stroke-opacity: 0.45; stroke-width: 1; }
.garden-nodes circle { fill: var(--accent); }
.garden-nodes text {
  fill: var(--fg);
  font-size: 11px;
  text-anchor: middle;
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 3px;
}
.garden-nodes a:hover circle, .garden-nodes a:focus circle { fill: var(--fg); }
.garden-backlinks {
  max-width: 38rem;
  margin: 3rem 0 0;
  padding: 1rem 1.25rem;
  border: 1px solid var(--rule);
  border-radius: 10px;
}
.garden-backlinks h2 { font-size: 0.8125rem; margin: 0 0 0.5rem; color: var(--muted); font-weight: 600; }
.garden-backlinks ul { margin: 0; padding: 0; list-style: none; }
.garden-backlinks li { padding: 0.2rem 0; }
.garden-backlinks a { color: var(--accent); text-decoration: none; }
.garden-backlinks a:hover { text-decoration: underline; }
@media print { .garden-backlinks, .garden { display: none; } }
`;
