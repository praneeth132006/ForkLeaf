import { dirname, normalizePath } from "./paths";

/**
 * Keeping a note's links working when the note moves.
 *
 * Images and attachments are referenced the portable way — by a path relative
 * to the note, `./assets/chart.png` — which is what makes a note render on
 * github.com and in every other markdown tool. The cost of that portability is
 * that the link's meaning depends on where the note sits: move the file one
 * folder across and `./assets/chart.png` now names a file that does not exist,
 * so every image in the note breaks at once, here and on GitHub.
 *
 * Moving a note therefore has to rewrite its relative links to keep pointing at
 * the same files. The images themselves stay where they are: they may be shared
 * with other notes, and rewriting a link is free where moving a file is another
 * commit that can fail halfway.
 */

/** True for a link that names a file in the repository rather than somewhere else. */
export function isRelativeLink(target: string): boolean {
  if (!target) return false;
  // A scheme, a protocol-relative URL, a root-relative path, a fragment or a
  // query is somebody else's business.
  return (
    !/^[a-z][a-z0-9+.-]*:/i.test(target) &&
    !target.startsWith("//") &&
    !target.startsWith("/") &&
    !target.startsWith("#") &&
    !target.startsWith("?")
  );
}

/** Resolves a link written in a note to the repository path it points at. */
export function resolveFromNote(notePath: string, target: string): string {
  return normalizePath(`${dirname(notePath)}/${decodePath(target)}`);
}

/**
 * `notes/2026/plan.md` + `assets/chart.png` → `../../assets/chart.png`.
 *
 * Relative rather than absolute because that is what works everywhere: a
 * leading-slash path resolves against the *site* root on GitHub Pages and
 * against nothing at all in an editor, while `../assets/chart.png` means the
 * same thing in every one of them.
 */
export function relativeFromNote(fromNotePath: string, toRepoPath: string): string {
  const from = normalizePath(dirname(fromNotePath)).split("/").filter(Boolean);
  const to = normalizePath(toRepoPath).split("/").filter(Boolean);

  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) {
    shared += 1;
  }

  const up = from.length - shared;
  const down = to.slice(shared);
  const steps = [...Array.from({ length: up }, () => ".."), ...down];

  // A file in the same folder needs the `./`, or a name containing a colon
  // would be read as a URL scheme.
  return up === 0 && down.length === 1 ? `./${steps.join("/")}` : steps.join("/");
}

/** A percent-decoded path, for a link written by a tool that encoded its spaces. */
function decodePath(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    // Not valid percent-encoding — a literal `%` in a filename. Take it as-is.
    return target;
  }
}

/**
 * A destination safe to sit inside `(…)`.
 *
 * A path with a space or a bracket in it ends the link early, and folder names
 * with spaces in them are entirely normal — `SOC 101/assets/shot.png`. Angle
 * brackets are markdown's own way of saying "all of this is the URL", and are
 * understood by GitHub, CommonMark and this app's own renderer alike.
 */
function encodeDestination(target: string): string {
  return /[\s()<>]/.test(target) ? `<${target.replace(/[<>]/g, encodeURIComponent)}>` : target;
}

/** Ranges of the document that are fenced code, where link syntax is just text. */
function fencedRanges(markdown: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fence = /^[ \t]*(`{3,}|~{3,})/gm;

  let open: { index: number; marker: string } | null = null;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(markdown)) !== null) {
    const marker = match[1]!;
    if (!open) {
      open = { index: match.index, marker: marker[0]! };
      continue;
    }
    // Only a fence of the same kind closes one; a ``` inside a ~~~ block is
    // content.
    if (marker[0] !== open.marker) continue;

    ranges.push([open.index, match.index + match[0].length]);
    open = null;
  }

  // An unclosed fence runs to the end of the document, which is how every
  // markdown parser reads it.
  if (open) ranges.push([open.index, markdown.length]);
  return ranges;
}

/**
 * Inline links and images: `[text](target)`, `![alt](target "title")`.
 *
 * The title is captured separately so it survives the rewrite untouched.
 */
const LINK =
  /(!?)\[((?:[^[\]\\]|\\.)*)\]\(\s*(<[^<>\n]*>|[^\s()]*)((?:\s+"[^"\n]*"|\s+'[^'\n]*')?)\s*\)/g;

/** Reference definitions: `[label]: target "title"`. */
const DEFINITION = /^([ \t]{0,3}\[(?:[^[\]\\]|\\.)+\]:[ \t]*)(<[^<>\n]*>|\S+)(.*)$/gm;

/**
 * Every relative link in a note, rewritten for the note's new home.
 *
 * The markdown is edited in place rather than parsed and re-printed: a round
 * trip through a formatter would rewrite bullet markers, emphasis characters
 * and line wrapping across the whole file, turning "moved a note" into a diff
 * nobody can review.
 */
export function rewriteRelativeLinks(markdown: string, fromPath: string, toPath: string): string {
  if (normalizePath(fromPath) === normalizePath(toPath)) return markdown;
  if (dirname(normalizePath(fromPath)) === dirname(normalizePath(toPath))) return markdown;

  const fenced = fencedRanges(markdown);
  const inFence = (index: number) => fenced.some(([start, end]) => index >= start && index < end);

  const moved = (target: string): string | null => {
    const bare = target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
    if (!isRelativeLink(bare)) return null;

    // A link into the note's own document — `#section` — has no path part.
    const hash = bare.indexOf("#");
    const path = hash === -1 ? bare : bare.slice(0, hash);
    const fragment = hash === -1 ? "" : bare.slice(hash);
    if (!path) return null;

    const repoPath = resolveFromNote(fromPath, path);
    if (!repoPath) return null;

    return encodeDestination(`${relativeFromNote(toPath, repoPath)}${fragment}`);
  };

  let result = markdown.replace(
    LINK,
    (whole, bang, text, target: string, title, offset: number) => {
      if (inFence(offset)) return whole;
      const next = moved(target);
      return next === null ? whole : `${bang}[${text}](${next}${title})`;
    },
  );

  result = result.replace(DEFINITION, (whole, head, target: string, tail, offset: number) => {
    if (inFence(offset)) return whole;
    const next = moved(target);
    return next === null ? whole : `${head}${next}${tail}`;
  });

  return result;
}

export interface LinkRepair {
  /** The note with its broken links repointed. */
  content: string;
  /** What moved, oldest form first, for telling the reader what happened. */
  fixed: { from: string; to: string }[];
  /** Links that point nowhere and could not be matched to a file. */
  unresolved: string[];
}

/**
 * Repairs links that point at files which are not there.
 *
 * Notes written before a move — or before this app committed images beside the
 * note that uses them — can hold paths that resolve to nothing: the file is in
 * the repository, at a different path, and the note has no way to know. Every
 * image in such a note renders as a broken box here and on github.com, which
 * looks like lost work even though nothing was lost.
 *
 * The repair is conservative on purpose. A link that already resolves is never
 * touched. A broken one is matched only by filename, and only when the match is
 * unambiguous — where several files share a name, the one sharing the most of
 * its path with the note wins, and a genuine tie is left alone for a person to
 * settle. Guessing wrongly here would silently point a note at somebody else's
 * screenshot, which is worse than the broken image it replaced.
 */
export function repairRelativeLinks(
  markdown: string,
  notePath: string,
  repoPaths: Iterable<string>,
): LinkRepair {
  const paths = [...repoPaths];
  const existing = new Set(paths.map((path) => normalizePath(path)));

  const byName = new Map<string, string[]>();
  for (const path of paths) {
    const name = path.split("/").pop() ?? path;
    byName.set(name, [...(byName.get(name) ?? []), normalizePath(path)]);
  }

  const fixed: { from: string; to: string }[] = [];
  const unresolved: string[] = [];

  const fenced = fencedRanges(markdown);
  const inFence = (index: number) => fenced.some(([start, end]) => index >= start && index < end);

  const repaired = (target: string): string | null => {
    const bare = target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
    if (!isRelativeLink(bare)) return null;

    const hash = bare.indexOf("#");
    const path = hash === -1 ? bare : bare.slice(0, hash);
    if (!path) return null;

    const resolved = resolveFromNote(notePath, path);
    if (existing.has(resolved)) return null;

    const name = decodePath(path).split("/").pop() ?? "";
    const candidates = byName.get(name) ?? [];

    if (candidates.length === 0) {
      unresolved.push(bare);
      return null;
    }

    const best = nearest(candidates, notePath);
    if (!best) {
      unresolved.push(bare);
      return null;
    }

    const next = relativeFromNote(notePath, best);
    fixed.push({ from: bare, to: next });
    return encodeDestination(hash === -1 ? next : `${next}${bare.slice(hash)}`);
  };

  let content = markdown.replace(
    LINK,
    (whole, bang, text, target: string, title, offset: number) => {
      if (inFence(offset)) return whole;
      const next = repaired(target);
      return next === null ? whole : `${bang}[${text}](${next}${title})`;
    },
  );

  content = content.replace(DEFINITION, (whole, head, target: string, tail, offset: number) => {
    if (inFence(offset)) return whole;
    const next = repaired(target);
    return next === null ? whole : `${head}${next}${tail}`;
  });

  return { content, fixed, unresolved };
}

/**
 * The candidate sharing the most of its path with the note, or null for a tie.
 *
 * "Nearest" is the only ordering that means anything here: a screenshot in the
 * folder you are writing in is far more likely to be the one you meant than a
 * file of the same name three projects away.
 */
function nearest(candidates: string[], notePath: string): string | null {
  const from = normalizePath(dirname(notePath)).split("/").filter(Boolean);

  const scored = candidates.map((path) => {
    const parts = path.split("/");
    let shared = 0;
    while (shared < from.length && shared < parts.length - 1 && from[shared] === parts[shared]) {
      shared += 1;
    }
    return { path, shared };
  });

  const best = Math.max(...scored.map((entry) => entry.shared));
  const winners = scored.filter((entry) => entry.shared === best);
  return winners.length === 1 ? winners[0]!.path : null;
}
