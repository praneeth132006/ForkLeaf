"use client";

import { useCallback, useEffect, useState } from "react";
import type { Workspace } from "@forkleaf/types";
import { Dialog } from "@/components/Dialog";
import { listNoteHistory, type NoteCommitDto } from "@/lib/gateway";
import { readDocumentText } from "@/lib/pdf-index";
import { affected, comparePages, listPages, type VersionComparison } from "@/lib/pdf-versions";
import { relativeTime } from "@/lib/relative-time";

/**
 * What changed between two versions of a document.
 *
 * The file sits in a repository, so every version of it is kept — which no
 * other reading app can say — and that makes one sentence possible that none
 * of them can print: *the page you quoted is one of the ones that changed*.
 *
 * Compared as text rather than as bytes. A paper re-exported from the same
 * source differs in every byte while saying exactly the same thing, and a
 * comparison that reported four hundred changed pages every time somebody
 * re-saved it would be one nobody reads twice.
 *
 * Reading two whole documents is seconds of work, so nothing happens until a
 * version is chosen. The list of versions is cheap and comes first.
 */

export interface DocumentVersionsDialogProps {
  onClose: () => void;
  workspace: Workspace;
  /** The document being read, repository-relative. */
  path: string;
  /** Pages this notebook quotes or has marked, for the sentence at the end. */
  cited: readonly number[];
  /** Turns the open reader to a page, so a change can be looked at. */
  onGoToPage?: ((page: number) => void) | null;
}

type State =
  | { kind: "listing" }
  | { kind: "ready"; commits: NoteCommitDto[] }
  | { kind: "error"; message: string };

export function DocumentVersionsDialog({
  onClose,
  workspace,
  path,
  cited,
  onGoToPage,
}: DocumentVersionsDialogProps) {
  const [state, setState] = useState<State>({ kind: "listing" });
  const [reading, setReading] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sha: string;
    comparison: VersionComparison;
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    void listNoteHistory(workspace.repo, path, 30)
      .then((commits) => {
        if (live) setState({ kind: "ready", commits });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "This document's history could not be read from GitHub.",
        });
      });

    return () => {
      live = false;
    };
  }, [workspace.repo, path]);

  const compare = useCallback(
    async (sha: string) => {
      setReading(sha);
      setProblem(null);
      setResult(null);

      try {
        // The same route the reader uses, asked for a commit instead of a
        // branch: GitHub's contents API takes either.
        const [before, after] = await Promise.all([
          readDocumentText({ ...workspace, repo: { ...workspace.repo, branch: sha } }, path),
          readDocumentText(workspace, path),
        ]);

        setResult({ sha, comparison: comparePages(before, after) });
      } catch (error: unknown) {
        setProblem(
          error instanceof Error ? error.message : "Those two versions could not both be read.",
        );
      } finally {
        setReading(null);
      }
    },
    [workspace, path],
  );

  return (
    <Dialog title="What changed in this document" subtitle={path} onClose={onClose} wide steady>
      {state.kind === "listing" && (
        <p aria-busy="true" className="text-[13px] text-[var(--fl-muted)]">
          Reading this document&rsquo;s history…
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
          {state.message}
        </p>
      )}

      {state.kind === "ready" && state.commits.length <= 1 && (
        <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          This document has only ever been committed once, so there is no earlier version to compare
          it with.
        </p>
      )}

      {state.kind === "ready" && state.commits.length > 1 && (
        <div className="text-[13px]">
          <p className="text-[var(--fl-muted)]">
            Pick a version to compare with the one you are reading. Both are read in full, which
            takes a moment on a long paper.
          </p>

          <ul className="mt-3 space-y-1.5">
            {/* The newest commit is the version being read, so it is not on
                offer: comparing a thing with itself is not a question. */}
            {state.commits.slice(1).map((commit) => (
              <li
                key={commit.sha}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--fl-border)] px-2.5 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--fl-text)]">
                    {commit.message || "(no message)"}
                  </span>
                  <span className="block text-[11px] text-[var(--fl-muted)]">
                    <span className="font-mono">{commit.sha.slice(0, 7)}</span> ·{" "}
                    {commit.authorName} · {relativeTime(commit.date)}
                  </span>
                </span>

                <button
                  type="button"
                  disabled={reading !== null}
                  onClick={() => void compare(commit.sha)}
                  className="shrink-0 rounded border border-[var(--fl-border)] px-2 py-1 text-[11.5px] font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50"
                >
                  {reading === commit.sha ? "Reading both…" : "Compare"}
                </button>
              </li>
            ))}
          </ul>

          {problem && (
            <p role="alert" className="mt-3 text-[12.5px] text-[var(--fl-danger)]">
              {problem}
            </p>
          )}

          {result && (
            <Report
              comparison={result.comparison}
              cited={cited}
              {...(onGoToPage ? { onGoToPage } : {})}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

function Report({
  comparison,
  cited,
  onGoToPage,
}: {
  comparison: VersionComparison;
  cited: readonly number[];
  onGoToPage?: (page: number) => void;
}) {
  const yours = affected(comparison, cited);

  return (
    <div className="mt-4 border-t border-[var(--fl-border)] pt-3">
      <p className="text-[13px] text-[var(--fl-text)]">
        {comparison.changes.length === 0
          ? "Nothing changed. The two versions say the same thing on every page."
          : `${comparison.changes.length} of ${comparison.pages} ${
              comparison.pages === 1 ? "page" : "pages"
            } changed.`}
      </p>

      {comparison.changes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {comparison.changes.map((change) => (
            <li key={`${change.page}-${change.kind}`}>
              <button
                type="button"
                disabled={!onGoToPage || change.kind === "removed"}
                onClick={() => onGoToPage?.(change.page)}
                title={
                  change.kind === "removed"
                    ? "This page is not in the version you are reading"
                    : `Go to page ${change.page}`
                }
                className="rounded border border-[var(--fl-border)] px-1.5 py-0.5 text-[11.5px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:cursor-default disabled:opacity-60"
              >
                p. {change.page}
                {change.kind === "changed" ? "" : ` (${change.kind})`}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The sentence this whole comparison exists to be able to say. */}
      {yours.length > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--fl-text)]">
          <strong>
            {listPages(yours.map((change) => change.page))
              .replace(/^p/, "P")
              .replace(/^pages/, "Pages")}
          </strong>{" "}
          {yours.length === 1 ? "is one you quoted" : "are ones you quoted"}, and{" "}
          {yours.length === 1 ? "it has" : "they have"} changed. Whether the words you quoted are
          still there is what <strong>Check my citations against their documents</strong> answers.
        </p>
      )}

      {yours.length === 0 && cited.length > 0 && comparison.changes.length > 0 && (
        <p className="mt-3 text-[12.5px] text-[var(--fl-muted)]">
          None of the pages you quoted are among them.
        </p>
      )}
    </div>
  );
}
