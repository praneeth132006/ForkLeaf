"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { Note, Workspace } from "@forkleaf/types";
import { deriveTitle, slugifyFilename, stripExtension } from "@forkleaf/markdown-engine";
import { toHtml } from "@forkleaf/exporter";
import { ApiGatewayError, publishNote, unpublishNote } from "@/lib/gateway";
import { Dialog } from "./Dialog";

export interface PublishDialogProps {
  note: Note;
  workspace: Workspace;
  /**
   * Where this note is already published, if it is.
   *
   * Passed in rather than discovered here. The dialog used to know only what
   * it had done itself in the current session, so a note published last week
   * opened on the "Publish" screen as though it were not public at all — no
   * address to copy, and Unpublish behind a screen there was no way to reach.
   *
   * Mount this dialog with `key={note.id}` — switching notes underneath it
   * must not leave the last note's address on screen as though it were this
   * one's, and a fresh mount is a cleaner reset than an effect that fights
   * whatever the reader is in the middle of.
   */
  published?: { url: string | null } | undefined;
  /** Re-reads the published listing, so the rest of the app agrees. */
  onChanged?: (() => void | Promise<void>) | undefined;
  onClose: () => void;
}

/** The dialog is either waiting for the reader, or waiting on GitHub. */
type Stage = "idle" | "working";

/**
 * Share this note as a public web page.
 *
 * Nothing is uploaded to us. The note is rendered to one self-contained HTML
 * file — the same output as "Export HTML", diagrams and styles inlined — and
 * committed to `docs/` in the repository the note already lives in; GitHub
 * Pages serves it from there. A published note therefore outlives ForkLeaf,
 * costs nothing to host, and is unpublished by deleting a file.
 *
 * The address is derived from the note's filename rather than being free text.
 * A published page is a URL somebody else may have linked to, and letting the
 * two names drift apart is how a note quietly stops being reachable at the
 * address it was shared under.
 */
export function PublishDialog({
  note,
  workspace,
  published,
  onChanged,
  onClose,
}: PublishDialogProps) {
  const title = useMemo(() => deriveTitle(note.content, note.frontmatter.title, note.path), [note]);
  const slug = useMemo(
    () => slugifyFilename(stripExtension(note.path.split("/").pop() ?? "note")),
    [note.path],
  );

  const [stage, setStage] = useState<Stage>("idle");
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string | null; status: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * What to show: what this dialog just did, else what was already true.
   *
   * Derived rather than copied into state on open. `published` is rebuilt by
   * the parent on every render, so mirroring it in an effect would reset this
   * dialog underneath whatever the reader was doing — including wiping the
   * address it had just handed them, in the moment between publishing and the
   * listing catching up.
   *
   * A page that is already published is `built` by definition: it has been
   * sitting in the repository since some earlier commit, so there is no build
   * in progress to warn about.
   */
  const page = useMemo(
    () => result ?? (published ? { url: published.url, status: "built" as string | null } : null),
    [result, published],
  );

  const publish = useCallback(async () => {
    setStage("working");
    setError(null);

    try {
      setStep("Rendering the page…");
      const html = await toHtml(note.content, note.frontmatter, {
        format: "html",
        title,
        includeFrontmatter: false,
        renderDiagrams: true,
        theme: "light",
      });

      setStep("Committing it to your repository…");
      const result = await publishNote({ repo: workspace.repo, slug, html, title });

      setResult({ url: result.url, status: result.status });
      setStage("idle");
      await onChanged?.();
    } catch (problem) {
      setError(messageFor(problem));
      setStage("idle");
    }
  }, [note, title, slug, workspace.repo, onChanged]);

  const unpublish = useCallback(async () => {
    setStage("working");
    setStep("Deleting the page…");
    setError(null);

    try {
      await unpublishNote(workspace.repo, slug);
      await onChanged?.();
      onClose();
    } catch (problem) {
      setError(messageFor(problem));
      setStage("idle");
    }
  }, [workspace.repo, slug, onChanged, onClose]);

  const copy = useCallback(async () => {
    if (!page?.url) return;
    await navigator.clipboard.writeText(page.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [page]);

  // ── Published ───────────────────────────────────────────────────────────

  if (page) {
    return (
      <Dialog title="Published" subtitle={`${title} is a public page`} onClose={onClose}>
        <div className="space-y-4">
          {page.url ? (
            <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3">
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block break-all font-mono text-[12.5px] text-[var(--fl-accent)] underline underline-offset-2"
              >
                {page.url}
              </a>
            </div>
          ) : (
            /* Committed, but the repository is not being served. There is a
               file and no address, and which of the two is missing is what
               separates a fixable state from a broken one. */
            <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
              The page is committed to{" "}
              <code className="font-mono text-[12px]">docs/{slug}.html</code>, but GitHub Pages is
              switched off for this repository, so it has no public address yet. Turning Pages on in
              the repository&rsquo;s settings publishes it as it stands.
            </p>
          )}

          {/* GitHub takes up to a minute to build a site for the first time.
              Handing over a link and saying nothing means the first person to
              click it — usually the author, immediately — gets a 404 and
              concludes it did not work. */}
          {page.url && page.status !== "built" && (
            <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
              GitHub is building the site now. The first publish of a repository can take a minute
              or so before the address answers; every one after that is quick.
            </p>
          )}

          <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
            The page is a file in {workspace.repo.owner}/{workspace.repo.repo}, served by GitHub
            Pages. Anyone with the link can read it.
          </p>

          {error && (
            <p role="alert" className="text-[13px] leading-relaxed text-[var(--fl-danger)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void unpublish()}
              disabled={stage === "working"}
              className="fl-btn fl-btn-ghost !text-[var(--fl-danger)] disabled:opacity-50"
            >
              Unpublish
            </button>
            {/* Re-publishing is what pushes the note's current text to the
                page. It was only ever reachable by closing the dialog and
                opening it again, which showed no sign the note was public. */}
            <button
              type="button"
              onClick={() => void publish()}
              disabled={stage === "working"}
              className="fl-btn fl-btn-ghost disabled:opacity-50"
            >
              {stage === "working" ? step || "Working…" : "Update page"}
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              disabled={!page.url || stage === "working"}
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

  // ── Before, and while ───────────────────────────────────────────────────

  return (
    <Dialog
      title="Publish this note"
      subtitle="A public page, served from your own repository"
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          <strong className="font-medium text-[var(--fl-text)]">{title}</strong> is rendered to a
          single self-contained page — diagrams included — and committed to{" "}
          <code className="font-mono text-[12px]">docs/{slug}.html</code> in {workspace.repo.owner}/
          {workspace.repo.repo}. GitHub Pages serves it. Nothing is stored on our servers, and
          unpublishing deletes the file.
        </p>

        <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2.5 text-[12.5px] text-[var(--fl-muted)]">
          Anyone with the link will be able to read this note. Publishing from a private repository
          needs a paid GitHub plan; GitHub will say so if that applies to yours.
        </div>

        {error && (
          <p role="alert" className="text-[13px] leading-relaxed text-[var(--fl-danger)]">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
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
            {stage === "working" ? step || "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function messageFor(problem: unknown): string {
  if (problem instanceof ApiGatewayError) return problem.message;
  return problem instanceof Error ? problem.message : "That note could not be published.";
}
