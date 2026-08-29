import type { PdfOutlineItem } from "./types";

/**
 * The document's own table of contents.
 *
 * Worth having for the obvious reason — a 300-page specification is unusable
 * without one — and worth a file of its own for a less obvious one: a PDF
 * outline entry does not contain a page number. It contains a *destination*,
 * which is either a name that has to be looked up in the document's name tree,
 * or an explicit array whose first element is a reference to a page object.
 * Turning either into "page 47" needs the document, and can fail.
 *
 * This module is the pure half: the shape of the tree, the flattening, and
 * finding where a reader currently is in it. Resolving destinations to page
 * numbers is the caller's job, because only the caller has the document.
 */

/** An outline entry as pdf.js hands it over, before destinations are resolved. */
export interface RawOutlineItem {
  title?: unknown;
  dest?: unknown;
  items?: RawOutlineItem[] | null;
}

/**
 * Builds the outline, asking `pageFor` where each entry points.
 *
 * `pageFor` returns null for a destination that cannot be resolved, and that
 * is a normal outcome rather than an error: broken bookmarks are common in
 * documents assembled from several sources. The entry stays in the tree with
 * no page — it is still a heading, and dropping it would leave a hole in the
 * contents where a section used to be.
 */
export async function buildOutline(
  items: readonly RawOutlineItem[] | null | undefined,
  pageFor: (destination: unknown) => Promise<number | null>,
): Promise<PdfOutlineItem[]> {
  if (!items || items.length === 0) return [];

  const built: PdfOutlineItem[] = [];

  for (const item of items) {
    const title = typeof item.title === "string" ? item.title.replace(/\s+/g, " ").trim() : "";

    let page: number | null = null;
    try {
      page = item.dest == null ? null : await pageFor(item.dest);
    } catch {
      // A destination that throws is a broken bookmark, not a broken document.
      page = null;
    }

    built.push({
      title: title || "Untitled section",
      page,
      children: await buildOutline(item.items, pageFor),
    });
  }

  return built;
}

/** One row of a flattened outline, for rendering an indented list. */
export interface FlatOutlineItem extends PdfOutlineItem {
  depth: number;
  /** Path of indices from the root, which is a stable key and a stable id. */
  key: string;
}

/**
 * Flattens the outline for display, optionally hiding collapsed branches.
 *
 * Rendering a tree as a flat list rather than nested components is what lets
 * a 2,000-entry contents scroll at all — and `collapsed` is checked on the way
 * down, so a collapsed branch costs nothing rather than being rendered and
 * hidden.
 */
export function flattenOutline(
  items: readonly PdfOutlineItem[],
  collapsed: ReadonlySet<string> = new Set(),
): FlatOutlineItem[] {
  const rows: FlatOutlineItem[] = [];

  const walk = (nodes: readonly PdfOutlineItem[], depth: number, prefix: string) => {
    nodes.forEach((node, index) => {
      const key = prefix ? `${prefix}.${index}` : String(index);
      rows.push({ ...node, depth, key });
      if (!collapsed.has(key)) walk(node.children, depth + 1, key);
    });
  };

  walk(items, 0, "");
  return rows;
}

/**
 * The deepest outline entry at or before a page — where the reader is.
 *
 * Chosen by "last entry whose page is not after this one" rather than by an
 * exact match, because most pages are not the first page of a section. Ties go
 * to the deepest entry: on the page where a chapter and its first subsection
 * both begin, the subsection is the more useful answer.
 */
export function outlineEntryForPage(
  items: readonly PdfOutlineItem[],
  page: number,
): FlatOutlineItem | null {
  let best: FlatOutlineItem | null = null;

  for (const row of flattenOutline(items)) {
    if (row.page == null || row.page > page) continue;
    if (!best || row.page > best.page! || (row.page === best.page && row.depth > best.depth)) {
      best = row;
    }
  }

  return best;
}

/** Every entry key in the tree, for expanding or collapsing all of it. */
export function outlineKeys(items: readonly PdfOutlineItem[]): string[] {
  return flattenOutline(items)
    .filter((row) => row.children.length > 0)
    .map((row) => row.key);
}
