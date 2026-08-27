/**
 * Wikilinks that point at real files, not just at other notes.
 *
 * A notebook about your own work is full of prose describing code that exists
 * a directory away — "the scan script does X", "see the deploy playbook". The
 * note and the file drift apart silently, because nothing connects them: the
 * script gets rewritten and the paragraph explaining it stays exactly as
 * confident as it was the day it was true.
 *
 * So a link can name a file in a repository you own, and the note can be told
 * when that file has moved on since you wrote about it. That second half is
 * the point. A link that merely opens the file is a convenience; a link that
 * says "this changed after you described it" is the difference between notes
 * you trust and notes you have to re-check.
 *
 * The syntax stays plain markdown, and stays inside the wikilink the app
 * already has:
 *
 *   [[repo:scripts/scan.sh]]                  a file in this note's own repo
 *   [[repo:me/tools:scripts/scan.sh]]         a file in another repo
 *   [[repo:scripts/scan.sh@a1b2c3d]]          pinned to the revision you read
 *
 * On github.com those render as literal text rather than as anything clever,
 * which is the usual trade here: the note stays readable everywhere, and only
 * this app knows what to do with it.
 */

/** The scheme that marks a wikilink as naming a file rather than a note. */
export const REPO_SCHEME = "repo:";

export interface RepoTarget {
  /** Owner, or null when the link means "this note's own repository". */
  owner: string | null;
  /** Repository name, or null for the same reason. */
  repo: string | null;
  /** Path within the repository. Never empty. */
  path: string;
  /**
   * The commit this was linked at, when the author pinned one.
   *
   * Its absence is meaningful: an unpinned link is one nobody has checked, and
   * cannot be called stale — only unverified. Reporting those as fresh would
   * be a lie of exactly the kind this feature exists to stop.
   */
  ref: string | null;
}

/** True for a wikilink target naming a file in a repository. */
export function isRepoTarget(target: string): boolean {
  return target.trim().toLowerCase().startsWith(REPO_SCHEME);
}

/**
 * A repository or owner name GitHub would actually accept.
 *
 * The trailing guard is not decoration. Dots are legal in repository names, so
 * a bare `[A-Za-z0-9._-]+` happily matches `..` — which meant
 * `repo:../x/y:z.sh` parsed as owner `..`, and put a traversal segment into a
 * github.com URL. Requiring at least one character that is not a dot is what
 * closes that.
 */
const NAME = /^(?=.*[^.])[A-Za-z0-9._-]+$/;

/** A commit-ish: a short or full object name. */
const REF = /^[0-9a-fA-F]{7,40}$/;

/**
 * Reads `repo:…` into its parts, or null when it is not one we can use.
 *
 * Strict on purpose. Everything parsed here ends up interpolated into a GitHub
 * URL, and a target that is *nearly* a repository reference is far more likely
 * to be a typo than an instruction — resolving it loosely would mean opening
 * somebody else's repository because a slash was in the wrong place.
 */
export function parseRepoTarget(target: string): RepoTarget | null {
  const trimmed = target.trim();
  if (!isRepoTarget(trimmed)) return null;

  let rest = trimmed.slice(REPO_SCHEME.length).trim();
  if (!rest) return null;

  // The revision comes off the end first: a path cannot contain `@`, but a
  // ref that looked like a path segment would be swallowed by the split below.
  let ref: string | null = null;
  const at = rest.lastIndexOf("@");
  if (at > 0) {
    const candidate = rest.slice(at + 1).trim();
    if (REF.test(candidate)) {
      ref = candidate.toLowerCase();
      rest = rest.slice(0, at).trim();
    }
  }

  // A second colon means an explicit repository: `owner/name:path`.
  const colon = rest.indexOf(":");
  let owner: string | null = null;
  let repo: string | null = null;
  let path = rest;

  if (colon !== -1) {
    const [ownerName, name] = rest.slice(0, colon).split("/");
    path = rest.slice(colon + 1).trim();

    if (!ownerName || !name || !NAME.test(ownerName) || !NAME.test(name)) return null;
    owner = ownerName;
    repo = name;
  }

  path = path.replace(/^\/+/, "").trim();
  if (!path) return null;

  // No traversal, and nothing that would resolve outside the repository.
  if (path.split("/").some((segment) => segment === ".." || segment === "." || segment === "")) {
    return null;
  }

  return { owner, repo, path, ref };
}

/** Writes a target back out, so a re-pin round-trips through the same syntax. */
export function formatRepoTarget(target: RepoTarget): string {
  const repo = target.owner && target.repo ? `${target.owner}/${target.repo}:` : "";
  const ref = target.ref ? `@${target.ref}` : "";
  return `${REPO_SCHEME}${repo}${target.path}${ref}`;
}

/** The filename, which is what a link to a file should read as. */
export function repoTargetLabel(target: RepoTarget): string {
  return target.path.slice(target.path.lastIndexOf("/") + 1) || target.path;
}

/** Where the file lives on github.com, at the revision the link names. */
export function repoTargetUrl(
  target: RepoTarget,
  fallback: { owner: string; repo: string; branch: string },
): string {
  const owner = target.owner ?? fallback.owner;
  const repo = target.repo ?? fallback.repo;
  const ref = target.ref ?? fallback.branch;

  return `https://github.com/${owner}/${repo}/blob/${ref}/${target.path}`;
}

/** What a linked file is doing relative to the note that describes it. */
export type LinkFreshness =
  /** Pinned, and the file has not moved since. */
  | "current"
  /** Pinned, and the file has changed since — the note may be describing a ghost. */
  | "changed"
  /** Named, but never pinned, so nothing can be said about it honestly. */
  | "unverified"
  /** The path is not in the repository any more. */
  | "missing"
  /** The check itself failed; not a statement about the file. */
  | "unknown";

export interface LinkedFile {
  target: RepoTarget;
  /** The file's newest commit, when it could be read. */
  headRef: string | null;
  freshness: LinkFreshness;
}

/**
 * Compares a link's pinned revision against the file's current one.
 *
 * Short SHAs are compared by prefix, because that is how people write them and
 * a link pinned to `a1b2c3d` must not report itself changed the moment it is
 * compared against the full forty characters of the same commit.
 */
export function freshnessOf(
  target: RepoTarget,
  headRef: string | null,
  options: { exists?: boolean } = {},
): LinkFreshness {
  if (options.exists === false) return "missing";
  if (!headRef) return "unknown";
  if (!target.ref) return "unverified";

  const pinned = target.ref.toLowerCase();
  const head = headRef.toLowerCase();
  const shorter = Math.min(pinned.length, head.length);

  return pinned.slice(0, shorter) === head.slice(0, shorter) ? "current" : "changed";
}

/** Every repository file a note links to, in the order they are written. */
export function repoTargetsIn(targets: readonly string[]): RepoTarget[] {
  const seen = new Set<string>();
  const found: RepoTarget[] = [];

  for (const raw of targets) {
    const parsed = parseRepoTarget(raw);
    if (!parsed) continue;

    // One entry per file, whatever revision each mention pinned: the panel is
    // a list of files this note depends on, not a list of link occurrences.
    const key = `${parsed.owner ?? ""}/${parsed.repo ?? ""}/${parsed.path}`;
    if (seen.has(key)) continue;

    seen.add(key);
    found.push(parsed);
  }

  return found;
}

/**
 * Rewrites every link to one file so it points at the revision given.
 *
 * This is how a reader says "I have re-read the script, and the note is right
 * again" — the pin moves forward and the warning clears. It edits the note's
 * text, so it is deliberately narrow: only `[[…]]` spans whose target names
 * this exact file are touched, and the alias, anchor and embed marker are all
 * preserved. A looser find-and-replace would eventually eat a code sample
 * containing the same path.
 */
export function pinRepoLink(content: string, target: RepoTarget, sha: string): string {
  const wanted = `${target.owner ?? ""}/${target.repo ?? ""}/${target.path}`;
  const ref = sha.trim().toLowerCase();
  if (!REF.test(ref)) return content;

  return content.replace(
    /(!?)\[\[([^[\]|#\n]+)((?:#[^[\]|\n]*)?(?:\|[^[\]\n]*)?)\]\]/g,
    (whole, embed: string, rawTarget: string, tail: string) => {
      const parsed = parseRepoTarget(rawTarget);
      if (!parsed) return whole;

      const key = `${parsed.owner ?? ""}/${parsed.repo ?? ""}/${parsed.path}`;
      if (key !== wanted) return whole;

      return `${embed}[[${formatRepoTarget({ ...parsed, ref })}${tail}]]`;
    },
  );
}
