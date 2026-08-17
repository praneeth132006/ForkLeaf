import { type NextRequest } from "next/server";
import { handle, requireClient, readRepoRef, normalize, ApiError } from "@/lib/api-helpers";

/** Reads one note's content and blob SHA. Returns `file: null` when missing. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const path = normalize(params.get("path") ?? "");
    if (!path) throw new ApiError(400, "validation", "A file path is required.");

    return { file: await client.readFile(repo, path) };
  });
}
