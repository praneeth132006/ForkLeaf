import { type NextRequest } from "next/server";
import {
  handle,
  requireClient,
  readRepoRef,
  readRepoRefFromBody,
  ApiError,
} from "@/lib/api-helpers";
import { PUBLISH_DIR, pagePath, pageUrl, slugOfPage } from "@/lib/publish";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Publishing a note as a public web page.
 *
 * The whole premise of ForkLeaf is that your notes are files in a repository
 * you own, so publishing one should not mean uploading it to us. It means
 * committing a rendered copy to a `docs/` folder in that same repository and
 * asking GitHub to serve it — GitHub Pages, which the user already has, on
 * infrastructure they already control. Nothing is stored here, there is no
 * account to close, and unpublishing is a commit that deletes a file.
 *
 * The page is a single self-contained HTML file, produced by the same exporter
 * the "Export HTML" button uses, diagrams and styles inlined. A published note
 * survives ForkLeaf going away entirely, which is the only kind of "share"
 * worth offering in an app that promises no lock-in.
 *
 * Two constraints worth knowing, both GitHub's rather than ours:
 *
 *   - Pages on a *private* repository requires a paid plan. GitHub answers a
 *     free account with 403, whose message says exactly that; it is passed
 *     through rather than guessed at.
 *   - A first build takes GitHub up to a minute. The URL is returned
 *     immediately, so the caller has to say the page is on its way rather than
 *     pretend it is already there.
 */

/** Generous for a page, small enough that one bad paste cannot wedge a repo. */
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

interface PublishBody {
  owner?: string;
  repo?: string;
  branch?: string;
  dir?: string;
  /** Filename stem, without a directory or an extension. */
  slug?: string;
  /** The rendered, self-contained page. */
  html?: string;
  /** The note's title, for the commit message. */
  title?: string;
}

/**
 * What this repository currently has published.
 *
 * Publishing used to be something that happened once and was then forgotten:
 * the URL lived in the dialog's own state, and closing it was the end of any
 * record that a note was public at all. Reopening the dialog offered to
 * publish, as though it never had been — so there was no way to find the
 * address again, and no way to reach Unpublish.
 *
 * The answer is not stored here, because it does not need to be: what is
 * published is exactly what is in `docs/`, in the user's own repository. One
 * listing answers it for every note at once, which is what lets the editor
 * mark the open note and the dashboard show the whole set.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);

    const [entries, site] = await Promise.all([
      client.listDirectory(repo.owner, repo.repo, repo.branch, PUBLISH_DIR),
      // Pages being off is not an error. The pages are still committed and
      // still listed; they just have no address yet, which the caller says.
      client.getPages(repo.owner, repo.repo).catch(() => null),
    ]);

    const pages = entries
      .map((entry) => ({ entry, slug: slugOfPage(entry.name) }))
      .filter(
        (item): item is { entry: (typeof entries)[number]; slug: string } => item.slug !== null,
      )
      .map(({ entry, slug }) => ({
        slug,
        path: entry.path,
        size: entry.size,
        sha: entry.sha,
        url: site ? pageUrl(site.url, slug) : null,
      }));

    return {
      pages,
      site: site ? { url: site.url, status: site.status, isPublic: site.isPublic } : null,
    };
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    // Publishing writes a commit and may change repository settings, so it is
    // rate-limited harder than an ordinary save. Nobody publishes ten notes a
    // minute on purpose.
    enforceRateLimit(request, { name: "publish", limit: 10, windowMs: 60_000 });

    const { client } = await requireClient();
    const body = (await request.json()) as PublishBody;
    const repo = readRepoRefFromBody(body as Record<string, unknown>);

    const path = pagePath(body.slug);
    const html = body.html ?? "";

    if (!html.trim()) {
      throw new ApiError(400, "validation", "There is nothing to publish.");
    }
    if (new TextEncoder().encode(html).length > MAX_PAGE_BYTES) {
      throw new ApiError(413, "validation", "That page is too large to publish (limit 5 MB).");
    }

    // The commit comes first. If Pages cannot be switched on — a private
    // repository on a free plan, most often — the page is at least in the
    // repository, and turning Pages on later publishes it with no further work.
    const commit = await client.writeFile(
      repo,
      path,
      html,
      `publish: ${body.title?.trim() || body.slug || "note"}`,
    );

    const site = await client.enablePages(repo.owner, repo.repo, {
      branch: repo.branch,
      path: `/${PUBLISH_DIR}`,
    });

    return {
      url: pageUrl(site.url, body.slug ?? ""),
      siteUrl: site.url,
      // `built` means it is live now; anything else means GitHub is still
      // working, and the caller should say so rather than hand over a link
      // that 404s for the next thirty seconds.
      status: site.status,
      path,
      sha: commit.sha,
    };
  });
}

/** Unpublishes: deletes the page. The note itself is untouched. */
export async function DELETE(request: NextRequest) {
  return handle(async () => {
    enforceRateLimit(request, { name: "publish", limit: 10, windowMs: 60_000 });

    const { client } = await requireClient();
    const body = (await request.json()) as PublishBody;
    const repo = readRepoRefFromBody(body as Record<string, unknown>);

    const path = pagePath(body.slug);
    const commit = await client.deleteFile(repo, path, `unpublish: ${body.slug}`);

    // Pages itself is left switched on. It is a repository-wide setting the
    // user may have had before ForkLeaf ever touched it, and turning off
    // somebody's website because they unshared one note would be well beyond
    // what they asked for.
    return { path, sha: commit.sha };
  });
}
