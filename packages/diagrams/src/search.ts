import { mermaidToGraph } from "./graph-model";
import { mermaidToSequence } from "./sequence-model";
import { detectKind, type DiagramKind } from "./templates";

/**
 * Making the inside of a diagram findable.
 *
 * Everyone else in this space treats mermaid as an opaque blob of text. That
 * is why "which note has the box called RateLimiter?" is a question no diagram
 * tool can answer: full-text search over the note would match the mermaid
 * source by accident, and match `rateLimiter` the node id and `Rate limiter`
 * the label differently, and have no idea which diagram in the note it found.
 *
 * We parse the diagram, so the boxes are things rather than substrings. That
 * turns the diagram into another index alongside the note text, and it gives
 * `[[note#node]]` something real to point at: an anchor that names a box, not
 * a heading that happens to be spelled the same.
 */

export interface DiagramNodeRef {
  /** Which diagram in the note, counting fenced mermaid blocks from zero. */
  diagramIndex: number;
  kind: DiagramKind | null;
  /** The mermaid id, which is what a `#anchor` matches first. */
  id: string;
  label: string;
  /** "node" for a box, "participant" for a sequence lifeline. */
  role: "node" | "participant";
}

export interface DiagramIndexEntry extends DiagramNodeRef {
  /** Anchor text that addresses this node: the label where it is unique. */
  anchor: string;
}

/**
 * Every named thing inside one mermaid source.
 *
 * Ids and labels both, because both are how people refer to a box — the label
 * is what they read, the id is what they typed.
 */
export function diagramNodes(code: string, diagramIndex = 0): DiagramNodeRef[] {
  const kind = detectKind(code);

  if (kind === "sequence") {
    const diagram = mermaidToSequence(code);
    if (!diagram) return [];
    return diagram.participants.map((participant) => ({
      diagramIndex,
      kind,
      id: participant.id,
      label: participant.label,
      role: "participant" as const,
    }));
  }

  const graph = mermaidToGraph(code);
  if (!graph) return [];

  return (
    graph.nodes
      // Pseudo-states are punctuation, not things anyone searches for.
      .filter((node) => node.shape !== "start" && node.shape !== "end" && node.shape !== "fork")
      .map((node) => ({
        diagramIndex,
        kind,
        id: node.id,
        // A class or entity's label carries its members below the name; only the
        // name is what the box is called.
        label: node.label.split("\n")[0]!.trim(),
        role: "node" as const,
      }))
  );
}

/**
 * Normalises a node name the way an anchor is written.
 *
 * `Rate limiter`, `rate-limiter` and `RateLimiter` are the same box as far as
 * a link is concerned. Anything stricter and `[[api#Rate limiter]]` would
 * break the first time someone tidied the label's capitalisation.
 */
export function normalizeAnchor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Every node in every diagram of a note, ready to be searched or linked. */
export function indexDiagrams(sources: string[]): DiagramIndexEntry[] {
  const entries: DiagramIndexEntry[] = [];

  sources.forEach((code, diagramIndex) => {
    for (const node of diagramNodes(code, diagramIndex)) {
      entries.push({ ...node, anchor: node.label.trim() === "" ? node.id : node.label.trim() });
    }
  });

  return entries;
}

/**
 * Which box a `[[note#anchor]]` link means.
 *
 * The label is tried before the id, because the label is what a person writing
 * the link would have read off the picture. An ambiguous anchor resolves to
 * the first match in document order rather than to nothing: landing on one of
 * two boxes called "Queue" is more useful than a link that does not work.
 */
export function resolveDiagramAnchor(
  entries: DiagramIndexEntry[],
  anchor: string,
): DiagramIndexEntry | null {
  const wanted = normalizeAnchor(anchor);
  if (wanted === "") return null;

  return (
    entries.find((entry) => normalizeAnchor(entry.label) === wanted) ??
    entries.find((entry) => normalizeAnchor(entry.id) === wanted) ??
    null
  );
}

export interface DiagramSearchHit extends DiagramIndexEntry {
  /** Higher is better. Exact label match beats a prefix beats a substring. */
  score: number;
}

/**
 * Searches node labels and ids.
 *
 * Ranked rather than filtered, because "api" should put the box called `API`
 * above the one called `Api gateway health check`, and a flat filter cannot
 * express that.
 */
export function searchDiagramNodes(
  entries: DiagramIndexEntry[],
  query: string,
  limit = 20,
): DiagramSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];

  const hits: DiagramSearchHit[] = [];

  for (const entry of entries) {
    const label = entry.label.toLowerCase();
    const id = entry.id.toLowerCase();

    const score =
      label === needle || id === needle
        ? 100
        : label.startsWith(needle)
          ? 70
          : id.startsWith(needle)
            ? 60
            : label.includes(needle)
              ? 40
              : id.includes(needle)
                ? 30
                : 0;

    if (score > 0) hits.push({ ...entry, score });
  }

  return hits.sort((a, b) => b.score - a.score || a.label.length - b.label.length).slice(0, limit);
}
