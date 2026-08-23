import { visit } from "unist-util-visit";
import type { Root as MdastRoot, Text as MdastText, PhrasingContent, Parent } from "mdast";
import { basename, isMarkdownPath, stripExtension } from "./paths";

/**
 * `[[wikilink]]` support — the syntax that turns a folder of markdown files
 * into a knowledge base.
 *
 * Deliberately the Obsidian dialect rather than an invention of our own:
 * `[[target]]`, `[[target|what to call it]]`, `[[target#heading]]`. Notes are
 * plain files in a git repository whose whole point is that other tools can
 * read them, so the link syntax has to be one those tools already understand.
 *
 * Nothing here resolves anything by itself. Extraction is pure text work, and
 * which note a target refers to is answered by `resolveWikilink` against a list
 * of candidates — because that answer depends on the workspace, which this
 * package knows nothing about.
 */

export interface WikiLink {
  /** The target exactly as written: `Roadmap`, `projects/roadmap`, `notes/a.md`. */
  target: string;
  /** The `#heading` part, without the hash. Null when the link has none. */
  anchor: string | null;
  /** What to display — the `|alias` if there is one, else the target. */
  label: string;
  /** Character offsets of the whole `[[…]]` span in the source. */
  start: number;
  end: number;
  /** True for `![[embed]]`, which references a note rather than linking to it. */
  embed: boolean;
}

/**
 * A note as far as link resolution is concerned.
 *
 * Only the two things a link can name. Keeping it this narrow means the graph
 * can be built from the dashboard's index entries, from stored notes, or from
 * a bare file listing, without any of them having to agree on a Note type.
 */
export interface LinkCandidate {
  path: string;
  title: string;
}

/**
 * `[[target]]`, `[[target|alias]]`, `[[target#anchor|alias]]`, `![[embed]]`.
 *
 * The target stops at `|` or `#` and cannot contain `[` or `]`, which is what
 * keeps a malformed `[[a]] b]]` from swallowing the rest of the paragraph.
 */
const WIKILINK_RE = /(!?)\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/g;

/**
 * Blanks out code so links inside it are not links.
 *
 * Replaced with spaces rather than removed, because every offset this module
 * reports has to point back into the original source — the editor uses them to
 * put the cursor on a link, and a shifted offset lands in the wrong place.
 *
 * Done as a text mask rather than by walking the mdast tree: `[[foo]]` has no
 * node type of its own, so it arrives as text that remark may or may not have
 * split at a `|`, and reassembling it is more fragile than masking the two
 * constructs it must not appear in.
 */
function maskCode(markdown: string): string {
  let masked = markdown;

  const blank = (match: string) => " ".repeat(match.length);

  // Fenced blocks first: an unmatched backtick inside one must not start an
  // inline span that eats the rest of the document.
  //
  // The opening line is consumed whole before the lazy body starts, or `$`
  // under the `m` flag matches at the end of the opening fence itself and the
  // block is never masked at all — the closing fence then reads as an opener.
  masked = masked.replace(
    /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm,
    blank,
  );
  masked = masked.replace(/(`+)(?:[^`]|(?!\1)`)*\1/g, blank);

  return masked;
}

/** Every `[[link]]` in a document, in source order, skipping code. */
export function extractWikilinks(markdown: string): WikiLink[] {
  const masked = maskCode(markdown);
  const links: WikiLink[] = [];

  for (const match of masked.matchAll(WIKILINK_RE)) {
    const target = (match[2] ?? "").trim();
    if (!target) continue;

    const anchor = match[3]?.trim() || null;
    const alias = match[4]?.trim();
    const start = match.index ?? 0;

    links.push({
      target,
      anchor,
      label: alias || (anchor ? `${target} § ${anchor}` : target),
      start,
      end: start + match[0].length,
      embed: match[1] === "!",
    });
  }

  return links;
}

/** Just the targets, deduplicated — what the link graph is built from. */
export function wikilinkTargets(markdown: string): string[] {
  return [...new Set(extractWikilinks(markdown).map((link) => link.target))];
}

/**
 * Normalises a target or path for comparison.
 *
 * Case and separators are levelled because a link is typed by a human and a
 * path is produced by a filesystem, and insisting the two match exactly makes
 * `[[Q3 Roadmap]]` fail to find `q3-roadmap.md` — which is the single most
 * common way a wikilink implementation feels broken.
 */
function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Finds the note a target names, or null.
 *
 * Tried in order of how specific each rule is, so an exact path always beats a
 * title that happens to look similar:
 *
 *   1. the literal path, with or without its extension
 *   2. the same, ignoring case and separator style
 *   3. the filename alone — `[[roadmap]]` finding `projects/roadmap.md`
 *   4. the note's title
 *
 * Ambiguity resolves to the shortest path, which is the one nearest the root
 * and, in practice, the one someone typing a bare name meant.
 */
export function resolveWikilink(
  target: string,
  candidates: readonly LinkCandidate[],
): LinkCandidate | null {
  const wanted = target.replace(/^\.?\//, "");
  const foldedTarget = fold(stripExtension(wanted));

  const rules: ((candidate: LinkCandidate) => boolean)[] = [
    (c) => c.path === wanted || stripExtension(c.path) === stripExtension(wanted),
    (c) => fold(stripExtension(c.path)) === foldedTarget,
    (c) => fold(stripExtension(basename(c.path))) === foldedTarget,
    (c) => fold(c.title) === foldedTarget,
  ];

  for (const matches of rules) {
    const hits = candidates.filter(matches);
    if (hits.length === 0) continue;
    if (hits.length === 1) return hits[0]!;

    // Two notes can share a filename. Prefer the one whose title matches too,
    // so `[[q3-roadmap]]` and `[[Q3 roadmap]]` land on the same note instead
    // of on whichever happens to sit nearer the repository root.
    const byTitle = hits.filter((candidate) => fold(candidate.title) === foldedTarget);
    const shortlist = byTitle.length > 0 ? byTitle : hits;

    return [...shortlist].sort(
      (a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path),
    )[0]!;
  }

  return null;
}

/**
 * The path a `[[target]]` should create if it does not exist yet.
 *
 * A link to a note nobody has written is not a mistake — it is the normal way
 * an outline gets built — so the editor offers to create it, and needs to know
 * where. Targets that already look like a path keep their folder; bare names
 * land beside the note that linked to them.
 */
export function wikilinkToPath(target: string, fromPath = ""): string {
  const cleaned = target.replace(/^\.?\//, "").trim();
  const withExt = isMarkdownPath(cleaned) ? cleaned : `${cleaned}.md`;

  if (withExt.includes("/")) return withExt;

  const folder = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  return folder ? `${folder}/${withExt}` : withExt;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** What a renderer needs to know to turn one link into an anchor. */
export interface ResolvedWikilink {
  href: string;
  /** False for a link to a note that does not exist — styled differently. */
  exists: boolean;
  /** Tooltip text, e.g. the full path. */
  title?: string;
}

export type WikilinkResolver = (link: WikiLink) => ResolvedWikilink | null;

/**
 * remark plugin: `[[target]]` in text becomes a real link node.
 *
 * Runs over text nodes, which means remark has already excluded code spans and
 * fenced blocks for us — the masking above is for the offset-reporting path,
 * this one gets that exclusion from the parser.
 *
 * Links are emitted with `data-wikilink` carrying the raw target, so the app
 * can intercept a click and open the note in a tab instead of navigating.
 */
export function remarkWikilink(options: { resolve?: WikilinkResolver } = {}) {
  return (tree: MdastRoot) => {
    visit(
      tree,
      "text",
      (node: MdastText, index: number | undefined, parent: Parent | undefined) => {
        if (!parent || index === undefined || !node.value.includes("[[")) return;
        // A wikilink inside a real markdown link would produce nested anchors,
        // which is invalid HTML and renders as a mess.
        if (parent.type === "link" || parent.type === "linkReference") return;

        const parts: PhrasingContent[] = [];
        let cursor = 0;

        for (const link of extractWikilinks(node.value)) {
          if (link.start > cursor) {
            parts.push({ type: "text", value: node.value.slice(cursor, link.start) });
          }

          const resolved = options.resolve?.(link) ?? null;

          parts.push({
            type: "link",
            url: resolved?.href ?? `#${encodeURIComponent(link.target)}`,
            title: resolved?.title ?? null,
            children: [{ type: "text", value: link.label }],
            data: {
              hProperties: {
                className: [
                  "fl-wikilink",
                  resolved?.exists === false ? "fl-wikilink-missing" : "fl-wikilink-found",
                ],
                // hast property names, which serialise to `data-wikilink`
                // and `data-wikilink-anchor`; the sanitiser matches on these.
                dataWikilink: link.target,
                ...(link.anchor ? { dataWikilinkAnchor: link.anchor } : {}),
              },
            },
          });

          cursor = link.end;
        }

        if (parts.length === 0) return;
        if (cursor < node.value.length) {
          parts.push({ type: "text", value: node.value.slice(cursor) });
        }

        parent.children.splice(index, 1, ...parts);
        return index + parts.length;
      },
    );
  };
}

// ─── The link graph ─────────────────────────────────────────────────────────

/** One end of a link, as the backlinks panel shows it. */
export interface LinkRef {
  /** Path of the note the link is written in. */
  from: string;
  /** Path of the note it points at, or null when nothing matched. */
  to: string | null;
  /** The target as typed, which is what an unresolved link has to show. */
  target: string;
  anchor: string | null;
  /** The line of `from` the link sits on, so the panel can quote it. */
  context: string;
}

export interface LinkGraph {
  /** path → the links written in that note. */
  outgoing: Map<string, LinkRef[]>;
  /** path → the links pointing at it from elsewhere. */
  backlinks: Map<string, LinkRef[]>;
  /** Targets that matched no note, most linked first — the "wanted" list. */
  unresolved: { target: string; from: string[] }[];
}

/** A document to index, as the graph builder sees it. */
export interface LinkSource extends LinkCandidate {
  content: string;
}

/**
 * Builds the whole link graph in one pass.
 *
 * Recomputed rather than maintained incrementally: the index is already
 * rebuilt whenever notes change, and a graph over a few thousand notes is a
 * few milliseconds of string work. An incremental version would need to track
 * which unresolved targets a newly created note now satisfies, which is the
 * kind of bookkeeping that quietly goes stale.
 */
export function buildLinkGraph(sources: readonly LinkSource[]): LinkGraph {
  const outgoing = new Map<string, LinkRef[]>();
  const backlinks = new Map<string, LinkRef[]>();
  const wanted = new Map<string, Set<string>>();

  for (const source of sources) {
    const refs: LinkRef[] = [];

    for (const link of extractWikilinks(source.content)) {
      if (link.embed) continue;

      const match = resolveWikilink(link.target, sources);
      const ref: LinkRef = {
        from: source.path,
        to: match?.path ?? null,
        target: link.target,
        anchor: link.anchor,
        context: lineAt(source.content, link.start),
      };

      refs.push(ref);

      if (ref.to && ref.to !== source.path) {
        const inbound = backlinks.get(ref.to) ?? [];
        inbound.push(ref);
        backlinks.set(ref.to, inbound);
      } else if (!ref.to) {
        const from = wanted.get(link.target) ?? new Set<string>();
        from.add(source.path);
        wanted.set(link.target, from);
      }
    }

    outgoing.set(source.path, refs);
  }

  const unresolved = [...wanted.entries()]
    .map(([target, from]) => ({ target, from: [...from].sort() }))
    .sort((a, b) => b.from.length - a.from.length || a.target.localeCompare(b.target));

  return { outgoing, backlinks, unresolved };
}

/** The whole source line an offset falls on, trimmed — the backlink's context. */
function lineAt(content: string, offset: number): string {
  const start = content.lastIndexOf("\n", offset - 1) + 1;
  const end = content.indexOf("\n", offset);
  return content.slice(start, end === -1 ? content.length : end).trim();
}
