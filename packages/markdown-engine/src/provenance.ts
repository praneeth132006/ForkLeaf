/**
 * Where a quoted thing came from, written down so it survives the source.
 *
 * A note that cites a web page is a note with a hole in it waiting to open.
 * The page moves, the site is sold, the post is deleted — and what is left is
 * a claim with a dead link under it, which is worse than a claim with nothing
 * under it, because it looks like it has a source.
 *
 * So capturing a page records three things rather than one: the address, the
 * moment you read it, and an archived copy. The archive is the part that keeps
 * working. The other two are what let a reader judge whether the archived copy
 * is the thing you actually meant.
 *
 * Written as an ordinary blockquote, because a citation that only renders
 * inside one app is not a citation:
 *
 *   > **Source** — [The title](https://example.com/x)
 *   > Read 2026-08-27 10:04 UTC · [archived copy](https://web.archive.org/…)
 */

export interface CapturedSource {
  /** The page's own title, or the URL when it had none worth using. */
  title: string;
  url: string;
  /** ISO timestamp of when it was read. */
  capturedAt: string;
  /** A snapshot that outlives the page, when one could be had. */
  archiveUrl: string | null;
  /** When that snapshot was taken, which is not when you read the page. */
  archivedAt: string | null;
}

/** UTC, spelled out — a citation should not depend on the reader's locale. */
function stamp(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

/** Markdown link text with the characters that would break the link escaped. */
function escapeLabel(value: string): string {
  return value
    .replace(/([[\]])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The blockquote written into the note under a capture.
 *
 * Says plainly when there is no archived copy rather than omitting the line.
 * A citation that silently drops its most durable half would leave the reader
 * believing the page is safe when it is exactly as fragile as before.
 */
export function formatSource(source: CapturedSource): string {
  const title = escapeLabel(source.title || source.url);
  const read = stamp(source.capturedAt);

  const lines = [`> **Source** — [${title}](${source.url})`];

  const parts: string[] = [];
  if (read) parts.push(`Read ${read}`);

  if (source.archiveUrl) {
    const taken = source.archivedAt ? stamp(source.archivedAt) : null;
    parts.push(`[archived copy](${source.archiveUrl})${taken ? ` from ${taken}` : ""}`);
  } else {
    parts.push("no archived copy — this link may not outlive the page");
  }

  if (parts.length > 0) lines.push(`> ${parts.join(" · ")}`);

  return lines.join("\n");
}

/** One source a note cites, as read back out of its text. */
export interface CitedSource {
  title: string;
  url: string;
  /** True when the citation carries an archive link. */
  archived: boolean;
  /** Character offsets of the whole citation, for pointing at it. */
  start: number;
  end: number;
}

/**
 * The captured sources in a note.
 *
 * Matched on the `> **Source** —` opener this module writes rather than on any
 * link: a note is full of links, and only the ones captured with provenance
 * carry the promise that something was archived. Hand-written citations in the
 * same shape are read too, which is the point of using a plain format.
 */
export function sourcesIn(markdown: string): CitedSource[] {
  // The title allows escaped brackets, because `formatSource` writes them: a
  // naive `[^\]]*` stopped at the first `\]` and failed to match the citation
  // at all, silently losing every source with a bracket in its title.
  const re = /^> \*\*Source\*\* — \[((?:\\.|[^\][\\])*)\]\(([^)\s]+)\)[^\n]*(?:\n> ([^\n]*))?/gm;
  const found: CitedSource[] = [];

  for (const match of markdown.matchAll(re)) {
    if (match.index === undefined) continue;

    found.push({
      title: (match[1] ?? "").replace(/\\([[\]])/g, "$1"),
      url: match[2] ?? "",
      archived: /\[archived copy\]\(/.test(match[3] ?? ""),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return found;
}

/**
 * Whether a URL is one worth trying to capture.
 *
 * Only a shape check — the request itself is refused server-side, where the
 * host can actually be resolved. Doing it here too means the editor can grey
 * out the button instead of making a round trip to be told no.
 */
export function isCapturable(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    // Credentials in a URL are a sign of something that should not be fetched
    // on somebody's behalf, and would end up written into the note.
    if (parsed.username || parsed.password) return false;
    return parsed.hostname.includes(".") || parsed.hostname.endsWith("]");
  } catch {
    return false;
  }
}
