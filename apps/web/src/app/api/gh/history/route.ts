import { type NextRequest } from "next/server";
import { handle, requireClient, readRepoRef, normalize, ApiError } from "@/lib/api-helpers";

/**
 * The commit history of one note.
 *
 * Exists so history can be read inside ForkLeaf instead of sending the reader
 * out to github.com. Pass `sha` as well to get that revision's content back,
 * which is what powers the preview in the history panel.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const path = normalize(params.get("path") ?? "");
    if (!path) throw new ApiError(400, "validation", "A file path is required.");

    const sha = params.get("sha");
    if (sha) {
      // Constrained to a hex object name: this value is interpolated into the
      // upstream URL, so anything else has no business reaching GitHub.
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
        throw new ApiError(400, "validation", "That is not a valid commit SHA.");
      }

      // `files` asks what else that commit touched, which is what turns a date
      // on a paragraph into a memory of what you were working on.
      if (params.get("files") === "1") {
        return await client.getCommitFiles(repo, sha);
      }

      return { content: await client.readFileAtCommit(repo, path, sha) };
    }

    // Blame needs a longer window than a commit list does: every revision it
    // cannot see becomes a line it has to describe as "at or before". Clamped
    // at both ends, since it reaches GitHub as a page size.
    // `Number(null)` is 0, not NaN, so an absent parameter has to be checked
    // for rather than parsed — otherwise omitting it clamps history to one
    // commit instead of leaving the default alone.
    const raw = params.get("limit");
    const requested = raw === null ? Number.NaN : Number(raw);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 30;

    return { commits: await client.listFileCommits(repo, path, limit) };
  });
}
