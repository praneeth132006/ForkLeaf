import { type NextRequest } from "next/server";
import { ApiError, assertRef, handle, readOwnerRepo, requireClient } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Opens a pull request for a set of changes.
 *
 * The interesting case is a repository the user cannot push to: someone wanting
 * to fix another project's documentation. There the route forks first, commits
 * to a branch on the fork, and opens the pull request across the two — which is
 * the whole "contribute without leaving the editor" flow, minus the part where
 * you clone anything.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    // Pull requests are visible to other people; opening them in a loop is
    // spam on someone else's project.
    enforceRateLimit(request, { name: "pull", limit: 10, windowMs: 60_000 });

    const { client, login } = await requireClient();

    const body = (await request.json().catch(() => ({}))) as {
      owner?: string;
      repo?: string;
      base?: string;
      head?: string;
      title?: string;
      description?: string;
      draft?: boolean;
    };

    const { owner, repo } = readOwnerRepo(body);
    const base = assertRef(body.base?.trim() ?? "", "base branch");
    const head = assertRef(body.head?.trim() ?? "", "head branch");
    const title = body.title?.trim();

    if (!title) {
      throw new ApiError(400, "validation", "A pull request title is required.");
    }

    // Pushing to your own branch and proposing it upstream are the same
    // request from the caller's side; only the qualified head differs.
    const upstream = await client.getRepo(owner, repo);
    const crossFork = upstream !== null && !upstream.canPush;

    const pull = await client.createPullRequest({
      owner,
      repo,
      base,
      head: crossFork ? `${login}:${head}` : head,
      title,
      ...(body.description ? { body: body.description } : {}),
      ...(body.draft ? { draft: true } : {}),
    });

    return { pull, crossFork };
  });
}
