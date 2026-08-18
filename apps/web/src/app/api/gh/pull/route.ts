import { type NextRequest } from "next/server";
import { ApiError, handle, requireClient } from "@/lib/api-helpers";

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

    const owner = body.owner?.trim();
    const repo = body.repo?.trim();
    const base = body.base?.trim();
    const head = body.head?.trim();
    const title = body.title?.trim();

    if (!owner || !repo || !base || !head || !title) {
      throw new ApiError(400, "validation", "owner, repo, base, head and title are all required");
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
