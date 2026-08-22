import { type NextRequest } from "next/server";
import { ApiError, assertRef, handle, readOwnerRepo, requireClient } from "@/lib/api-helpers";
import { sanitizeBranchName } from "@/lib/branch-name";

/** Lists the branches of a repository, default first. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = request.nextUrl.searchParams;
    const { owner, repo } = readOwnerRepo({
      owner: params.get("owner"),
      repo: params.get("repo"),
    });

    return { branches: await client.listBranchSummaries(owner, repo) };
  });
}

/**
 * Creates a branch.
 *
 * Idempotent, mirroring the client: asking for a branch that already exists
 * returns it rather than failing, because starting work on a branch you began
 * earlier is the ordinary case, not an error.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();

    const body = (await request.json().catch(() => ({}))) as {
      owner?: string;
      repo?: string;
      name?: string;
      from?: string;
    };

    const { owner, repo } = readOwnerRepo(body);
    const name = sanitizeBranchName(body.name ?? "");
    const from = body.from?.trim();

    if (!name || !from) {
      throw new ApiError(400, "validation", "name and from are both required");
    }

    return {
      branch: await client.createBranch(owner, repo, name, assertRef(from, "source branch")),
    };
  });
}
