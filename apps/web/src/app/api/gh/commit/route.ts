import { type NextRequest } from "next/server";
import type { FileChange } from "@forkleaf/github-client";
import { handle, requireClient, readRepoRefFromBody, normalize, ApiError } from "@/lib/api-helpers";

/** Largest single note we will accept, to keep one bad paste from wedging a repo. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
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

function assertSize(content: string, path: string): void {
  // Byte length, not character count — a note full of emoji is larger than it looks.
  if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) {
    throw new ApiError(413, "validation", `${path} is too large to save (limit 5 MB).`);
  }
}
