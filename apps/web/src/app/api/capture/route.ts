import { type NextRequest } from "next/server";
import { handle, requireClient, ApiError } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/safe-fetch";

/**
 * Reading a web page so a note can cite it, and finding a copy that outlives it.
 *
 * Two requests, deliberately in this order and both optional to the result: the
 * page itself, for its title, and archive.org, for a snapshot. A capture that
 * cannot reach the page still returns whatever the archive knows, and a capture
 * with no snapshot still returns the title — because a citation missing half of
 * its provenance is worth more than no citation.
 *
 * Every address is resolved and checked before it is fetched. See
 * `lib/safe-fetch` for why that is the whole game here.
 */

/** Long enough for a slow page, short enough not to hold a function open. */
const FETCH_TIMEOUT_MS = 10_000;

/** Only the head of the document is needed, and titles live at the top. */
const MAX_HTML_BYTES = 512 * 1024;

/** Redirect hops followed, each one re-checked before it is taken. */
const MAX_REDIRECTS = 5;

const RATE_LIMIT = { name: "capture", limit: 20, windowMs: 5 * 60_000 };

/**
 * Room for the archive request, which is the slow half.
 *
 * The default ceiling is shorter than Save Page Now takes, which would kill
 * the request mid-archive and report it to the reader as a network error.
 */
export const maxDuration = 60;

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
        // Identifying, and asking for the document rather than anything else.
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

/** The document's title, read out of at most the first chunk of it. */
async function readTitle(response: Response): Promise<string | null> {
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
      // Stop as soon as the head is complete; the body can be megabytes.
      if (/<\/head>/i.test(html) || /<title[^>]*>[^<]*<\/title>/i.test(html)) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) return null;

  return match[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .slice(0, 300);
}

interface Snapshot {
  archiveUrl: string | null;
  archivedAt: string | null;
}

/** How long to wait on Save Page Now before giving up on it. */
const ARCHIVE_TIMEOUT_MS = 25_000;

/**
 * Asks archive.org to take a snapshot now, and waits for it.
 *
 * Only reached when no snapshot exists, because that is the case where the
 * citation is worth nothing: an address, a timestamp, and a link that dies
 * with the page. Save Page Now is slow and rate limited, which is why it is
 * not the first thing tried — but a capture that ends with "no archived copy"
 * has not done the one job the feature exists for.
 *
 * Failure here is not an error. The capture still returns, and the citation
 * says plainly that nothing was archived.
 */
async function requestSnapshot(url: string): Promise<Snapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ARCHIVE_TIMEOUT_MS);

  try {
    await fetch(`https://web.archive.org/save/${url}`, {
      method: "GET",
      signal: controller.signal,
      headers: { "user-agent": "ForkLeaf/1.0 (+https://github.com/praneeth132006/ForkLeaf)" },
      redirect: "follow",
    });

    // Asked and answered separately: Save Page Now's own response body is not
    // a stable contract, while the availability API is.
    return await findSnapshot(url, controller.signal);
  } catch {
    return { archiveUrl: null, archivedAt: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The nearest snapshot archive.org already holds.
 *
 * Asked first because it is fast and usually enough. When it comes back empty
 * the caller asks for one to be made.
 */
async function findSnapshot(url: string, signal: AbortSignal): Promise<Snapshot> {
  try {
    const query = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const response = await fetch(query, { signal, headers: { accept: "application/json" } });
    if (!response.ok) return { archiveUrl: null, archivedAt: null };

    const body = (await response.json()) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } };
    };

    const closest = body.archived_snapshots?.closest;
    if (!closest?.available || !closest.url) return { archiveUrl: null, archivedAt: null };

    return {
      // The API answers with http:// even for pages archived over https.
      archiveUrl: closest.url.replace(/^http:\/\//, "https://"),
      archivedAt: parseWaybackTimestamp(closest.timestamp),
    };
  } catch {
    // The archive being down is not a reason to fail a capture.
    return { archiveUrl: null, archivedAt: null };
  }
}

/** `20260827100409` → an ISO timestamp, or null if it is not one. */
function parseWaybackTimestamp(stamp: string | undefined): string | null {
  if (!stamp || !/^\d{14}$/.test(stamp)) return null;

  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp)!;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;

  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    await requireClient();
    enforceRateLimit(request, RATE_LIMIT);

    const body = (await request.json().catch(() => null)) as {
      url?: unknown;
      want?: unknown;
    } | null;
    if (!body || typeof body.url !== "string") {
      throw new ApiError(400, "validation", "A web address is required.");
    }

    /**
     * Which half of the work to do.
     *
     * Both, by default, which is what this route always did. The dialog asks
     * for them separately because they take wildly different amounts of time:
     * reading a page is a second, and asking the Wayback Machine to make a
     * snapshot that does not exist yet can take most of a minute. Doing them
     * in one request meant pressing "Capture" and watching nothing happen for
     * forty seconds, which reads as broken however honest the eventual answer
     * is.
     */
    const want = body.want === "page" || body.want === "archive" ? body.want : "both";

    let url: URL;
    try {
      url = await assertPublicUrl(body.url);
    } catch (error) {
      throw new ApiError(
        400,
        "validation",
        error instanceof UnsafeUrlError ? error.message : "That address cannot be captured.",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      // Together: neither is worth failing the other over.
      const [page, existing] = await Promise.all([
        want === "archive"
          ? Promise.resolve(null)
          : fetchChecked(url, controller.signal)
              .then((response) => (response && response.ok ? readTitle(response) : null))
              .catch(() => null),
        want === "page"
          ? Promise.resolve({ archiveUrl: null, archivedAt: null })
          : findSnapshot(url.toString(), controller.signal),
      ]);

      // A citation whose archived copy does not exist is an address and a
      // timestamp — which is what the feature was supposed to improve on. So
      // when there is no snapshot, ask for one before giving up.
      const snapshot =
        want === "page" || existing.archiveUrl ? existing : await requestSnapshot(url.toString());

      return {
        url: url.toString(),
        title: page ?? url.hostname + url.pathname,
        capturedAt: new Date().toISOString(),
        ...snapshot,
        /** True when the page itself could not be read, only the archive. */
        titleFromUrl: page === null,
      };
    } finally {
      clearTimeout(timer);
    }
  });
}
