import { type NextRequest } from "next/server";
import { handle, ApiError } from "@/lib/api-helpers";
import { getSession } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/safe-fetch";

/**
 * What is on the other end of a link, in one line, for a hover card.
 *
 * A note is full of addresses, and an address is not a description: deciding
 * whether to follow `https://github.com/hmaverickadams/breach-parse` used to
 * mean following it. This reads the head of the document and answers with its
 * title and its own summary of itself, which is enough to decide from.
 *
 * Deliberately narrower than `/api/capture`, which this is not a second copy
 * of: no archiving, no snapshot lookup, a shorter timeout and a much smaller
 * read, because this fires on hover and has to be cheap.
 *
 * The picture a page offers of itself comes back as a link to `/api/link-image`
 * rather than as the address it actually lives at. The CSP would allow the
 * direct address — notes embed images from anywhere — so this is a deliberate
 * choice, not a workaround: an `<img>` pointing at the linked site would mean
 * the reader's browser connecting to it, with a referrer and an IP address,
 * merely because the pointer crossed a word in a note. Hovering a link should
 * not tell the other end that you did.
 *
 * Signed in only, and rate limited: it fetches an address the caller chose, so
 * it is exactly the shape of thing that gets pointed at somebody else's server
 * in bulk. Every address is resolved and checked first — see `lib/safe-fetch`.
 */

/** Short: a hover card that arrives late is a hover card nobody sees. */
const FETCH_TIMEOUT_MS = 6_000;

/** Titles and meta descriptions live at the top of the document. */
const MAX_HTML_BYTES = 128 * 1024;

/** Redirect hops followed, each one re-checked before it is taken. */
const MAX_REDIRECTS = 3;

/**
 * Generous, because a note being read is a note whose links are being hovered.
 * Answers are cached by the browser and by the client, so this is a ceiling on
 * distinct links, not on hovers.
 */
const RATE_LIMIT = { name: "link-preview", limit: 120, windowMs: 5 * 60_000 };

/**
 * Fetches a URL, re-checking the address at every redirect.
 *
 * `redirect: "manual"` rather than letting fetch follow them: a public URL
 * that 302s to `http://169.254.169.254` would otherwise sail straight past the
 * check that was the entire point of doing this server-side.
 */
async function fetchChecked(start: URL, signal: AbortSignal): Promise<Response | null> {
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(url, {
      signal,
      redirect: "manual",
      headers: {
        "user-agent": "ForkLeaf/1.0 (+https://github.com/praneeth132006/ForkLeaf)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    url = await assertPublicUrl(new URL(location, url).toString());
  }

  return null;
}

/** The head of an HTML document, and no more of it than that. */
async function readHead(response: Response): Promise<string | null> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("html")) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let html = "";

  try {
    while (html.length < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;

      html += decoder.decode(value, { stream: true });
      // The body can be megabytes and holds nothing this route wants.
      if (/<\/head>/i.test(html)) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return html;
}

/** Entities that appear in real titles. Not a parser, and does not need to be. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d{1,6});/g, (_whole, code: string) => String.fromCodePoint(Number(code)));
}

function tidy(text: string, limit: number): string | null {
  const cleaned = decodeEntities(text).replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, limit) : null;
}

/**
 * One `<meta>` value, by `name` or `property`, in whichever order they appear.
 *
 * Written as one pass over the tags rather than as an attribute-ordered
 * pattern: `<meta content="…" property="og:title">` is legal, common, and does
 * not match a pattern that expects the key first.
 */
function metaContent(head: string, keys: string[]): string | null {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));

  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!key || !wanted.has(key)) continue;

    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    const value = content ? tidy(content, 300) : null;
    if (value) return value;
  }

  return null;
}

export interface LinkPreview {
  url: string;
  /** The page's own name for itself; null when it could not be read. */
  title: string | null;
  /** Its own one-line summary, when it offers one. */
  description: string | null;
  /** Where it lives, which is the part that is always known. */
  host: string;
  /**
   * A same-origin URL for the page's own picture of itself, when it offers one.
   *
   * Always one of ours — never the address the image actually lives at. See
   * the note above: that distinction is the whole point.
   */
  image: string | null;
}

/**
 * Turns a page's advertised image into a URL of ours, or into nothing.
 *
 * Relative addresses are resolved against the page, because plenty of sites
 * write `og:image` as `/og/cover.png`. Anything that will not parse, or is not
 * http(s), is dropped here rather than sent to a route that would only refuse
 * it a moment later.
 */
function proxied(candidate: string | null, base: URL): string | null {
  if (!candidate) return null;

  let absolute: URL;
  try {
    absolute = new URL(candidate, base);
  } catch {
    return null;
  }

  if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return null;

  return `/api/link-image?url=${encodeURIComponent(absolute.toString())}`;
}

export async function GET(request: NextRequest) {
  return handle(async () => {
    // A session, not a GitHub client: nothing here talks to GitHub, and a
    // reader whose token has expired should still get hover cards.
    if (!(await getSession())) {
      throw new ApiError(401, "unauthorized", "Sign in to preview links.");
    }

    enforceRateLimit(request, RATE_LIMIT);

    const asked = new URL(request.url).searchParams.get("url") ?? "";
    if (!asked) throw new ApiError(400, "validation", "A web address is required.");

    let url: URL;
    try {
      url = await assertPublicUrl(asked);
    } catch (error) {
      throw new ApiError(
        400,
        "validation",
        error instanceof UnsafeUrlError ? error.message : "That address cannot be previewed.",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const head = await fetchChecked(url, controller.signal)
        .then((response) => (response && response.ok ? readHead(response) : null))
        .catch(() => null);

      // A page that could not be read is still worth a card: the host and the
      // path are what the reader is deciding from either way, and an empty
      // card would read as the feature being broken rather than as the page
      // being unreachable.
      const preview: LinkPreview = {
        url: url.toString(),
        title: head
          ? (metaContent(head, ["og:title", "twitter:title"]) ??
            tidy(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "", 200))
          : null,
        description: head
          ? metaContent(head, ["description", "og:description", "twitter:description"])
          : null,
        host: url.host,
        image: head ? proxied(metaContent(head, ["og:image", "twitter:image"]), url) : null,
      };

      return preview;
    } finally {
      clearTimeout(timer);
    }
  });
}
