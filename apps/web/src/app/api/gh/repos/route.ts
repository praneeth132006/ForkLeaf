import { type NextRequest } from "next/server";
import { ApiError, assertName, handle, requireClient } from "@/lib/api-helpers";

/**
 * Lists the repositories the signed-in user can write to — or describes one
 * named repository, whoever it belongs to.
 *
 * The second is for borrowing: reading somebody else's notebook needs to know
 * which branch it keeps its notes on, and that is a fact about their
 * repository rather than about this user's own list. Only what a public
 * repository already tells anybody who visits it; a private one they cannot
 * see answers exactly as GitHub does, which is "not found".
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;

    const owner = params.get("owner");
    const name = params.get("repo");

    if (owner || name) {
      if (!owner || !name) {
        throw new ApiError(400, "validation", "Both an owner and a repository are required.");
      }

      const found = await client.getRepo(
        assertName(owner, "repository owner"),
        assertName(name, "repository name"),
      );
      if (!found) throw new ApiError(404, "not-found", `${owner}/${name} could not be found.`);

      return { repo: found };
    }

    return { repos: await client.listRepos() };
  });
}
