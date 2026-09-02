import { type NextRequest } from "next/server";
import { assertName, handle, requireClient } from "@/lib/api-helpers";

/**
 * The suggestions open on a notebook.
 *
 * Every open pull request on the repository, which for a notebook is what a
 * suggestion *is*: somebody read a published page, spotted a mistake, and sent
 * the fix back. Until now the only place to find out was github.com, which is
 * the one place the author of a notes app should not have to go.
 *
 * A list, not a review. What each one changes and what was said about it are
 * separate requests, made only for the one somebody opens.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;

    const owner = assertName(params.get("owner") ?? "", "owner");
    const repo = assertName(params.get("repo") ?? "", "repository");

    return { pulls: await client.listOpenPullRequests(owner, repo) };
  });
}
