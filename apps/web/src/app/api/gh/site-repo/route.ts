import { type NextRequest } from "next/server";
import { handle, requireClient, ApiError, assertName } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Creates the public repository a private notebook publishes into.
 *
 * The alternative was telling somebody with a private notebook to go to
 * github.com, make a repository, come back, and type its name — four steps
 * outside the app to work around a limit they did not choose. GitHub will not
 * serve Pages from a private repository on a free plan, and nothing here can
 * change that; what it can do is make the way around it one click.
 *
 * Always public, and not negotiable through the request: a private target
 * would hit exactly the same wall, so creating one would be building the
 * problem again with an extra step.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client, login } = await requireClient();
    enforceRateLimit(request, { name: "site-repo", limit: 5, windowMs: 10 * 60_000 });

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = assertName(String(body?.name ?? ""), "repository name");

    const existing = await client.getRepo(login, name);
    if (existing) {
      // Reusing one the reader already has beats refusing, but a private one
      // cannot serve pages — saying which is the difference between a fix and
      // a second dead end.
      if (existing.private) {
        throw new ApiError(
          409,
          "conflict",
          `${login}/${name} already exists and is private, so GitHub will not serve pages from it either. Pick another name, or make that repository public on GitHub.`,
        );
      }

      return { owner: existing.owner, repo: existing.name, created: false };
    }

    const created = await client.createRepo({
      name,
      description: "Pages published from my ForkLeaf notes",
      private: false,
    });

    return { owner: created.owner, repo: created.name, created: true };
  });
}
