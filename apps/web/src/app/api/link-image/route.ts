import { type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiError } from "@/lib/api-helpers";
import { assertPublicUrl } from "@/lib/safe-fetch";

/**
 * The picture a linked page offers of itself, served from our own origin.
 *
 * A hover card that says what a page is called is a decent answer to "is this
 * the right link"; seeing the page is a better one. What makes that awkward is
 * that the picture lives on the linked site, and putting its address straight
 * into an `<img>` would mean the reader's browser connecting there — with a
 * referrer and an IP address — merely because the pointer crossed a word in a
 * note. The CSP would permit it; that is not the objection. Hovering a link
 * should not tell the other end that you did.
 *
 * So the bytes come through here instead, exactly as repository images do:
 * one request from our server, and a same-origin image for the page. The
 * linked site sees this server, once, and never the reader.
 *
 * The address is resolved and checked before anything is fetched, the response
 * has to actually be a raster image, and it is capped — an image proxy that
 * will stream anything, at any size, is a bandwidth amplifier with a URL bar.
 */

/** Hover-speed: an image that arrives after the card is gone is wasted. */
const FETCH_TIMEOUT_MS = 6_000;

/** Bigger than any thumbnail needs to be, small enough to be harmless. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Redirect hops followed, each one re-checked before it is taken. */
const MAX_REDIRECTS = 3;

const RATE_LIMIT = { name: "link-image", limit: 120, windowMs: 5 * 60_000 };

/**
 * What may be served back.
 *
 * A closed list of raster formats. SVG is deliberately absent: it is a
 * document that can carry script, and serving one from our own origin is
 * precisely the hole this route otherwise closes.
 */
const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

async function fetchChecked(start: URL, signal: AbortSignal): Promise<Response | null> {
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(url, {
      signal,
      redirect: "manual",
      headers: {
        "user-agent": "ForkLeaf/1.0 (+https://github.com/praneeth132006/ForkLeaf)",
        accept: "image/*",
      },
    });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    url = await assertPublicUrl(new URL(location, url).toString());
  }

  return null;
}

/** Reads at most `MAX_BYTES`, and gives up rather than buffering more. */
async function readCapped(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      // A server that lies about content-length, or does not send one.
      if (total > MAX_BYTES) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }

  return bytes;
}

export async function GET(request: NextRequest) {
  try {
    // Plain responses rather than the JSON envelope: this route answers with
    // image bytes, and an `<img>` that gets JSON just shows a broken image.
    if (!(await getSession())) return new Response("Sign in required", { status: 401 });

    enforceRateLimit(request, RATE_LIMIT);

    const asked = new URL(request.url).searchParams.get("url") ?? "";
    if (!asked) throw new ApiError(400, "validation", "An image address is required.");

    const url = await assertPublicUrl(asked);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetchChecked(url, controller.signal);
      if (!response?.ok) return new Response("Not found", { status: 404 });

      const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
      if (!ALLOWED.has(type)) return new Response("Not an image", { status: 415 });

      const bytes = await readCapped(response);
      if (!bytes) return new Response("Too large", { status: 413 });

      // Copied into a plain ArrayBuffer, which is what `Response` accepts.
      return new Response(bytes.buffer.slice(0) as ArrayBuffer, {
        headers: {
          "Content-Type": type,
          "Content-Length": String(bytes.byteLength),
          // Private, because it was fetched for one signed-in reader; an hour,
          // because the same card is opened repeatedly while reading a note.
          "Cache-Control": "private, max-age=3600",
          // Belt and braces: these bytes came from somewhere else entirely.
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return new Response(error.message, { status: error.status });
    }
    // Anything else — an unreachable host, a refused address, a timeout — is
    // "there is no picture", which the card is built to survive.
    return new Response("Could not be fetched", { status: 400 });
  }
}
