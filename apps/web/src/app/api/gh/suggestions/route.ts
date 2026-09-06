import { type NextRequest } from "next/server";
import type { RepoRef } from "@forkleaf/types";
import { ApiError, assertName, handle, requireClient } from "@/lib/api-helpers";

/**
 * The suggestions open on a notebook, and what any one of them changes.
 *
 * Every open pull request on the repository, which for a notebook is what a
 * suggestion *is*: somebody read a published page, spotted a mistake, and sent
 * the fix back. Until now the only place to find out was github.com, which is
 * the one place the author of a notes app should not have to go.
 *
 * Two questions, one route. Without a `number` this is the list, which is
 * cheap. With one it is the change itself — the before and after of every note
 * the suggestion touches, so the person whose notebook it is can read what is
 * being proposed in the app they write in, and then accept it there too.
 *
 * Reading a suggestion used to be a link to GitHub. That was defensible while
 * accepting one meant going there anyway; once accepting happened here, the
 * link was the only thing left that made a two-line correction to a note into
 * a trip to a code-review tool.
 */

/** How many files one suggestion will read the text of. */
const FILE_LIMIT = 25;

/** Enough to diff a long note, and not enough to be a denial of service. */
const MAX_CHARS = 400_000;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;

    const owner = assertName(params.get("owner") ?? "", "owner");
    const repo = assertName(params.get("repo") ?? "", "repository");

    const asked = params.get("number");
    if (asked === null) {
      return { pulls: await client.listOpenPullRequests(owner, repo) };
    }

    const number = Number(asked);
    if (!Number.isInteger(number) || number <= 0 || number > 1_000_000) {
      throw new ApiError(400, "validation", "That is not a suggestion number.");
    }

    const pull = await client.getPullRequest(owner, repo, number);
    const touched = await client.listPullRequestFiles(owner, repo, number);

    /**
     * Both sides are read out of *this* repository, by commit.
     *
     * A suggestion almost always arrives from a fork, so the head branch does
     * not exist here — but the commit does: GitHub keeps a pull request's head
     * commit reachable from the base repository, which is what makes reading
     * somebody else's proposed text possible without knowing anything about
     * where they forked to. The branch field below is never used; every read
     * names a commit.
     */
    const ref: RepoRef = { owner, repo, branch: pull.base, directory: "" };

    const files = await Promise.all(
      touched.slice(0, FILE_LIMIT).map(async (file) => {
        const diffable = /\.(mdx?|txt|ya?ml|json|csv)$/i.test(file.path);
        if (!diffable) return { ...file, before: null, after: null, diffable: false };

        // A renamed file is one file read from two paths.
        const beforePath = file.previousPath ?? file.path;

        const [before, after] = await Promise.all([
          file.status === "added"
            ? Promise.resolve(null)
            : client.readFileAtCommit(ref, beforePath, pull.baseSha),
          file.status === "removed"
            ? Promise.resolve(null)
            : client.readFileAtCommit(ref, file.path, pull.headSha),
        ]);

        // Too big to diff is said out loud rather than sent as an empty side:
        // `null` here means "not on this side", and a long file borrowing that
        // value would render as a wholesale deletion.
        const tooBig = (before?.length ?? 0) > MAX_CHARS || (after?.length ?? 0) > MAX_CHARS;
        if (tooBig) return { ...file, before: null, after: null, diffable: false };

        return { ...file, before, after, diffable: true };
      }),
    );

    return {
      pull: {
        number: pull.number,
        title: pull.title,
        url: pull.url,
        author: pull.author,
        base: pull.base,
        head: pull.head,
        baseSha: pull.baseSha,
        headSha: pull.headSha,
      },
      truncated: touched.length > FILE_LIMIT,
      files,
    };
  });
}
