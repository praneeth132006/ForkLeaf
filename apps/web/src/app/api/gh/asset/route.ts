import { type NextRequest } from "next/server";
import { handle, requireClient, readRepoRefFromBody, normalize, ApiError } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { imageTypeFor, MAX_IMAGE_BYTES } from "@/lib/media";

interface AssetBody {
  owner?: string;
  repo?: string;
  branch?: string;
  dir?: string;
  path?: string;
  /** The file's bytes, base64 encoded. No data: prefix. */
  content?: string;
  message?: string;
}

/**
 * Commits one image into the repository.
 *
 * Separate from `/api/gh/commit` because the two are not the same operation:
 * notes are queued, coalesced and squashed by the sync engine, while an image
 * has to exist at a known path *before* the markdown that references it is
 * worth writing. So this lands immediately, as its own commit, and hands back
 * the path the editor should link to.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    enforceRateLimit(request, { name: "asset", limit: 30, windowMs: 60_000 });

    const { client } = await requireClient();
    const body = (await request.json()) as AssetBody;
    const repo = readRepoRefFromBody(body as Record<string, unknown>);

    const path = normalize(body.path ?? "");
    if (!path) throw new ApiError(400, "validation", "An image path is required.");

    // The extension decides how this is served back, so an unsupported one is
    // rejected here rather than becoming a file nothing can render.
    if (!imageTypeFor(path)) {
      throw new ApiError(
        400,
        "validation",
        "Only PNG, JPEG, GIF, WebP, AVIF, BMP and ICO images can be uploaded.",
      );
    }

    const content = (body.content ?? "").replace(/\s/g, "");
    if (!content) throw new ApiError(400, "validation", "The image is empty.");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
      throw new ApiError(400, "validation", "The image is not valid base64.");
    }

    // Base64 carries 3 bytes in every 4 characters; no need to decode to know
    // whether it is over the limit.
    const bytes = Math.floor((content.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) {
      throw new ApiError(413, "validation", "That image is larger than 10 MB.");
    }

    const result = await client.commitChanges(
      repo,
      [{ op: "upsert", path, content, encoding: "base64" }],
      { message: body.message?.trim() || `add ${path}` },
    );

    return { path, sha: result.blobShas[path] ?? null, commit: result.sha };
  });
}
