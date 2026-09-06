"use client";

import { useEffect, useState } from "react";
import { DiffView } from "@/components/DiffView";
import { readSuggestion, type ComparedFileDto, type SuggestionDetailDto } from "@/lib/gateway";

/**
 * What one suggestion actually proposes, in the app the notes are written in.
 *
 * The list next to this can already say who sent a correction and accept it.
 * Reading it was the gap: a link to github.com, followed by a unified diff of
 * your own prose in a code-review tool, followed by coming back here to press
 * Accept. For a reader fixing a typo in a published page — which is nearly all
 * of these — that is three context switches to approve one word.
 *
 * Fetched when the row is opened rather than with the list. A notebook can
 * have a dozen suggestions open and almost nobody reads all of them; the text
 * of every version of every note they touch is a great deal of bytes to spend
 * on the assumption that they will.
 */

export interface SuggestionDiffProps {
  owner: string;
  repo: string;
  number: number;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; detail: SuggestionDetailDto }
  | { kind: "error"; message: string };

export function SuggestionDiff({ owner, repo, number }: SuggestionDiffProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  /**
   * Read once, on the way in.
   *
   * The state moves in the promise's callbacks rather than in the effect body:
   * this opens in "loading" and the row above unmounts it when it is put away,
   * so writing "loading" again here would be a render spent saying what the
   * previous render said.
   */
  useEffect(() => {
    let live = true;

    void readSuggestion(owner, repo, number)
      .then((detail) => {
        if (live) setState({ kind: "ready", detail });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "What this suggestion changes could not be read from GitHub.",
        });
      });

    return () => {
      live = false;
    };
  }, [owner, repo, number]);

  return (
    <div className="mt-2.5 border-t border-[var(--fl-border)] pt-2.5">
      {state.kind === "loading" && (
        <p aria-busy="true" className="text-[12px] text-[var(--fl-muted)]">
          Reading the note before and after…
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[12px] text-[var(--fl-danger)]">
          {state.message}
        </p>
      )}

      {state.kind === "ready" && state.detail.files.length === 0 && (
        <p className="text-[12px] text-[var(--fl-muted)]">
          This suggestion does not change any files.
        </p>
      )}

      {state.kind === "ready" && state.detail.files.length > 0 && (
        <div className="space-y-3">
          {state.detail.files.map((file) => (
            <FileChange key={file.path} file={file} />
          ))}

          {state.detail.truncated && (
            <p className="text-[11.5px] text-[var(--fl-muted)]">
              This suggestion touches more files than are shown. Accepting it takes all of them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FileChange({ file }: { file: ComparedFileDto }) {
  return (
    <section>
      <p className="mb-1 truncate font-mono text-[11.5px] text-[var(--fl-muted)]">
        {file.previousPath && file.previousPath !== file.path
          ? `${file.previousPath} → ${file.path}`
          : file.path}
        {file.status !== "modified" && (
          <span className="ml-2 font-sans text-[10.5px] uppercase tracking-wide">
            {file.status}
          </span>
        )}
      </p>

      {file.diffable ? (
        <DiffView
          oldText={file.before ?? ""}
          newText={file.after ?? ""}
          oldLabel="Yours"
          newLabel="Suggested"
          mode="split"
          className="max-h-80"
        />
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--fl-border)] px-4 py-6 text-center text-[12px] text-[var(--fl-muted)]">
          {file.status === "added"
            ? "This suggestion adds this file. It is not text, so there is nothing to show side by side."
            : file.status === "removed"
              ? "This suggestion deletes this file."
              : "This file changed, but it is not something a diff can show — a picture, or a file too long to compare."}
        </p>
      )}
    </section>
  );
}
