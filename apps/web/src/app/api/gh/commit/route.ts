import { type NextRequest } from "next/server";
import type { FileChange } from "@forkleaf/github-client";
import { handle, requireClient, readRepoRefFromBody, normalize, ApiError } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { imageTypeFor, MAX_IMAGE_BYTES } from "@/lib/media";

/**
 * Largest single note we will accept, to keep one bad paste from wedging a
 * repo — and to stay under what the host will carry in one request body, which
 * is the lower of the two limits and the one that used to be discovered only
 * as an unexplained 413 at push time.
 */
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_CHANGES_PER_COMMIT = 100;

interface CommitBody {
  owner?: string;
  repo?: string;
  branch?: string;
  dir?: string;
  message?: string;
  squashWindowMs?: number;
  changes?: {
    op?: string;
    path?: string;
    toPath?: string;
    content?: string;
    encoding?: string;
  }[];
}

/**
 * Writes a batch of changes as a single commit.
 *
 * This is the only route that mutates a repository, so validation is strict:
 * paths are normalised (no `..`, no leading slash), sizes are capped, and the
 * operation set is closed.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    // Writes are the expensive path: each one costs GitHub API calls and
    // rewrites a branch. 60 commits a minute is far above what typing produces
    // and far below what a stuck retry loop would.
    enforceRateLimit(request, { name: "commit", limit: 60, windowMs: 60_000 });

    const { client } = await requireClient();
    const body = (await request.json()) as CommitBody;

    const repo = readRepoRefFromBody(body as Record<string, unknown>);

    if (!Array.isArray(body.changes) || body.changes.length === 0) {
      throw new ApiError(400, "validation", "At least one change is required.");
    }
    if (body.changes.length > MAX_CHANGES_PER_COMMIT) {
      throw new ApiError(400, "validation", "Too many changes in one commit.");
    }

    const changes: FileChange[] = body.changes.map((change) => {
      const path = normalize(change.path ?? "");
      if (!path) throw new ApiError(400, "validation", "Every change needs a path.");

      switch (change.op) {
        case "delete":
          return { op: "delete", path };

        case "upsert": {
          const content = change.content ?? "";

          // An image travels through the same queue as a note, so it arrives
          // here too — as bytes rather than text.
          if (change.encoding === "base64") {
            assertImage(content, path);
            return { op: "upsert", path, content, encoding: "base64" };
          }

          assertSize(content, path);
          return { op: "upsert", path, content };
        }

        case "rename": {
          const toPath = normalize(change.toPath ?? "");
          if (!toPath) throw new ApiError(400, "validation", "A rename needs a destination.");
          const content = change.content ?? "";
          assertSize(content, path);
          return { op: "rename", path, toPath, content };
        }

        // A move sends no bytes: the commit reuses the blob already at `path`.
        // `normalize` on both ends is the whole validation there is to do, and
        // it is the validation that matters — these are the only two strings
        // that reach the git tree.
        case "move": {
          const toPath = normalize(change.toPath ?? "");
          if (!toPath) throw new ApiError(400, "validation", "A move needs a destination.");
          return { op: "move", path, toPath };
        }

        default:
          throw new ApiError(400, "validation", `Unsupported operation: ${change.op}`);
      }
    });

    const result = await client.commitChanges(repo, changes, {
      message: body.message?.trim() || "update notes",
      // Clamped: an unbounded window from the client could rewrite older
      // history than intended.
      squashWindowMs: Math.min(Math.max(body.squashWindowMs ?? 0, 0), 30 * 60_000),
    });

    return result;
  });
}

/**
 * Checks an image the same way the single-image route always has.
 *
 * The extension decides how the file is served back, so an unsupported one is
 * refused here rather than becoming a file nothing can render — and base64 is
 * verified as base64 before it is handed to GitHub.
 */
function assertImage(content: string, path: string): void {
  if (!imageTypeFor(path)) {
    throw new ApiError(
      400,
      "validation",
      "Only PNG, JPEG, GIF, WebP, AVIF, BMP and ICO images can be uploaded.",
    );
  }

  const packed = content.replace(/\s/g, "");
  if (!packed) throw new ApiError(400, "validation", "The image is empty.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(packed)) {
    throw new ApiError(400, "validation", "The image is not valid base64.");
  }

  // Base64 carries three bytes in every four characters; no need to decode to
  // know whether it is over the limit.
  if (Math.floor((packed.length * 3) / 4) > MAX_IMAGE_BYTES) {
    throw new ApiError(413, "too-large", `${path} is larger than 3 MB.`);
  }
}

function assertSize(content: string, path: string): void {
  // Byte length, not character count — a note full of emoji is larger than it looks.
  if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) {
    throw new ApiError(413, "too-large", `${path} is too large to save (limit 3 MB).`);
  }
}
