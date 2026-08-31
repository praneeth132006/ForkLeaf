"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { Note, RepoRef, Workspace } from "@forkleaf/types";
import { deriveTitle, slugifyFilename, stripExtension } from "@forkleaf/markdown-engine";
import { toHtml } from "@forkleaf/exporter";
import { ApiGatewayError, publishNote, unpublishNote } from "@/lib/gateway";
import { Dialog } from "./Dialog";
import {
  describeTarget,
  isSplitPublishing,
  parseTarget,
  publishTargetOf,
  suggestEditUrl,
  targetWarning,
} from "@/lib/publish-target";

export interface PublishDialogProps {
  note: Note;
  workspace: Workspace;
  /**
   * Points this workspace's pages at another repository, or back at its own.
   *
   * Absent makes the chooser read-only, which is what a caller that cannot
   * persist the choice should show rather than a control that silently
   * forgets.
   */
  onSetTarget?: (target: RepoRef | null) => Promise<void> | void;
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
  onSetTarget,
  published,
  onChanged,
  onClose,
}: PublishDialogProps) {
  /**
   * Where the page goes: this workspace's own repository unless told otherwise.
   *
   * Resolved once here rather than read from the workspace at each use, so
   * publishing, unpublishing and every sentence describing it can never
   * disagree about which repository is being talked about.
   */
  const target = useMemo(() => publishTargetOf(workspace), [workspace]);
  const split = isSplitPublishing(workspace);

  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState(() => (split ? describeTarget(target) : ""));
  const [targetError, setTargetError] = useState<string | null>(null);

  const warning = useMemo(() => targetWarning(target, workspace.repo), [target, workspace.repo]);

  const title = useMemo(() => deriveTitle(note.content, note.frontmatter.title, note.path), [note]);
  const slug = useMemo(
    () => slugifyFilename(stripExtension(note.path.split("/").pop() ?? "note")),
    [note.path],
  );

  const [creating, setCreating] = useState(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string | null; status: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * Publishes into a named repository.
   *
   * Takes the repository rather than reading `target` from the closure,
   * because the one caller that matters most has just changed it: creating the
   * public site repository and then publishing into `target` would publish
   * into the old one, since state does not update until the next render.
   */
  const publishTo = useCallback(
    async (repo: RepoRef) => {
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
          // The reader's way to send a correction back. Points at the note in
          // the repository it came from, never at the published copy.
          suggestUrl: suggestEditUrl(workspace.repo, note.path),
        });

        setStep("Committing it to your repository…");
        const result = await publishNote({ repo, slug, html, title });

        setResult({ url: result.url, status: result.status });
        setStage("idle");
        await onChanged?.();
      } catch (problem) {
        setError(messageFor(problem));
        setStage("idle");
      }
    },
    [note, title, slug, onChanged, workspace.repo],
  );

  const publish = useCallback(() => publishTo(target), [publishTo, target]);

  /**
   * Makes the public repository and points publishing at it, in one go.
   *
   * The alternative was four steps on github.com and a name typed back in, to
   * work around a limit the reader did not choose. Named after the notes
   * repository, so months later it is obvious which notebook it belongs to.
   */
  const createSiteRepo = useCallback(async () => {
    if (!onSetTarget) return;

    setCreating(true);
    setTargetError(null);

    try {
      const response = await fetch("/api/gh/site-repo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `${workspace.repo.repo}-site` }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setTargetError(body?.error?.message ?? "That repository could not be created.");
        return;
      }

      const created: RepoRef = {
        owner: String(body.owner),
        repo: String(body.repo),
        branch: "main",
        directory: "",
      };

      await onSetTarget(created);
      setEditingTarget(false);

      // The button says "and publish there", so it publishes there. Setting
      // the target and leaving the reader looking at the same failure, with a
      // second button to find, is how this looked broken the first time.
      await publishTo(created);
    } catch {
      setTargetError("Could not reach GitHub to create the repository.");
    } finally {
      setCreating(false);
    }
  }, [onSetTarget, workspace.repo.repo, publishTo]);

  const saveTarget = useCallback(async () => {
    if (!onSetTarget) return;

    const trimmed = targetDraft.trim();
    if (!trimmed) {
      await onSetTarget(null);
      setEditingTarget(false);
      setTargetError(null);
      return;
    }

    const parsed = parseTarget(trimmed);
    if (!parsed) {
      setTargetError("That is not an owner/repository name.");
      return;
    }

    await onSetTarget(parsed);
    setEditingTarget(false);
    setTargetError(null);
  }, [onSetTarget, targetDraft]);

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

  const unpublish = useCallback(async () => {
    setStage("working");
    setStep("Deleting the page…");
    setError(null);

    try {
      await unpublishNote(target, slug);
      await onChanged?.();
      onClose();
    } catch (problem) {
      setError(messageFor(problem));
      setStage("idle");
    }
  }, [target, slug, onChanged, onClose]);

  const copy = useCallback(async () => {
    if (!page?.url) return;
    await navigator.clipboard.writeText(page.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [page]);

  /**
   * Where pages go, and how to change it.
   *
   * Rendered in both states of this dialog on purpose. It first lived only in
   * the published view, which put it exactly out of reach of the person who
   * needs it most: a private notebook cannot publish at all on a free plan, so
   * the one control that fixes that sat behind a publish that could never
   * succeed.
   */
  const targetChooser = (
    <div className="space-y-1.5 rounded-lg border border-[var(--fl-border)] px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12px] text-[var(--fl-muted)]">Pages go to</span>
        {onSetTarget && !editingTarget && (
          <button
            type="button"
            onClick={() => setEditingTarget(true)}
            className="text-[12px] text-[var(--fl-muted)] underline-offset-2 hover:text-[var(--fl-text)] hover:underline"
          >
            {split ? "Change" : "Use another repository"}
          </button>
        )}
      </div>

      {editingTarget ? (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              value={targetDraft}
              onChange={(event) => setTargetDraft(event.target.value)}
              placeholder={`${workspace.repo.owner}/my-public-site`}
              aria-label="Repository to publish into"
              className="min-w-0 flex-1 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 font-mono text-[12.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            />
            <button type="button" onClick={() => void saveTarget()} className="fl-btn">
              Save
            </button>
          </div>
          {/* Says what clearing it does, because an empty box that means
                  "go back to the default" is otherwise a guess. */}
          <p className="text-[11.5px] text-[var(--fl-muted)]">
            Leave it empty to publish into {describeTarget(workspace.repo)} alongside your notes.
          </p>
          {targetError && <p className="text-[12px] text-[var(--fl-danger)]">{targetError}</p>}
        </div>
      ) : (
        <p className="font-mono text-[12.5px] text-[var(--fl-text)]">
          {describeTarget(target)}
          {split && (
            <span className="ml-2 font-sans text-[11.5px] text-[var(--fl-muted)]">
              not the repository your notes are in
            </span>
          )}
        </p>
      )}

      {warning && <p className="text-[11.5px] leading-snug text-[var(--fl-muted)]">{warning}</p>}

      {/* The way out, offered rather than described. Only while pages still go
          to the notes' own repository — once they do not, this is solved and
          the button would be noise. */}
      {onSetTarget && !split && (
        <button
          type="button"
          onClick={() => void createSiteRepo()}
          disabled={creating}
          className="w-full rounded-lg border border-[var(--fl-border)] px-2.5 py-1.5 text-[12px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50"
        >
          {creating
            ? "Creating…"
            : `Create ${workspace.repo.owner}/${workspace.repo.repo}-site and publish there`}
        </button>
      )}
    </div>
  );

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

          {targetChooser}

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
          <code className="font-mono text-[12px]">docs/{slug}.html</code> in{" "}
          {describeTarget(target)}. GitHub Pages serves it. Nothing is stored on our servers, and
          unpublishing deletes the file.
        </p>

        {targetChooser}

        <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2.5 text-[12.5px] text-[var(--fl-muted)]">
          Anyone with the link will be able to read this note. Publishing from a private repository
          needs a paid GitHub plan — point this at a public repository above and your notes stay
          private.
        </div>

        {error && (
          <div role="alert" className="space-y-1">
            <p className="text-[13px] leading-relaxed text-[var(--fl-danger)]">{error}</p>
            {/* GitHub's refusal is accurate and says nothing about what to do
                next. The fix is one control above this message, so it is worth
                naming rather than leaving to be discovered. */}
            {/pages|plan/i.test(error) && !split && (
              <p className="text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
                Pages needs a paid plan for a private repository. Choose a public repository under
                &ldquo;Pages go to&rdquo; above and this note is published there instead — the notes
                themselves stay where they are.
              </p>
            )}
          </div>
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
