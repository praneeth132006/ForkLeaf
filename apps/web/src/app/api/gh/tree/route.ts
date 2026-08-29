import { type NextRequest } from "next/server";
import { handle, requireClient, readRepoRef } from "@/lib/api-helpers";

/**
 * Returns the file tree for a workspace.
 *
 * The notebook by default — markdown and PDF — since a repository can hold a
 * great deal that is neither. `all=1` asks for every file, which is what the
 * link repair needs: it can only find the image a broken note meant if it can
 * see the images.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const include = params.get("all") === "1" ? "all" : "notes";

    return { tree: await client.listTree(repo, { include }) };
  });
}
