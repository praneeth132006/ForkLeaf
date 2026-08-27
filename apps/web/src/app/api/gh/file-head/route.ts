import { type NextRequest } from "next/server";
import {
  handle,
  requireClient,
  ApiError,
  assertName,
  assertRef,
  normalize,
} from "@/lib/api-helpers";

/**
 * Where a file in a repository stands right now.
 *
 * Answers the one question a `[[repo:…]]` link needs: has this file changed
 * since the note described it? Only the newest commit touching the path is
 * read — the whole history would be a bigger, slower answer to a yes-or-no
 * question, and the panel asks this once per linked file.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;

    const owner = assertName(params.get("owner") ?? "", "owner");
    const repo = assertName(params.get("repo") ?? "", "repository");
    const branch = assertRef(params.get("branch") ?? "HEAD");
    const path = normalize(params.get("path") ?? "");

    if (!path) throw new ApiError(400, "validation", "A file path is required.");

    // `directory` is empty on purpose: a repository link names a path from the
    // repository root, not from wherever this workspace files its notes.
    const commits = await client.listFileCommits({ owner, repo, branch, directory: "" }, path, 1);
    const newest = commits[0];

    // A path GitHub has no commits for is a path that is not in the tree —
    // reported as absent rather than as an error, because a note linking a
    // file somebody deleted is exactly the case this exists to catch.
    if (!newest) return { exists: false, sha: null, committedAt: null };

    return { exists: true, sha: newest.sha, committedAt: newest.date ?? null };
  });
}
