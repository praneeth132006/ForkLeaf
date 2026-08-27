import { type NextRequest } from "next/server";
import { GitHubError } from "@forkleaf/github-client";
import {
  requireClient,
  readRepoRef,
  normalize,
  ApiError,
  forgetDeadSession,
} from "@/lib/api-helpers";
import { imageTypeFor } from "@/lib/media";

/**
 * Serves an image out of the repository.
 *
 * Notes reference their images by repo-relative path, which is what makes them
 * render on github.com and in any other markdown tool. The browser cannot
 * resolve such a path on its own, and for a private repository it could not
 * fetch the file even if it could — the OAuth token lives on the server. So
 * this route is the bridge: same-origin URL in, image bytes out.
 *
 * Only image types are served. This proxy reads with the user's token, so
 * letting it return arbitrary file types would turn it into a way to render
 * repository content as HTML on our own origin.
 */
/**
 * Headers that must match on a 200 and a 304 alike, or the browser will not
 * reuse what it has.
 *
 * `max-age` is an hour rather than five minutes because the thing being cached
 * barely changes: an image in a note is written once under a name with a date
 * and a random tail, and is then read for as long as the note lives. An hour of
 * instant redraws costs at worst an hour of staleness on the rare occasion
 * somebody overwrites a file in place, and `stale-while-revalidate` keeps even
 * that from being a blank space — the old bytes are shown while the new ones
 * are fetched behind them.
 *
 * `private` because the response was authorised by one person's session and
 * must never sit in a shared cache.
 */
function cacheHeaders(etag: string): Record<string, string> {
  return {
    "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
    ETag: etag,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const path = normalize(params.get("path") ?? "");
    if (!path) throw new ApiError(400, "validation", "A file path is required.");

    const type = imageTypeFor(path);
    if (!type) throw new ApiError(400, "validation", "That file is not a supported image.");

    /**
     * The browser's own copy, offered back to GitHub before any bytes move.
     *
     * This route used to send an `ETag` and then ignore the `If-None-Match`
     * that came back with the next request, so the tag was decoration: every
     * image was fetched from GitHub in full, base64-decoded and sent down the
     * wire again, on every note open once the five-minute cache had lapsed. A
     * note with six screenshots was six API calls and several megabytes to
     * show something the browser already had.
     *
     * GitHub answers a conditional request with a bare 304, which is fast and
     * — the part that matters for a notebook full of images — does not count
     * against the hourly rate limit.
     */
    const known = request.headers.get("if-none-match");

    const file = await client.readFileBase64(repo, path, known ? { etag: known } : {});
    if (!file) return new Response("Not found", { status: 404 });

    if (file.notModified) {
      return new Response(null, { status: 304, headers: cacheHeaders(known!) });
    }

    const bytes = Buffer.from(file.base64, "base64");

    return new Response(new Uint8Array(bytes), {
      headers: {
        ...cacheHeaders(`"${file.sha}"`),
        "Content-Type": type,
        "Content-Length": String(bytes.length),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return new Response(error.message, { status: error.status });
    }
    if (error instanceof GitHubError) {
      /**
       * A dead token is not a broken image.
       *
       * This route is the one place a refused token shows up dozens of times
       * over — a note with nine screenshots is nine of these — and it used to
       * answer all nine with a 502, which the browser draws as the broken-image
       * icon and reports nowhere else. The note looked corrupted. It was not:
       * the sign-in behind it had ended.
       *
       * Ending the session here means the *next* thing the page asks for gets
       * "local mode" and the app can say so once, in words, rather than nine
       * times in pictures.
       */
      if (await forgetDeadSession(error)) {
        return new Response("Your GitHub sign-in has expired.", {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        });
      }
      return new Response("Could not read that image.", { status: 502 });
    }
    console.error("[forkleaf] Raw asset error:", error);
    return new Response("Could not read that image.", { status: 500 });
  }
}
