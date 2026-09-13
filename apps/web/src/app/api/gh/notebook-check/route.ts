import { type NextRequest } from "next/server";
import { GitHubClient } from "@forkleaf/github-client";
import type { RepoRef } from "@forkleaf/types";
import {
  ApiError,
  assertName,
  assertRef,
  handle,
  normalize,
  withRateLimitAdvice,
} from "@/lib/api-helpers";
import { formatReport, runCheck, type RepositoryFile } from "@/lib/notebook-check";
import { mapPool } from "@/lib/pool";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getLiveSession } from "@/lib/session";
import { collectFilePaths } from "@/lib/tree";

/**
 * The stale-notes check, for a repository and a commit.
 *
 * What the notebook check workflow calls: it reads every markdown file at one
 * commit, runs the same survey the editor shows, and answers with the findings
 * and a ready-made markdown report. It fails nothing itself; the workflow
 * decides that from `ok`.
 *
 * Readable without signing in, like the diagram review, because a workflow on
 * a public repository has no ForkLeaf session. A private repository needs a
 * token: the signed-in session, or a bearer token sent explicitly — in Actions,
 * the job's own `GITHUB_TOKEN`, which is scoped to that repository and expires
 * with the job. A token sent here is used for this request's reads and nothing
 * else; it is not stored and not logged.
 */

export const maxDuration = 60;

/** How many notes one check reads. Past this, the rest are reported as skipped. */
export const MAX_NOTES = 400;
/** A note bigger than this is not a note anybody is linking from by hand. */
export const MAX_NOTE_CHARS = 512 * 1024;

const RATE_LIMIT = { name: "notebook-check", limit: 10, windowMs: 5 * 60_000 };
const BEARER = /^Bearer\s+([\w.-]{20,255})$/;
const SHA = /^[0-9a-f]{40}$/i;

export async function GET(request: NextRequest) {
  return handle(async () => {
    enforceRateLimit(request, RATE_LIMIT);

    const params = new URL(request.url).searchParams;
    const owner = assertName((params.get("owner") ?? "").trim(), "repository owner");
    const repo = assertName((params.get("repo") ?? "").trim(), "repository name");
    const askedRef = (params.get("ref") ?? "").trim();
    const directory = normalize(params.get("dir") ?? "");

    const header = request.headers.get("authorization");
    const bearer = header ? BEARER.exec(header)?.[1] : undefined;
    if (header && !bearer) {
      throw new ApiError(400, "validation", "The Authorization header must be a bearer token.");
    }
    const session = bearer ? null : await getLiveSession();
    const token = bearer ?? session?.token ?? "";
    const signedIn = token !== "";

    // No retry budget, for the reason the diagram review gives: waiting out a
    // rate limit inside a workflow step only delays the same answer.
    const client = new GitHubClient({ token, userAgent: "forkleaf", maxRetries: 0 });

    let branch = askedRef ? assertRef(askedRef, "ref") : "";
    if (!branch) {
      const summary = await withRateLimitAdvice(() => client.getRepo(owner, repo), signedIn);
      if (!summary) {
        throw new ApiError(
          404,
          "not-found",
          `${owner}/${repo} was not found. A private repository needs a token.`,
        );
      }
      branch = summary.defaultBranch;
    }

    const repoRef: RepoRef = { owner, repo, branch, directory };

    // One commit for every read, so a push landing mid-check cannot report a
    // picture as missing because the tree and the note came from two versions.
    const head = SHA.test(branch)
      ? branch
      : await withRateLimitAdvice(() => client.getBranchHead(repoRef), signedIn);

    const tree = await withRateLimitAdvice(
      () => client.listTree(repoRef, { include: "all", ref: head }),
      signedIn,
    );
    const allPaths = collectFilePaths(tree);
    const markdown = allPaths.filter((path) => /\.mdx?$/i.test(path));

    const read = await mapPool(markdown.slice(0, MAX_NOTES), 6, async (path) => {
      const content = await client.readFileAtCommit(repoRef, path, head);
      return content !== null && content.length <= MAX_NOTE_CHARS ? { path, content } : null;
    });
    const files = read.filter((file): file is RepositoryFile => file !== null);
    const skipped = markdown.length - files.length;

    const result = runCheck(files, allPaths);
    const repository = `${owner}/${repo}`;

    return {
      repository,
      ref: head,
      ok: result.ok,
      scanned: result.survey.scanned,
      skipped,
      counts: result.survey.counts,
      notes: result.survey.notes,
      markdown: formatReport(result, {
        repository,
        ref: SHA.test(head) ? head.slice(0, 7) : head,
        skipped,
      }),
    };
  });
}
