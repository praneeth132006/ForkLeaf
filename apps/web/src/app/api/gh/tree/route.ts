import { type NextRequest } from "next/server";
import { handle, requireClient, readRepoRef } from "@/lib/api-helpers";

/** Returns the markdown file tree for a workspace. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const repo = readRepoRef(new URL(request.url).searchParams);

    return { tree: await client.listTree(repo) };
  });
}
