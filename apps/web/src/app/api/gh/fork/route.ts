import { type NextRequest } from "next/server";
import { ApiError, handle, requireClient } from "@/lib/api-helpers";

/**
 * Forks a repository into the user's account.
 *
 * Needed before ForkLeaf can write to a project the user only has read access
 * to. The client waits for the fork to become usable, because GitHub creates it
 * asynchronously and an immediate commit would 404.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client, login } = await requireClient();

    const body = (await request.json().catch(() => ({}))) as { owner?: string; repo?: string };
    const owner = body.owner?.trim();
    const repo = body.repo?.trim();

    if (!owner || !repo) {
      throw new ApiError(400, "validation", "owner and repo are required");
    }

    // Already forked in a previous session? Reuse it rather than making another.
    const existing = await client.getRepo(login, repo);
    if (existing?.canPush) return { repo: existing, created: false };

    return { repo: await client.forkRepo(owner, repo), created: true };
  });
}
