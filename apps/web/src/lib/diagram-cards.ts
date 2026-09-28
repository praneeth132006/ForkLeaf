import { mermaidToGraph } from "@forkleaf/diagrams";

/**
 * Flashcards from the diagrams in a note.
 *
 * A flowchart is a set of facts in a form that is easy to look at and hard to
 * recall: which step follows which, what a decision leads to. Each arrow is
 * already a question — "after this, what?" — and its target the answer. So a
 * note tagged `flashcards` gets a card for every step in its flowcharts and
 * state diagrams, and for every branch of its mind maps, without anybody
 * writing them.
 *
 * Several arrows out of the same box under the same label are one card with
 * every target in the answer, because "what comes after 'Review'?" has one
 * honest answer and it may be two boxes.
 */

export interface DiagramCard {
  question: string;
  answer: string;
  /** 0-based line of the diagram's opening fence. */
  line: number;
  /** Stable across edits to the layout: the diagram's name, the box and the arrow's label. */
  key: string;
}

const FENCE = /^\s*(```|~~~)\s*(\S*)/;
const HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;

/** A label as it reads: Mermaid's quotes and markup off. */
function plain(label: string): string {
  return label
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function diagramCards(content: string, noteTitle: string): DiagramCard[] {
  const cards: DiagramCard[] = [];
  const lines = content.split("\n");
  let heading = noteTitle;
  let open: { fence: string; mermaid: boolean; start: number; body: string[] } | null = null;

  lines.forEach((line, index) => {
    const fence = FENCE.exec(line);
    if (open) {
      if (fence && fence[1] === open.fence && !fence[2]) {
        if (open.mermaid) cards.push(...cardsFor(open.body.join("\n"), heading, open.start));
        open = null;
      } else open.body.push(line);
      return;
    }
    if (fence) {
      open = {
        fence: fence[1]!,
        mermaid: fence[2]!.toLowerCase() === "mermaid",
        start: index,
        body: [],
      };
      return;
    }
    const title = HEADING.exec(line);
    if (title) heading = plain(title[1]!);
  });
  return cards;
}

function cardsFor(source: string, name: string, line: number): DiagramCard[] {
  const graph = mermaidToGraph(source);
  if (!graph || graph.edges.length === 0) return [];
  // A state diagram's `[*]` is a start or an end, and has no label of its own.
  const labels = new Map(
    graph.nodes.map((node) => [
      node.id,
      plain(node.label) ||
        (node.shape === "start" ? "the start" : node.shape === "end" ? "the end" : node.id),
    ]),
  );

  if (graph.kind === "mindmap") {
    const children = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const list = children.get(edge.from) ?? [];
      list.push(labels.get(edge.to) ?? edge.to);
      children.set(edge.from, list);
    }
    return [...children.entries()].map(([from, list]) => {
      const box = labels.get(from) ?? from;
      return {
        question: `${name}: what branches from “${box}”?`,
        answer: list.join(", "),
        line,
        key: `diagram:${name}:${box}`,
      };
    });
  }

  if (graph.kind !== "flowchart" && graph.kind !== "state") return [];

  const grouped = new Map<string, { from: string; via: string; targets: string[] }>();
  for (const edge of graph.edges) {
    const from = labels.get(edge.from) ?? edge.from;
    const via = plain(edge.label ?? "");
    const id = `${from}\n${via}`;
    const entry = grouped.get(id) ?? { from, via, targets: [] };
    const target = labels.get(edge.to) ?? edge.to;
    if (!entry.targets.includes(target)) entry.targets.push(target);
    grouped.set(id, entry);
  }

  return [...grouped.values()]
    .filter((entry) => entry.from && entry.targets.length > 0)
    .map((entry) => ({
      question: entry.via
        ? `${name}: from “${entry.from}”, what does “${entry.via}” lead to?`
        : `${name}: what comes after “${entry.from}”?`,
      answer: entry.targets.join(", "),
      line,
      key: `diagram:${name}:${entry.from}:${entry.via}`,
    }));
}
