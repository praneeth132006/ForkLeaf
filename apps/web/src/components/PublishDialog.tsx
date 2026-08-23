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
  onClose: () => void;
}

type Stage = "form" | "working" | "done";

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
export function PublishDialog({ note, workspace, onClose }: PublishDialogProps) {
  const title = useMemo(() => deriveTitle(note.content, note.frontmatter.title, note.path), [note]);
  const slug = useMemo(
    () => slugifyFilename(stripExtension(note.path.split("/").pop() ?? "note")),
    [note.path],
  );

  const [stage, setStage] = useState<Stage>("form");
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; status: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

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
      const published = await publishNote({ repo: workspace.repo, slug, html, title });

      setResult({ url: published.url, status: published.status });
      setStage("done");
    } catch (problem) {
      setError(messageFor(problem));
      setStage("form");
    }
  }, [note, title, slug, workspace.repo]);

  const unpublish = useCallback(async () => {
    setStage("working");
    setStep("Deleting the page…");
    setError(null);

    try {
      await unpublishNote(workspace.repo, slug);
      onClose();
    } catch (problem) {
      setError(messageFor(problem));
      setStage("done");
    }
  }, [workspace.repo, slug, onClose]);

  const copy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [result]);

  // ── Published ───────────────────────────────────────────────────────────

  if (stage === "done" && result) {
    return (
      <Dialog title="Published" onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3">
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block break-all font-mono text-[12.5px] text-[var(--fl-accent)] underline underline-offset-2"
            >
              {result.url}
            </a>
          </div>

          {/* GitHub takes up to a minute to build a site for the first time.
              Handing over a link and saying nothing means the first person to
              click it — usually the author, immediately — gets a 404 and
              concludes it did not work. */}
          {result.status !== "built" && (
            <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
              GitHub is building the site now. The first publish of a repository can take a minute
              or so before the address answers; every one after that is quick.
            </p>
          )}

          <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
            The page is a file in {workspace.repo.owner}/{workspace.repo.repo}, served by GitHub
            Pages. Publishing again updates it. Anyone with the link can read it.
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void unpublish()}
              className="fl-btn fl-btn-ghost !text-[var(--fl-danger)]"
            >
              Unpublish
            </button>
            <button type="button" onClick={() => void copy()} className="fl-btn fl-btn-ghost">
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
