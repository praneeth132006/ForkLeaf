import { handle, requireClient } from "@/lib/api-helpers";

/** Lists the repositories the signed-in user can write to. */
export async function GET() {
  return handle(async () => {
    const { client } = await requireClient();
    return { repos: await client.listRepos() };
  });
}
