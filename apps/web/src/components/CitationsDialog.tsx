"use client";

import { useCallback, useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { AuditSummary, CitationCheck, PagesFor } from "@/lib/citation-audit";
import { auditCitations } from "@/lib/citation-audit";
import type { MentionSource } from "@/lib/pdf-mentions";

/**
 * Are these quotations still true?
 *
 * The one question a notebook full of citations cannot normally answer. Every
 * other tool stores a page number, which quietly stops being right the moment
 * the author adds a figure to page four — the link still opens, it just shows
 * the wrong paragraph, and nothing tells you. A ForkLeaf citation records the
 * sentence, so the question has an answer, and this is where it gets asked of
 * the whole notebook at once.
 *
 * A check and then a decision, never one action. What was found is shown, and
 * correcting a page number is a separate press per citation. Rewriting
 * somebody's notes on the strength of a text match, without showing them the
 * match first, is not a thing a notes app should do on one click.
 */

export interface CitationsDialogProps {
  onClose: () => void;
  /** Every note in the notebook, read once when the check starts. */
  loadNotes: () => Promise<MentionSource[]>;
  /** Reads a document's text, from the cache or from the repository. */
  pagesFor: PagesFor;
  /** Opens a note at the line a citation sits on. */
  onOpenNote: (path: string) => void;
  /** Opens the document at the passage, so it can be read in place. */
  onOpenDocument: (pdfPath: string, page: number) => void;
  /** Writes a corrected page number into the note holding the citation. */
  onFix: (check: CitationCheck) => Promise<void>;
}

type State =
  | { kind: "idle" }
  | { kind: "reading"; done: number; total: number; pdfPath: string }
  | { kind: "done"; summary: AuditSummary }
  | { kind: "error"; message: string };

export function CitationsDialog({
  onClose,
  loadNotes,
  pagesFor,
  onOpenNote,
  onOpenDocument,
  onFix,
}: CitationsDialogProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  /** Citations already corrected, so a fixed row stops offering the fix. */
  const [fixed, setFixed] = useState<Set<string>>(new Set());

  const run = useCallback(async () => {
    setState({ kind: "reading", done: 0, total: 0, pdfPath: "" });
    setFixed(new Set());

    try {
      const notes = await loadNotes();
      const summary = await auditCitations(notes, pagesFor, {
        onProgress: (done, total, pdfPath) => setState({ kind: "reading", done, total, pdfPath }),
      });
      setState({ kind: "done", summary });
    } catch (problem: unknown) {
      setState({
        kind: "error",
        message:
          problem instanceof Error
            ? problem.message
            : "Your notes could not be read. Nothing was changed.",
      });
    }
  }, [loadNotes, pagesFor]);

  return (
    <Dialog
      title="Citations"
      subtitle="Every quotation in your notes, checked against the document it came from"
      onClose={onClose}
      wide
    >
      {state.kind === "idle" && (
        <div className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          <p className="max-w-2xl">
            A ForkLeaf citation records the sentence you quoted, not just the page it was on. So
            when a paper is revised, the quotation can be looked for again — and this says which of
            yours have moved, and which are no longer in the document at all.
          </p>
          <p className="mt-2 max-w-2xl">
            Every document you have quoted is read, one at a time. Nothing is changed unless you ask
            for it, citation by citation.
          </p>
          <button type="button" onClick={() => void run()} className="fl-btn fl-btn-primary mt-4">
            Check my citations
          </button>
        </div>
      )}

      {state.kind === "reading" && (
        <p role="status" className="text-[13px] text-[var(--fl-muted)]">
          {state.total > 0
            ? `Reading ${state.pdfPath} — document ${Math.min(state.done + 1, state.total)} of ${state.total}…`
            : "Reading your notes…"}
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
          {state.message}
        </p>
      )}

      {state.kind === "done" && (
        <Report
          summary={state.summary}
          fixed={fixed}
          onOpenNote={onOpenNote}
          onOpenDocument={onOpenDocument}
          onFix={async (check) => {
            await onFix(check);
            setFixed((current) => new Set(current).add(keyOf(check)));
          }}
          onAgain={() => void run()}
        />
      )}
    </Dialog>
  );
}

/** Identifies one citation among all of them: which note, which line, which words. */
function keyOf(check: CitationCheck): string {
  return `${check.mention.notePath}:${check.mention.line}:${check.mention.citation?.quote ?? ""}`;
}

function Report({
  summary,
  fixed,
  onOpenNote,
  onOpenDocument,
  onFix,
  onAgain,
}: {
  summary: AuditSummary;
  fixed: ReadonlySet<string>;
  onOpenNote: (path: string) => void;
  onOpenDocument: (pdfPath: string, page: number) => void;
  onFix: (check: CitationCheck) => Promise<void>;
  onAgain: () => void;
}) {
  // Only what is worth reading about. A citation that is exactly where it says
  // it is needs no row of its own — the count at the top already says how many
  // of those there are, and a list of two hundred correct things is a list
  // nobody scrolls to the end of.
  const documents = summary.documents
    .map((document) => ({
      ...document,
      checks: document.checks.filter((check) => check.quality !== "exact"),
    }))
    .filter((document) => document.checks.length > 0 || document.error !== null);

  return (
    <div className="text-[13px] leading-relaxed">
      <p className="text-[var(--fl-text)]">
        {summary.checked === 0
          ? "No quotations to check yet."
          : `${summary.checked} ${summary.checked === 1 ? "quotation" : "quotations"} checked.`}{" "}
        <span className="text-[var(--fl-muted)]">
          {summary.lost > 0
            ? `${summary.lost} point${summary.lost === 1 ? "s" : ""} at text that is no longer there. `
            : ""}
          {summary.moved > 0 ? `${summary.moved} moved to a different page. ` : ""}
          {summary.fuzzy > 0 ? `${summary.fuzzy} matched only loosely. ` : ""}
          {summary.unreadable > 0
            ? `${summary.unreadable} document${summary.unreadable === 1 ? "" : "s"} could not be read. `
            : ""}
          {summary.checked > 0 && documents.length === 0
            ? "Every one of them is exactly where your notes say it is."
            : ""}
        </span>
      </p>

      <div className="mt-3 space-y-3">
        {documents.map((document) => (
          <section key={document.pdfPath}>
            <h4 className="break-all font-mono text-[11.5px] text-[var(--fl-text)]">
              {document.pdfPath}
            </h4>

            {document.error ? (
              <p className="mt-1 text-[12px] text-[var(--fl-muted)]">
                Could not be read, so its citations were not checked. {document.error}
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {document.checks.map((check) => (
                  <li
                    key={keyOf(check)}
                    className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-2"
                  >
                    <Verdict check={check} fixed={fixed.has(keyOf(check))} />

                    <blockquote className="mt-1 border-l-2 border-[var(--fl-border)] pl-2 text-[12px] text-[var(--fl-text)]">
                      {check.mention.citation?.quote}
                    </blockquote>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--fl-muted)]">
                      <button
                        type="button"
                        onClick={() => onOpenNote(check.mention.notePath)}
                        className="max-w-full truncate underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                      >
                        {check.mention.notePath}, line {check.mention.line}
                      </button>

                      {check.page != null && (
                        <button
                          type="button"
                          onClick={() => onOpenDocument(document.pdfPath, check.page!)}
                          className="underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                        >
                          Read page {check.page}
                        </button>
                      )}

                      {check.stale && !fixed.has(keyOf(check)) && (
                        <button
                          type="button"
                          onClick={() => void onFix(check)}
                          className="rounded border border-[var(--fl-border)] px-1.5 py-0.5 font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-surface)]"
                        >
                          Correct the page number
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <button type="button" onClick={onAgain} className="fl-btn fl-btn-ghost mt-4 !py-1.5">
        Check again
      </button>
    </div>
  );
}

/** One line saying what is actually the matter, in the reader's terms. */
function Verdict({ check, fixed }: { check: CitationCheck; fixed: boolean }) {
  if (fixed) {
    return (
      <p className="text-[12px] font-medium text-[var(--fl-text)]">
        Page number corrected to {check.page}.
      </p>
    );
  }

  if (check.quality === "lost") {
    return (
      <p className="text-[12px] font-medium text-[var(--fl-danger)]">
        These words are not in the document any more.
      </p>
    );
  }

  if (check.quality === "moved") {
    return (
      <p className="text-[12px] font-medium text-[var(--fl-text)]">
        Still there, now on page {check.page} — your note says page {check.mention.citation?.page}.
      </p>
    );
  }

  return (
    <p className="text-[12px] font-medium text-[var(--fl-text)]">
      Found on page {check.page}, but not word for word. The passage may have been edited.
    </p>
  );
}
