import { type NextRequest } from "next/server";
import { handle, requireClient, readRepoRef, ApiError } from "@/lib/api-helpers";

/**
 * The notebook as it stood on a given day.
 *
 * One route rather than two, because the two halves are useless apart: a tree
 * is read at a commit, and the commit is the thing being asked for. Returning
 * them together also makes the answer atomic — a tree from one commit beside a
 * date from another would be a notebook that never existed.
 *
 * A repository younger than the date asked for answers `commit: null` with an
 * empty tree, which is not an error. A notebook has a first day, and "there
 * was nothing here yet" is the true answer to what it looked like before it.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const until = params.get("until") ?? "";
    // Interpolated into the upstream URL, and a date is the only thing this
    // route has any business asking GitHub about.
    if (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/.test(until)) {
      throw new ApiError(400, "validation", "A date is required, as YYYY-MM-DD.");
    }

    // A bare date means the whole of that day. GitHub's `until` is inclusive
    // and would otherwise stop at midnight, so asking for "the 3rd" would show
    // the notebook as it was at the end of the 2nd — off by a day, silently,
    // which is the worst way for a time machine to be wrong.
    const moment = until.length === 10 ? `${until}T23:59:59Z` : until;

    const commit = await client.commitAt(repo, moment);
    if (!commit) return { commit: null, tree: [] };

    return { commit, tree: await client.listTree(repo, { ref: commit.sha }) };
  });
}
