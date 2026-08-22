import { type NextRequest } from "next/server";
import { handle, readOwnerRepo, requireClient } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Forks a repository into the user's account.
 *
 * Needed before ForkLeaf can write to a project the user only has read access
 * to. The client waits for the fork to become usable, because GitHub creates it
 * asynchronously and an immediate commit would 404.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    // Forking creates a repository on someone's account; a loop here is
    // visible on their profile.
    enforceRateLimit(request, { name: "fork", limit: 10, windowMs: 60_000 });

    const { client, login } = await requireClient();

    const body = (await request.json().catch(() => ({}))) as { owner?: string; repo?: string };
    const { owner, repo } = readOwnerRepo(body);

    // Already forked in a previous session? Reuse it rather than making another.
    const existing = await client.getRepo(login, repo);
    if (existing?.canPush) return { repo: existing, created: false };

    return { repo: await client.forkRepo(owner, repo), created: true };
  });
}
