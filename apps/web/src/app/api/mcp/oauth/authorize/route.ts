import { type NextRequest } from "next/server";
import { ApiError, assertName, handle, normalize, requireClient } from "@/lib/api-helpers";
import { appUrl } from "@/lib/app-url";
import { openClient, sealPending } from "@/lib/mcp-grants";
import { readAuthorizeRequest } from "@/lib/mcp-oauth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createOAuthState, githubOAuthConfigured, setMcpPending } from "@/lib/session";

/**
 * "Allow" on the consent page.
 *
 * Checks the assistant's request again — the page is not trusted to have done
 * it — and that the signed-in person can use the repository they chose, then
 * sends them through GitHub for a grant of the assistant's own. Its own,
 * because GitHub refresh tokens are single use: sharing this browser's would
 * mean whichever of the two renewed first signed the other out.
 */

const BRANCH = /^(?!.*\.\.)[\w][\w./-]{0,254}$/;

export async function POST(request: NextRequest) {
  return handle(async () => {
    const { client, login } = await requireClient();
    enforceRateLimit(request, { name: "mcp-authorize", limit: 10, windowMs: 60_000 });

    if (!githubOAuthConfigured()) {
      throw new ApiError(503, "unavailable", "This ForkLeaf is not set up for GitHub sign-in.");
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = readAuthorizeRequest(
      new URLSearchParams(typeof body?.query === "string" ? body.query : ""),
    );
    if (!parsed.ok) throw new ApiError(400, "validation", parsed.error);

    const registered = await openClient(parsed.value.clientId);
    if (!registered || !registered.redirectUris.includes(parsed.value.redirectUri)) {
      throw new ApiError(
        400,
        "validation",
        "This sign-in request is not valid any more. Start connecting again from your assistant.",
      );
    }

    const owner = assertName(String(body?.owner ?? ""), "owner");
    const name = assertName(String(body?.repo ?? ""), "repository");
    const repo = await client.getRepo(owner, name);
    if (!repo) throw new ApiError(404, "not_found", `${owner}/${name} was not found.`);

    const readOnly = body?.readOnly === true;
    if (!readOnly && !repo.canPush) {
      throw new ApiError(
        403,
        "forbidden",
        `You can only read ${repo.fullName}. Tick "Read only", or choose a repository you can write to.`,
      );
    }

    const branchInput = typeof body?.branch === "string" ? body.branch.trim() : "";
    if (branchInput && !BRANCH.test(branchInput)) {
      throw new ApiError(400, "validation", `${branchInput} is not a branch name.`);
    }

    const oauthState = await createOAuthState();
    await setMcpPending(
      await sealPending({
        ...parsed.value,
        oauthState,
        target: {
          owner: repo.owner,
          repo: repo.name,
          branch: branchInput || null,
          directory: normalize(typeof body?.directory === "string" ? body.directory : ""),
          readOnly,
          login,
        },
      }),
    );

    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", process.env.GITHUB_OAUTH_CLIENT_ID!);
    authorize.searchParams.set("redirect_uri", appUrl(request, "/api/auth/callback").toString());
    authorize.searchParams.set("scope", "repo");
    authorize.searchParams.set("state", oauthState);

    return { url: authorize.toString() };
  });
}
