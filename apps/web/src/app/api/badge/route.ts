import { type NextRequest } from "next/server";
import { GitHubClient } from "@forkleaf/github-client";
import type { RepoRef } from "@forkleaf/types";
import { assertName, normalize } from "@/lib/api-helpers";
import { SCHEDULE_PATH } from "@/lib/flashcards";
import { runCheck, type RepositoryFile } from "@/lib/notebook-check";
import { COLOURS, badgeSvg, healthBadge, healthOf } from "@/lib/notebook-health";
import { mapPool } from "@/lib/pool";
import { enforceRateLimit } from "@/lib/rate-limit";
import { collectFilePaths } from "@/lib/tree";

/**
 * The notebook health badge: an SVG for a notes repository's README.
 *
 * Fetched by GitHub's image proxy, which has no session and no token, so this
 * only ever reads public repositories, anonymously. It always answers with a
 * picture — a grey one saying what went wrong when it cannot read the
 * repository — because a broken image in a README helps nobody. Cached for a
 * while, since a badge is looked at far more often than a notebook changes.
 */

export const maxDuration = 60;

/** How many notes one badge reads. */
export const MAX_NOTES = 400;
const MAX_NOTE_CHARS = 512 * 1024;
const REVIEWS_READ = 100;

const grey = (message: string) => badgeSvg({ label: "notebook", message, color: COLOURS.unknown });

function svgResponse(svg: string, cache: string): Response {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": cache,
      // An SVG is a document; this one should never run anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const CACHED = "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400";
const BRIEFLY = "public, max-age=60, s-maxage=300";

export async function GET(request: NextRequest) {
  try {
    enforceRateLimit(request, { name: "badge", limit: 120, windowMs: 60_000 });

    const params = new URL(request.url).searchParams;
    const owner = assertName((params.get("owner") ?? "").trim(), "repository owner");
    const repo = assertName((params.get("repo") ?? "").trim(), "repository name");
    const directory = normalize(params.get("dir") ?? "");

    const client = new GitHubClient({ token: "", userAgent: "forkleaf", maxRetries: 0 });
    const summary = await client.getRepo(owner, repo);
    if (!summary) return svgResponse(grey("not found"), BRIEFLY);
    if (summary.private) return svgResponse(grey("private"), BRIEFLY);

    const where: RepoRef = { owner, repo, branch: summary.defaultBranch, directory };
    const head = await client.getBranchHead(where);
    const tree = await client.listTree(where, { include: "all", ref: head });
    const allPaths = collectFilePaths(tree);
    const markdown = allPaths.filter(
      (path) => /\.mdx?$/i.test(path) && path !== SCHEDULE_PATH && !path.startsWith("templates/"),
    );

    const read = await mapPool(markdown.slice(0, MAX_NOTES), 6, async (path) => {
      const content = await client.readFileAtCommit(where, path, head);
      return content !== null && content.length <= MAX_NOTE_CHARS ? { path, content } : null;
    });
    const files = read.filter((file): file is RepositoryFile => file !== null);
    const result = runCheck(files, allPaths);

    const reviews = allPaths.includes(SCHEDULE_PATH)
      ? await client.listFileCommits(where, SCHEDULE_PATH, REVIEWS_READ).catch(() => [])
      : [];

    const health = healthOf({
      counts: result.survey.counts,
      scanned: result.survey.scanned,
      reviewedAt: reviews.map((commit) => commit.date),
      today: new Date(),
    });
    return svgResponse(healthBadge(health), CACHED);
  } catch (error) {
    console.error(
      "[forkleaf] Badge could not be made:",
      error instanceof Error ? error.message : error,
    );
    return svgResponse(grey("unavailable"), BRIEFLY);
  }
}
