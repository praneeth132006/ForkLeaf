"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Note, Workspace } from "@forkleaf/types";
import { deriveTitle } from "@forkleaf/markdown-engine";
import { buildBook, chapterSlug, type BookComments, type BookNote } from "@forkleaf/exporter";
import { pickCategory, type DiscussionRepoDto } from "@forkleaf/github-client";
import {
  ApiGatewayError,
  listLounge,
  publishBook,
  readBook,
  unpublishBook,
  type PublishedBook,
} from "@/lib/gateway";
import { Dialog } from "./Dialog";
import { linkDocuments } from "@/lib/publish-citations";
import { describeTarget, publishTargetOf, suggestEditUrl } from "@/lib/publish-target";

export interface PublishBookDialogProps {
  /** The folder being published, relative to the workspace root. */
  folder: string;
  workspace: Workspace;
  /** Every note in the notebook; the ones under `folder` become chapters. */
  notes: readonly Note[];
  onClose: () => void;
}

/** The dialog is either waiting for the reader, or waiting on GitHub. */
type Stage = "loading" | "idle" | "working";

/**
 * Publish a folder of notes as a book.
 *
 * The single-note dialog beside this one shares one page. What it cannot share
 * is a set of notes that refer to each other, because a `[[wikilink]]` on a
 * standalone page has nowhere to point — it renders as an anchor to a heading
 * that is not there. Publishing the notes together is what gives those links
 * somewhere to go, and that is the whole reason this exists.
 *
 * Everything is built here in the browser rather than on the server, for the
 * same reason single-page publishing is: rendering a diagram needs a DOM, and
 * the note never has to leave the machine in order to become a page. The
 * server is handed finished files and checks that each one is a file a book is
 * made of.
 */
export function PublishBookDialog({ folder, workspace, notes, onClose }: PublishBookDialogProps) {
  const target = useMemo(() => publishTargetOf(workspace), [workspace]);

  /** The folder's own name, which is both the book's address and its title. */
  const book = useMemo(() => chapterSlug(folder), [folder]);
  const title = useMemo(() => folder.split("/").pop() || folder, [folder]);

  /**
   * The notes that become chapters, in the order they will be read.
   *
   * Direct children only. A folder with subfolders under it is a shelf rather
   * than a book, and flattening one into a single reading order invents a
   * sequence its author never chose — better to publish the subfolder.
   *
   * Ordered by path, which for the usual `01-`, `02-` naming is the order the
   * author already wrote down, and alphabetical otherwise.
   */
  const chapters = useMemo(() => {
    const prefix = folder ? `${folder}/` : "";

    return notes
      .filter(
        (note) => note.path.startsWith(prefix) && !note.path.slice(prefix.length).includes("/"),
      )
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [notes, folder]);

  const [stage, setStage] = useState<Stage>("loading");
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedBook | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [removed, setRemoved] = useState(0);
  const [copied, setCopied] = useState(false);
  /**
   * A garden is the same book with each page saying what links to it, and a
   * map of the whole folder on the contents page. Remembered per folder, so
   * "Update book" republishes it the way it was published.
   */
  const gardenKey = `forkleaf:garden:${workspace.repo.owner}/${workspace.repo.repo}:${book}`;
  const [garden, setGarden] = useState(() => {
    try {
      return window.localStorage.getItem(gardenKey) === "1";
    } catch {
      return false;
    }
  });
  const chooseGarden = useCallback(
    (next: boolean) => {
      setGarden(next);
      try {
        window.localStorage.setItem(gardenKey, next ? "1" : "0");
      } catch {
        // Not remembered is fine; the checkbox still says what will happen.
      }
    },
    [gardenKey],
  );

  /**
   * Comments under every page, by giscus, kept in the notes repository's
   * Discussions — the same conversations as each note's Chat tab. Remembered
   * per folder, like the garden.
   */
  const commentsKey = `forkleaf:book-comments:${workspace.repo.owner}/${workspace.repo.repo}:${book}`;
  const [comments, setComments] = useState(() => {
    try {
      return window.localStorage.getItem(commentsKey) === "1";
    } catch {
      return false;
    }
  });
  /** The notes repository's Discussions settings, read once comments are asked for. */
  const [commentsRepo, setCommentsRepo] = useState<
    { repo: DiscussionRepoDto } | { error: string } | null
  >(null);
  const chooseComments = useCallback(
    (next: boolean) => {
      setComments(next);
      try {
        window.localStorage.setItem(commentsKey, next ? "1" : "0");
      } catch {
        // Not remembered is fine; the checkbox still says what will happen.
      }
    },
    [commentsKey],
  );
  useEffect(() => {
    if (!comments || commentsRepo !== null) return;
    let cancelled = false;
    listLounge({ owner: workspace.repo.owner, repo: workspace.repo.repo })
      .then((lounge) => {
        if (!cancelled) setCommentsRepo({ repo: lounge.repo });
      })
      .catch((problem: unknown) => {
        if (!cancelled) setCommentsRepo({ error: messageFor(problem) });
      });
    return () => {
      cancelled = true;
    };
  }, [comments, commentsRepo, workspace.repo.owner, workspace.repo.repo]);

  /** What giscus needs, or why it cannot have it. */
  const commentsPlan = useMemo((): { config: BookComments } | { problem: string } | null => {
    if (!comments) return null;
    if (commentsRepo === null) return { problem: "Checking the repository…" };
    if ("error" in commentsRepo) return { problem: commentsRepo.error };
    const name = `${workspace.repo.owner}/${workspace.repo.repo}`;
    const repo = commentsRepo.repo;
    if (!repo.enabled) return { problem: `Turn on Discussions in ${name}'s settings first.` };
    if (repo.private) {
      return {
        problem: `Comments need a public repository, and ${name} is private: readers could not see them.`,
      };
    }
    const category = pickCategory(repo.categories);
    if (!category) return { problem: `${name} has no Discussions category comments can go in.` };
    return {
      config: { repo: name, repoId: repo.id, category: category.name, categoryId: category.id },
    };
  }, [comments, commentsRepo, workspace.repo.owner, workspace.repo.repo]);
  const commentsConfig = commentsPlan && "config" in commentsPlan ? commentsPlan.config : undefined;

  /**
   * What this folder already is, asked once on open.
   *
   * Without it the dialog would offer to publish a book that is already
   * published — no address to copy, and no way to reach Unpublish — which is
   * exactly the state the single-page dialog had to be fixed out of.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const state = await readBook(target, book);
        if (cancelled) return;

        setPublished(state.book);
        setUrl(state.url);
        // Already published means already built: it has been sitting in the
        // repository since some earlier commit, so there is no build to warn
        // about.
        setStatus(state.book ? "built" : null);
      } catch (problem) {
        if (!cancelled) setError(messageFor(problem));
      } finally {
        if (!cancelled) setStage("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [target, book]);

  const publish = useCallback(async () => {
    setStage("working");
    setError(null);

    try {
      setStep(`Rendering ${chapters.length} chapters…`);

      const sources: BookNote[] = chapters.map((note) => ({
        path: note.path,
        title: deriveTitle(note.content, note.frontmatter.title, note.path),
        // Citations are written relative to the note, which is right in the
        // repository and reaches nothing from a page served out of `docs/`.
        // Only the published copy is rewritten.
        markdown: linkDocuments(note.content, { notePath: note.path, repo: workspace.repo }),
        frontmatter: note.frontmatter,
      }));

      const built = await buildBook(sources, {
        title,
        theme: "light",
        renderDiagrams: true,
        // Points at the note in the repository it came from, never at the
        // published copy.
        suggestUrl: (note) => suggestEditUrl(workspace.repo, note.path),
        garden,
        ...(commentsConfig ? { comments: commentsConfig } : {}),
      });

      setStep("Committing the book to your repository…");
      const result = await publishBook({
        repo: target,
        book,
        title,
        chapters: built.chapters,
        files: built.files,
      });

      setUrl(result.url);
      setStatus(result.status);
      setRemoved(result.removed);
      setPublished({
        version: 1,
        book,
        title,
        publishedAt: new Date().toISOString(),
        chapters: built.chapters,
        files: [],
      });
      setStage("idle");
    } catch (problem) {
      setError(messageFor(problem));
      setStage("idle");
    }
  }, [chapters, title, book, target, workspace.repo, garden, commentsConfig]);

  const unpublish = useCallback(async () => {
    setStage("working");
    setStep("Deleting the book…");
    setError(null);

    try {
      await unpublishBook(target, book);
      onClose();
    } catch (problem) {
      setError(messageFor(problem));
      setStage("idle");
    }
  }, [target, book, onClose]);

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // A clipboard the browser will not give us is not worth an error: the
      // address is on screen and selectable.
    }
  }, [url]);

  const where = (
    <div className="space-y-1 rounded-lg border border-[var(--fl-border)] px-3 py-2.5">
      <span className="text-[12px] text-[var(--fl-muted)]">The book goes to</span>
      <p className="font-mono text-[12.5px] text-[var(--fl-text)]">
        {describeTarget(target)}
        <span className="text-[var(--fl-muted)]"> · docs/{book}/</span>
      </p>
    </div>
  );

  const gardenChoice = (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--fl-border)] px-3 py-2.5">
      <input
        type="checkbox"
        checked={garden}
        onChange={(event) => chooseGarden(event.target.checked)}
        disabled={stage === "working"}
        className="mt-0.5"
      />
      <span className="space-y-0.5">
        <span className="block text-[13px] font-medium text-[var(--fl-text)]">
          Publish as a digital garden
        </span>
        <span className="block text-[12px] leading-relaxed text-[var(--fl-muted)]">
          Every page lists the notes that link to it, and the contents page shows a map of how they
          connect.
        </span>
      </span>
    </label>
  );

  const commentsChoice = (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--fl-border)] px-3 py-2.5">
      <input
        type="checkbox"
        checked={comments}
        onChange={(event) => chooseComments(event.target.checked)}
        disabled={stage === "working"}
        className="mt-0.5"
      />
      <span className="space-y-0.5">
        <span className="block text-[13px] font-medium text-[var(--fl-text)]">
          Comments on every page
        </span>
        <span className="block text-[12px] leading-relaxed text-[var(--fl-muted)]">
          Readers sign in with GitHub to comment, through giscus. Each page&rsquo;s comments are the
          same conversation as its note&rsquo;s Chat tab.
        </span>
        {commentsPlan && "problem" in commentsPlan && (
          <span role="status" className="block text-[12px] leading-relaxed text-[var(--fl-warn)]">
            {commentsPlan.problem}
            {commentsPlan.problem.endsWith("…") ? "" : " Publishing goes ahead without comments."}
          </span>
        )}
        {commentsConfig && (
          <span className="block text-[12px] leading-relaxed text-[var(--fl-muted)]">
            The giscus app must be installed on {commentsConfig.repo}:{" "}
            <a
              href="https://github.com/apps/giscus"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              install giscus ↗
            </a>
          </span>
        )}
      </span>
    </label>
  );

  const problem = error && (
    <p role="alert" className="text-[13px] leading-relaxed text-[var(--fl-danger)]">
      {error}
    </p>
  );

  // ── Still asking what this folder already is ────────────────────────────

  if (stage === "loading") {
    return (
      <Dialog title="Publish as a book" subtitle={folder} onClose={onClose}>
        <p className="text-[13px] text-[var(--fl-muted)]">Checking whether this is published…</p>
      </Dialog>
    );
  }

  // ── Nothing to publish ──────────────────────────────────────────────────

  if (chapters.length === 0) {
    return (
      <Dialog title="Publish as a book" subtitle={folder} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
            There are no notes directly in this folder. A book is made from the notes a folder holds
            — notes in subfolders belong to those, so publish the subfolder instead.
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="fl-btn fl-btn-primary">
              Close
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  // ── Published ───────────────────────────────────────────────────────────

  if (published) {
    return (
      <Dialog title="Published" subtitle={`${title} is a public book`} onClose={onClose}>
        <div className="space-y-4">
          {url ? (
            <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3">
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="block break-all font-mono text-[12.5px] text-[var(--fl-accent)] underline underline-offset-2"
              >
                {url}
              </a>
            </div>
          ) : (
            /* Committed, but the repository is not being served. There is a
               folder of files and no address, and which of the two is missing
               is what separates a fixable state from a broken one. */
            <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
              The book is committed to <code className="font-mono text-[12px]">docs/{book}/</code>,
              but GitHub Pages is switched off for this repository, so it has no public address yet.
              Turning Pages on in the repository&rsquo;s settings publishes it as it stands.
            </p>
          )}

          <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
            {published.chapters.length === 1
              ? "One chapter"
              : `${published.chapters.length} chapters`}
            , with links between them resolved.
            {removed > 0 &&
              ` ${removed === 1 ? "One page" : `${removed} pages`} from an earlier publish ${
                removed === 1 ? "was" : "were"
              } removed.`}
          </p>

          {url && status !== "built" && (
            /* GitHub takes up to a minute to build a site for the first time.
               Handing over a link and saying nothing means the first person to
               click it — usually the author, immediately — gets a 404. */
            <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
              GitHub is building the site now. The first publish of a repository can take a minute
              or so before the address answers; every one after that is quick.
            </p>
          )}

          {gardenChoice}
          {commentsChoice}
          {where}
          {problem}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void unpublish()}
              disabled={stage === "working"}
              className="fl-btn fl-btn-ghost !text-[var(--fl-danger)] disabled:opacity-50"
            >
              Unpublish
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={stage === "working"}
              className="fl-btn fl-btn-ghost disabled:opacity-50"
            >
              {stage === "working" ? step || "Working…" : "Update book"}
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              disabled={!url || stage === "working"}
              className="fl-btn fl-btn-ghost disabled:opacity-40"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button type="button" onClick={onClose} className="fl-btn fl-btn-primary">
              Done
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  // ── Not published yet ───────────────────────────────────────────────────

  return (
    <Dialog title="Publish as a book" subtitle={folder} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          These notes are published together as one site: a contents page, a page each, and links
          between them that work. Everything is committed to your own repository and served by
          GitHub Pages, so the book outlives ForkLeaf.
        </p>

        {/* The reading order, shown before it is committed to. It is the order
            the chapters will be numbered in and the order prev/next follows,
            and it is derived from the filenames — which is worth seeing rather
            than discovering after publishing. */}
        <div>
          <p className="mb-1.5 text-[12px] text-[var(--fl-muted)]">
            {chapters.length === 1 ? "One chapter" : `${chapters.length} chapters`}, in this order
          </p>
          <ol className="max-h-48 space-y-px overflow-y-auto rounded-lg border border-[var(--fl-border)] p-1">
            {chapters.map((note, index) => (
              <li key={note.path} className="flex gap-2.5 px-2 py-1.5 text-[13px]">
                <span className="font-mono text-[11.5px] text-[var(--fl-muted)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--fl-text)]">
                  {deriveTitle(note.content, note.frontmatter.title, note.path)}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {gardenChoice}
        {commentsChoice}
        {where}
        {problem}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={stage === "working"}
            className="fl-btn fl-btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={stage === "working"}
            className="fl-btn fl-btn-primary"
          >
            {stage === "working" ? step || "Publishing…" : "Publish book"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function messageFor(problem: unknown): string {
  if (problem instanceof ApiGatewayError) return problem.message;
  return problem instanceof Error ? problem.message : "That folder could not be published.";
}
