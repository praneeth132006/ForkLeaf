import { type NextRequest } from "next/server";
import {
  handle,
  requireClient,
  readRepoRef,
  readRepoRefFromBody,
  ApiError,
} from "@/lib/api-helpers";
import {
  BOOK_MANIFEST,
  bookDir,
  bookFilePath,
  bookManifestPath,
  bookUrl,
  filesToDelete,
  parseManifest,
  serializeManifest,
  type BookChapter,
  type BookManifest,
} from "@/lib/publish";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Publishing a folder of notes as a book.
 *
 * The single-page route beside this one commits one self-contained file and is
 * the right answer for one note. It cannot express a set of notes that refer to
 * each other, and the reason is not layout — it is that a `[[wikilink]]` on a
 * published page has nowhere to point, so every link between notes silently
 * renders as an anchor to a heading that is not there.
 *
 * A book is a folder: `docs/<book>/`, a contents page, one file per chapter,
 * and a stylesheet they share. Everything about it is committed to the user's
 * own repository in a single commit, and served by GitHub Pages from there —
 * the same arrangement as a single page, with the same consequences. Nothing
 * is stored here, and a book survives ForkLeaf going away.
 *
 * The pages arrive already rendered. Diagrams are rasterised in the browser,
 * where the DOM that Mermaid needs actually exists, so this route's job is not
 * to build anything: it is to check that every file it has been asked to write
 * is a file a book is made of, write them, and record what it wrote.
 */

/** Generous for a chapter, small enough that one bad paste cannot wedge a repo. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** A whole book, which is many chapters and their pictures. */
const MAX_BOOK_BYTES = 25 * 1024 * 1024;

/** Past this, publishing is slow enough to look broken and big enough to hurt. */
const MAX_CHAPTERS = 200;

interface BookBody {
  owner?: string;
  repo?: string;
  branch?: string;
  /** The book's folder name under `docs/`. */
  book?: string;
  /** What the contents page calls it. */
  title?: string;
  /** In reading order. */
  chapters?: BookChapter[];
  /** Book-relative filenames and their contents, straight from the builder. */
  files?: { path?: string; content?: string }[];
}

/**
 * What this book currently is, if it is anything.
 *
 * Answered from the manifest rather than by looking at the folder, because the
 * folder cannot answer it — `docs/handbook/` containing HTML files is equally
 * consistent with a book ForkLeaf published and a site somebody wrote by hand,
 * and the difference decides whether this app may delete any of it.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { client } = await requireClient();
    const params = new URL(request.url).searchParams;
    const repo = readRepoRef(params);
    const book = (params.get("book") ?? "").toLowerCase();

    // Validates the name before it is used to build a path.
    bookDir(book);

    const [file, site] = await Promise.all([
      client.readFile(repo, bookManifestPath(book)),
      // Pages being off is not an error: the book is still committed and still
      // listed, it simply has no address yet, which the caller is told.
      client.getPages(repo.owner, repo.repo).catch(() => null),
    ]);

    const manifest = file ? parseManifest(file.content, book) : null;

    return {
      book: manifest,
      url: manifest && site ? bookUrl(site.url, book) : null,
      site: site ? { url: site.url, status: site.status, isPublic: site.isPublic } : null,
    };
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    // A book is one commit however many chapters it holds, so the limit is the
    // same as a page's. Nobody publishes ten books a minute on purpose.
    enforceRateLimit(request, { name: "publish", limit: 10, windowMs: 60_000 });

    const { client } = await requireClient();
    const body = (await request.json()) as BookBody;
    const repo = readRepoRefFromBody(body as Record<string, unknown>);
    const book = (body.book ?? "").toLowerCase();

    const dir = bookDir(book);
    const chapters = body.chapters ?? [];
    const files = body.files ?? [];

    if (chapters.length === 0) {
      throw new ApiError(400, "validation", "A book needs at least one note in it.");
    }
    if (chapters.length > MAX_CHAPTERS) {
      throw new ApiError(
        400,
        "validation",
        `A book can hold ${MAX_CHAPTERS} notes; that folder has ${chapters.length}.`,
      );
    }

    // Every path is re-derived rather than trusted. The list arrived over HTTP
    // and names files in somebody's repository, so a name that is not one a
    // book is made of is refused here rather than written somewhere else.
    const encoder = new TextEncoder();
    let total = 0;
    const writes = files.map((file) => {
      const path = bookFilePath(book, file.path ?? "");
      const content = file.content ?? "";
      const bytes = encoder.encode(content).length;

      if (bytes > MAX_FILE_BYTES) {
        throw new ApiError(
          413,
          "validation",
          `"${file.path}" is too large to publish (limit 5 MB).`,
        );
      }
      total += bytes;
      if (total > MAX_BOOK_BYTES) {
        throw new ApiError(413, "validation", "That book is too large to publish (limit 25 MB).");
      }

      return { op: "upsert" as const, path, content };
    });

    if (writes.length === 0) {
      throw new ApiError(400, "validation", "There is nothing to publish.");
    }

    const manifest: BookManifest = {
      version: 1,
      book,
      title: body.title?.trim() || book,
      publishedAt: new Date().toISOString(),
      chapters,
      // Including the manifest's own path. A record of what to delete that
      // leaves itself off the list survives its own deletion, and the next
      // publish finds a manifest describing a book that is no longer there.
      files: [...writes.map((write) => write.path), bookManifestPath(book)].sort(),
    };

    /**
     * Whatever the last publish wrote and this one does not.
     *
     * Renaming a note changes its chapter's address, and without this the old
     * file stays behind for ever — served at its old URL, absent from the
     * contents page, and impossible to reach except by knowing it is there.
     * The stale set comes from the previous manifest, which means it is the
     * same checked list unpublishing uses: this can only ever remove files
     * ForkLeaf itself wrote into this book.
     */
    const previous = await client.readFile(repo, bookManifestPath(book));
    const parsed = previous ? parseManifest(previous.content, book) : null;
    const keeping = new Set(manifest.files);
    const stale = parsed ? filesToDelete(parsed).filter((path) => !keeping.has(path)) : [];

    const commit = await client.commitChanges(
      repo,
      [
        ...writes,
        {
          op: "upsert" as const,
          path: bookManifestPath(book),
          content: serializeManifest(manifest),
        },
        ...stale.map((path) => ({ op: "delete" as const, path })),
      ],
      { message: `publish book: ${manifest.title}` },
    );

    // The commit comes first, exactly as for a single page: if Pages cannot be
    // switched on — a private repository on a free plan, most often — the book
    // is at least in the repository, and turning Pages on later publishes it
    // with no further work.
    const site = await client.enablePages(repo.owner, repo.repo, {
      branch: repo.branch,
      path: "/docs",
    });

    return {
      url: bookUrl(site.url, book),
      siteUrl: site.url,
      // `built` means it is live now; anything else means GitHub is still
      // working, and the caller should say so rather than hand over a link
      // that 404s for the next thirty seconds.
      status: site.status,
      dir,
      chapters: manifest.chapters.length,
      removed: stale.length,
      sha: commit.sha,
    };
  });
}

/**
 * Unpublishes: deletes exactly what the manifest says was written.
 *
 * Never the folder. `docs/handbook/` may hold a `CNAME`, a stylesheet somebody
 * wrote, or a draft they dropped in last week, and a recursive delete is
 * precisely the operation that takes those with it. The manifest is a file in
 * the user's own repository and therefore one they can edit, so it is read as
 * a claim to be checked — `filesToDelete` re-derives every path against this
 * book's folder before any of it is believed.
 *
 * The notes themselves are untouched. So is Pages, which is a repository-wide
 * setting the user may have had before ForkLeaf ever saw it.
 */
export async function DELETE(request: NextRequest) {
  return handle(async () => {
    enforceRateLimit(request, { name: "publish", limit: 10, windowMs: 60_000 });

    const { client } = await requireClient();
    const body = (await request.json()) as BookBody;
    const repo = readRepoRefFromBody(body as Record<string, unknown>);
    const book = (body.book ?? "").toLowerCase();

    bookDir(book);

    const file = await client.readFile(repo, bookManifestPath(book));
    const manifest = file ? parseManifest(file.content, book) : null;

    if (!manifest) {
      throw new ApiError(
        404,
        "not-found",
        `There is no ForkLeaf book at that address — no ${BOOK_MANIFEST} to say what it published.`,
      );
    }

    const paths = filesToDelete(manifest);
    if (paths.length === 0) {
      throw new ApiError(
        400,
        "validation",
        "That book's record does not name any files to remove.",
      );
    }

    const commit = await client.commitChanges(
      repo,
      paths.map((path) => ({ op: "delete" as const, path })),
      { message: `unpublish book: ${manifest.title}` },
    );

    return { removed: paths.length, paths, sha: commit.sha };
  });
}
