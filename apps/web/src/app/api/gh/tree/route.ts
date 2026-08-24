import { type NextRequest } from "next/server";
import { handle, requireClient, readRepoRef } from "@/lib/api-helpers";

/**
 * Returns the file tree for a workspace.
 *
 * Markdown only by default — that is the notebook, and a repository can hold a
 * great deal that is not one. `all=1` asks for every file, which is what the
 * link repair needs: it can only find the image a broken note meant if it can
 * see the images.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const markdownOnly = params.get("all") !== "1";

    return { tree: await client.listTree(repo, { markdownOnly }) };
  });
}
