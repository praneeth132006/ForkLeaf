import { type NextRequest } from "next/server";
import { ApiError, handle, readRepoRef, requireClient } from "@/lib/api-helpers";

/**
 * What a notebook somebody follows has written since a moment.
 *
 * Two GitHub requests whatever the size of the repository: the commit current
 * at `since`, and the comparison of it with the branch now. Only Markdown
 * notes come back.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const since = params.get("since") ?? "";
    // An ISO date or date-time, nothing else: it is passed on to GitHub.
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z)?$/.test(since)) {
      throw new ApiError(400, "validation", "`since` must be an ISO date.");
    }

    return await client.changesSince(repo, since);
  });
}
