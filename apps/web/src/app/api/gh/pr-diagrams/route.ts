import { type NextRequest } from "next/server";
import { GitHubClient } from "@forkleaf/github-client";
import { extractMermaidBlocks } from "@forkleaf/markdown-engine";
import { pairDiagrams, diffDiagrams, summarizeDiff } from "@forkleaf/diagrams";
import type { RepoRef } from "@forkleaf/types";
import { ApiError, assertName, handle, withRateLimitAdvice } from "@/lib/api-helpers";
import { getLiveSession } from "@/lib/session";

/**
 * The diagrams a pull request changes.
 *
 * This is the reason the diff exists. A reviewer looking at `- B --> C` and
 * `+ B --> D` in a markdown file cannot tell whether the architecture moved or
 * a box was renamed, so in practice diagram changes are waved through. Here
 * the two revisions are fetched, the mermaid blocks in each are paired up, and
 * what actually changed is reported per diagram.
 *
 * Deliberately readable without signing in. A link posted on a pull request is
 * followed by whoever is reviewing it, and demanding an account before showing
 * them a public repository's diagram would put a signup page between a
 * reviewer and the thing they were already reading. A session is used when
 * there is one — for private repositories, and for the much higher rate limit.
 */

/** How many markdown files one request will read. */
const FILE_LIMIT = 40;

/** Diagram sources are sent to the client; a runaway file should not be. */
const MAX_SOURCE_CHARS = 20_000;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;

    const owner = assertName((params.get("owner") ?? "").trim(), "repository owner");
    const repo = assertName((params.get("repo") ?? "").trim(), "repository name");

    const number = Number(params.get("number"));
    if (!Number.isInteger(number) || number <= 0 || number > 1_000_000) {
      throw new ApiError(400, "validation", "That is not a pull request number.");
    }

    const session = await getLiveSession();

    // No retry budget for a rate limit on this route.
    //
    // The transport waits out a rate limit — up to a minute per attempt — which
    // is right for the sync engine, a background queue that can afford to. It
    // is wrong here. This is a page load, and anonymous callers share GitHub's
    // 60-per-hour-per-IP budget, so hitting the limit is an ordinary event
    // rather than a rare one. Waiting three minutes to then say "rate limited"
    // is strictly worse than saying it at once, because the useful response is
    // the same either way: sign in, and the limit stops being the problem.
    const client = new GitHubClient({
      token: session?.token ?? "",
      userAgent: "forkleaf",
      maxRetries: 0,
    });

    const pull = await withRateLimitAdvice(
      () => client.getPullRequest(owner, repo, number),
      session !== null,
    );
    const touched = await client.listPullRequestFiles(owner, repo, number);

    const markdown = touched.filter((file) => /\.mdx?$/i.test(file.path));

    // A reference for each side. The branch fields are unused — every read
    // below is by commit SHA, since a branch name resolves to whatever it
    // points at now rather than to the revision under review.
    const ref = (branch: string): RepoRef => ({ owner, repo, branch, directory: "" });
    const baseRef = ref(pull.base);
    const headRef = ref(pull.head);

    const files = await Promise.all(
      markdown.slice(0, FILE_LIMIT).map(async (file) => {
        // A renamed file is one file, read from two paths.
        const beforePath = file.previousPath ?? file.path;

        const [before, after] = await Promise.all([
          file.status === "added"
            ? Promise.resolve(null)
            : client.readFileAtCommit(baseRef, beforePath, pull.baseSha),
          file.status === "removed"
            ? Promise.resolve(null)
            : client.readFileAtCommit(headRef, file.path, pull.headSha),
        ]);

        const beforeBlocks = blocksIn(before);
        const afterBlocks = blocksIn(after);

        const diagrams = pairDiagrams(beforeBlocks, afterBlocks)
          .map((pair) => {
            const status =
              pair.before === null ? "added" : pair.after === null ? "removed" : "edited";

            // Summarised here rather than only in the browser so the JSON is
            // useful on its own — to a bot posting a comment, or to anything
            // else that wants the answer without rendering a picture.
            const summary =
              pair.before !== null && pair.after !== null
                ? summarizeDiff(diffDiagrams(pair.before, pair.after))
                : status === "added"
                  ? "New diagram"
                  : "Diagram removed";

            return {
              beforeIndex: pair.beforeIndex,
              afterIndex: pair.afterIndex,
              before: pair.before,
              after: pair.after,
              status,
              summary,
            };
          })
          // A diagram nobody touched is noise in a review.
          .filter((entry) => entry.summary !== "No change");

        return {
          path: file.path,
          previousPath: file.previousPath,
          status: file.status,
          diagrams,
        };
      }),
    );

    return {
      pull: {
        number: pull.number,
        title: pull.title,
        url: pull.url,
        state: pull.state,
        merged: pull.merged,
        author: pull.author,
        base: pull.base,
        head: pull.head,
      },
      repo: { owner, repo },
      /** True when the request touches more markdown than we read. */
      truncated: markdown.length > FILE_LIMIT,
      markdownFiles: markdown.length,
      files: files.filter((file) => file.diagrams.length > 0),
      signedIn: session !== null,
    };
  });
}

/** The mermaid sources in a file, or none when it does not exist on that side. */
function blocksIn(markdown: string | null): string[] {
  if (markdown === null) return [];

  return extractMermaidBlocks(markdown)
    .map((block) => block.code)
    .filter((code) => code.length <= MAX_SOURCE_CHARS);
}
