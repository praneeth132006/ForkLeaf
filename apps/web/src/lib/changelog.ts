/**
 * Reading `CHANGELOG.md` into the timeline shown at `/changelog`.
 *
 * The markdown file is the record — it is what a contributor edits and what
 * GitHub shows — and the page is a view of it, so the two cannot disagree. The
 * file is a list of `## ` sections, newest first, each one either
 * `Unreleased`, a bare date (`2026-09-29`) or a version and a date
 * (`1.0.0 — 2026-08-26`), and each holding `### ` entries with a short
 * description underneath.
 *
 * Pure: no file system here, so it is tested on strings. The page reads the
 * file and hands the text over.
 */

/** What kind of change an entry is, shown as a label on the timeline. */
export type ChangeKind = "new" | "fixed" | "security";

export interface ChangelogEntry {
  title: string;
  kind: ChangeKind;
  /** The description, as markdown. */
  body: string;
  /** Unique within the changelog, for linking to one entry. */
  slug: string;
}

export interface ChangelogRelease {
  /** The heading as written, e.g. `2026-09-29` or `1.0.0 — 2026-08-26`. */
  label: string;
  /** ISO date, or null for `Unreleased`. */
  date: string | null;
  version: string | null;
  /** Markdown between the section heading and its first entry. */
  intro: string;
  entries: ChangelogEntry[];
}

const DATE = /(\d{4}-\d{2}-\d{2})/;
const VERSION = /^v?(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/;

/** Fixes start with the word, as in "Fixed — renaming a folder …". */
function kindOf(title: string): ChangeKind {
  if (/^fixed\b/i.test(title)) return "fixed";
  if (/\bsecurity\b/i.test(title)) return "security";
  return "new";
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[`*_]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entry"
  );
}

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  const used = new Set<string>();
  let release: ChangelogRelease | null = null;
  let entry: { title: string; lines: string[] } | null = null;
  let intro: string[] = [];
  let fenced = false;

  const closeEntry = () => {
    if (!release || !entry) return;
    const base = slugify(`${release.date ?? "unreleased"}-${entry.title}`);
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    release.entries.push({
      title: entry.title,
      kind: kindOf(entry.title),
      body: entry.lines.join("\n").trim(),
      slug,
    });
    entry = null;
  };

  const closeRelease = () => {
    closeEntry();
    if (release) {
      release.intro = intro.join("\n").trim();
      releases.push(release);
    }
    release = null;
    intro = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    // A heading inside a code block is an example, not a section.
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;

    if (!fenced && line.startsWith("## ")) {
      closeRelease();
      const label = line.slice(3).trim();
      release = {
        label,
        date: label.match(DATE)?.[1] ?? null,
        version: label.match(VERSION)?.[1] ?? null,
        intro: "",
        entries: [],
      };
      continue;
    }

    if (!fenced && line.startsWith("### ") && release) {
      closeEntry();
      entry = { title: line.slice(4).trim(), lines: [] };
      continue;
    }

    if (entry) entry.lines.push(line);
    else if (release) intro.push(line);
    // Anything before the first section is the file's own preamble.
  }

  closeRelease();
  return releases;
}

/** "29 September 2026", in a fixed locale so server and client agree. */
export function formatChangelogDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
