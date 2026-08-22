import { type NextRequest } from "next/server";
import { GitHubError } from "@forkleaf/github-client";
import { requireClient, readRepoRef, normalize, ApiError } from "@/lib/api-helpers";
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
export async function GET(request: NextRequest) {
  try {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const path = normalize(params.get("path") ?? "");
    if (!path) throw new ApiError(400, "validation", "A file path is required.");

    const type = imageTypeFor(path);
    if (!type) throw new ApiError(400, "validation", "That file is not a supported image.");

    const file = await client.readFileBase64(repo, path);
    if (!file) return new Response("Not found", { status: 404 });

    const bytes = Buffer.from(file.base64, "base64");

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.length),
        // Private to the browser that asked: the response was authorised by
        // that user's session and must never be held in a shared cache.
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        ETag: `"${file.sha}"`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return new Response(error.message, { status: error.status });
    }
    if (error instanceof GitHubError) {
      return new Response("Could not read that image.", { status: 502 });
    }
    console.error("[forkleaf] Raw asset error:", error);
    return new Response("Could not read that image.", { status: 500 });
  }
}
