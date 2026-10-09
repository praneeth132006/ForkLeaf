import { dateStamp } from "@/lib/templates";

/**
 * Saving something from outside ForkLeaf into the notebook.
 *
 * Every way in — the phone's share sheet, a bookmarklet, the browser extension
 * — arrives as the same address: `/editor?save=1&url=…&title=…&text=…&kind=…`.
 * The share sheet's own spelling (`share_title`, `share_text`, `share_url`) is
 * read too, because that is what the manifest's share target sends.
 *
 * What lands is an ordinary note in `inbox/`, with the address, the site and
 * the date as properties. Nothing is fetched to make it: the words are the
 * ones the person chose to share, and the page stays where it is.
 *
 * An address like this can be put in a link by anybody, so this module only
 * *reads* one. Writing it is the editor's job, after the person has seen what
 * will be written and said yes.
 */

export const INBOX_FOLDER = "inbox";

export type SaveKind = "page" | "quote" | "image" | "link" | "highlight";

export interface SaveRequest {
  kind: SaveKind;
  url: string | null;
  title: string;
  text: string;
}

const LIMITS = { url: 2048, title: 300, text: 20_000 };
const KINDS: readonly SaveKind[] = ["page", "quote", "image", "link", "highlight"];

/** An http or https address, or null for anything else — `javascript:` included. */
export function safeUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text.length > LIMITS.url) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A control character other than tab, line feed and carriage return.
 *
 * Compared by code rather than written as a regular expression of escapes, so
 * the source file stays plain text.
 */
const isControl = (char: string) => {
  const code = char.charCodeAt(0);
  return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
};

/** Collapses runs of whitespace and strips control characters. */
function clean(value: string | null, limit: number, multiline: boolean): string {
  const text = [...(value ?? "")]
    .filter((char) => !isControl(char))
    .join("")
    .replace(/\r\n?/g, "\n");
  const shaped = multiline ? text.replace(/\n{3,}/g, "\n\n") : text.replace(/\s+/g, " ");
  return shaped.trim().slice(0, limit);
}

export function isSaveRequest(params: URLSearchParams): boolean {
  return (
    params.get("save") === "1" ||
    params.has("share_url") ||
    params.has("share_text") ||
    params.has("share_title")
  );
}

/**
 * What was asked to be saved, or null when there is nothing worth saving.
 *
 * Android's share sheet usually puts the link inside `text` rather than `url`,
 * sometimes after the page's title; the first address found there is taken as
 * the link and removed from the words.
 */
export function parseSaveRequest(params: URLSearchParams): SaveRequest | null {
  if (!isSaveRequest(params)) return null;

  let url = safeUrl(params.get("url") ?? params.get("share_url"));
  let text = clean(params.get("text") ?? params.get("share_text"), LIMITS.text, true);

  if (!url) {
    const found = /https?:\/\/[^\s<>"']+/.exec(text);
    if (found) {
      url = safeUrl(found[0]);
      if (url) text = text.replace(found[0], "").trim();
    }
  }

  const title = clean(params.get("title") ?? params.get("share_title"), LIMITS.title, false);
  if (!url && !text && !title) return null;

  const asked = params.get("kind") as SaveKind | null;
  const kind: SaveKind =
    asked && KINDS.includes(asked) ? asked : text && url ? "quote" : url && !text ? "link" : "page";

  // An image with no address to show is nothing at all, and a highlight is
  // kept with the page it was made on — without the page, there is nowhere to
  // keep it and nothing to show it on again.
  if ((kind === "image" || kind === "highlight") && !url) return null;
  if (kind === "highlight" && !text) return null;

  return { kind, url, title, text };
}

export function siteOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** A title for the note: the one given, the first line of the words, or the site. */
export function titleFor(request: SaveRequest): string {
  if (request.title) return request.title;
  const firstLine = request.text
    .split("\n")
    .find((line) => line.trim())
    ?.trim();
  if (firstLine) return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
  return siteOf(request.url) ?? "Saved";
}

/** Markdown's link syntax, with the characters that would break it escaped. */
const linkText = (text: string) => text.replace(/([[\]\\])/g, "\\$1");
/**
 * An address made safe to put between `(` and `)`.
 *
 * `encodeURIComponent` leaves parentheses alone — they are legal in a URL — so
 * an address ending in `)` closed the markdown link early and left the rest of
 * it as stray text. They are escaped by hand, and so is any whitespace `URL`
 * did not already encode.
 */
const linkTarget = (url: string) =>
  url.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

export function inboxNote(
  request: SaveRequest,
  now: Date,
): { title: string; content: string; frontmatter: Record<string, unknown> } {
  const title = titleFor(request);
  const site = siteOf(request.url);
  const lines: string[] = [];
  const source = request.url ? `[${linkText(title)}](${linkTarget(request.url)})` : null;

  switch (request.kind) {
    case "quote":
      lines.push(...request.text.split("\n").map((line) => (line ? `> ${line}` : ">")));
      if (source) lines.push("", `— ${source}`);
      break;
    case "highlight":
      if (source) lines.push(source, "");
      lines.push(highlightLine(request.text));
      break;
    case "image":
      lines.push(`![${linkText(title)}](${linkTarget(request.url!)})`);
      if (request.text) lines.push("", request.text);
      break;
    default:
      if (source) lines.push(source);
      if (request.text) lines.push(...(source ? [""] : []), request.text);
  }

  return {
    title,
    content: `${lines.join("\n")}\n`,
    frontmatter: {
      type: request.kind,
      ...(request.url ? { url: request.url } : {}),
      ...(site ? { site } : {}),
      saved: dateStamp(now),
    },
  };
}

/**
 * One highlight, as a line of its page's note.
 *
 * Written as `==marked==` text, which is how a highlight is spelled everywhere
 * else in ForkLeaf — so the passage comes back in spaced reading like any
 * other, with no separate list to keep. On one line, because a mark cannot
 * span a line break, and with any `==` inside it broken up so it cannot close
 * the mark early.
 */
export function highlightLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim().replace(/==/g, "= =");
  return `- ==${flat}==`;
}

/**
 * A page's highlights note with one more highlight on the end.
 *
 * The same words highlighted twice are kept once: going back to a page and
 * marking a passage that is already marked is not a second highlight.
 */
export function appendHighlight(markdown: string, text: string): string {
  const line = highlightLine(text);
  if (markdown.split("\n").some((existing) => existing.trim() === line)) return markdown;
  return `${markdown.replace(/\s*$/, "")}\n${line}\n`;
}

/** Every highlight in a page's highlights note, as plain words. */
export function highlightsIn(markdown: string): string[] {
  return [...markdown.matchAll(/^- ==(.+)==\s*$/gm)].map((match) => match[1]!.trim());
}

/** A note already saved from the same address as the same kind of thing. */
export function findSaved<T extends { path: string; frontmatter: Record<string, unknown> }>(
  notes: readonly T[],
  request: SaveRequest,
): T | null {
  if (!request.url || request.kind === "quote") return null;
  return (
    notes.find(
      (note) =>
        note.path.startsWith(`${INBOX_FOLDER}/`) &&
        note.frontmatter.url === request.url &&
        note.frontmatter.type === request.kind,
    ) ?? null
  );
}

/** The bookmarklet for this deployment: saves the page, and the selection as a quote. */
export function bookmarklet(origin: string): string {
  const target = JSON.stringify(`${origin}/save?save=1`);
  return (
    "javascript:(()=>{const s=String(getSelection()).trim();" +
    `window.open(${target}+'&kind='+(s?'quote':'page')+'&url='+encodeURIComponent(location.href)` +
    "+'&title='+encodeURIComponent(document.title)+'&text='+encodeURIComponent(s.slice(0,20000)),'_blank','noopener');})()"
  );
}
