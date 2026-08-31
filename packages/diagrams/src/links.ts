/**
 * Diagram boxes that are notes.
 *
 * A diagram in a notebook is drawn to say how things relate — and then it is a
 * picture, so a box labelled "Deploy runbook" is a box, and the note called
 * Deploy runbook is somewhere else entirely. Writing a `[[wikilink]]` in the
 * label closes that gap: the box keeps its label and becomes the way to the
 * note, which turns the diagram editor from a drawing tool into a map of the
 * notebook that you can draw by hand.
 *
 * It stays plain text in the file. `A["[[Deploy runbook]]"]` is an ordinary
 * mermaid label, so the diagram still renders on github.com and in every other
 * mermaid tool — showing the brackets, exactly as a `[[wikilink]]` in prose
 * does there. Nothing bespoke is stored and nothing else has to understand it.
 *
 * Two halves, both pure. Before rendering, the links come out of the source
 * and the labels are left as the words somebody wrote; after rendering, the
 * nodes carrying those words are found in the SVG so a click can be caught.
 * The second half is DOM work and belongs to whoever has the document.
 */

/** The same dialect as a wikilink in prose: `target#anchor|alias`. */
const WIKILINK_RE = /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/g;

export interface DiagramLink {
  /** The text left in the diagram, which is what the box now reads. */
  label: string;
  target: string;
  anchor: string | null;
}

export interface LinkedDiagram {
  /** The source with each wikilink replaced by the words it displays. */
  code: string;
  links: DiagramLink[];
}

/**
 * Takes the wikilinks out of a diagram's source, leaving the labels behind.
 *
 * Mermaid has no idea what `[[…]]` means and would either render the brackets
 * or — inside an unquoted label — read them as one of its own shapes. So the
 * link is resolved away before mermaid ever sees the source, and what is left
 * is the text a reader wanted on the box.
 */
export function extractDiagramLinks(code: string): LinkedDiagram {
  const links: DiagramLink[] = [];

  const rewritten = code.replace(
    WIKILINK_RE,
    (whole, rawTarget: string, rawAnchor?: string, rawAlias?: string) => {
      const target = rawTarget.trim();
      if (!target) return whole;

      const anchor = rawAnchor?.trim() || null;
      const label = (rawAlias?.trim() || target).trim();
      if (!label) return whole;

      links.push({ label, target, anchor });
      return label;
    },
  );

  return { code: rewritten, links };
}

/** True when this diagram has nothing to link to, which is most of them. */
export function hasDiagramLinks(code: string): boolean {
  WIKILINK_RE.lastIndex = 0;
  return WIKILINK_RE.test(code);
}

/**
 * The words a rendered node is showing, normalised for comparison.
 *
 * Mermaid lays a long label out across several `<tspan>`s and may add its own
 * whitespace, so the text read back off the SVG is rarely the string that went
 * in character for character. Collapsing runs of whitespace is enough to match
 * them without pretending two different labels are the same.
 */
export function normalizeLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Marks the nodes of a rendered diagram that stand for notes.
 *
 * Matched on the label rather than on mermaid's element ids, deliberately.
 * The ids are an implementation detail that differs between diagram types and
 * changes between releases; the label is the thing the author wrote and the
 * thing the reader is looking at. Two boxes with the same words are the same
 * link, which is what anybody would expect them to be.
 *
 * Returns how many were marked, so a caller can tell "no links" from "links
 * that could not be found" — the second means mermaid drew something this does
 * not understand, and is worth not pretending about.
 */
export function markLinkedNodes(root: ParentNode, links: readonly DiagramLink[]): number {
  if (links.length === 0) return 0;

  const wanted = new Map(links.map((link) => [normalizeLabel(link.label), link]));
  let marked = 0;

  for (const node of root.querySelectorAll<SVGElement>("g.node, g.nodes > g, .nodeLabel")) {
    const element = node.closest<SVGElement>("g.node") ?? node;
    if (element.hasAttribute("data-fl-note")) continue;

    const link = wanted.get(normalizeLabel(element.textContent ?? ""));
    if (!link) continue;

    element.setAttribute("data-fl-note", link.target);
    if (link.anchor) element.setAttribute("data-fl-anchor", link.anchor);
    element.classList.add("fl-diagram-link");
    marked += 1;
  }

  return marked;
}
