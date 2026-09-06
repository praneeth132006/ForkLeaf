"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { DiffView } from "@/components/DiffView";
import { compareBranches, type BranchComparisonDto, type ComparedFileDto } from "@/lib/gateway";
import { describeTry } from "@/lib/try-branch";

/**
 * The rewrite beside the original.
 *
 * Trying a rewrite already worked: a branch, a bar that says you are on one,
 * and two buttons. What was missing was the moment in between — deciding.
 * "Keep it" and "Throw it away" are cheap to offer and expensive to get wrong,
 * and until now the only way to weigh them was to read the new version and
 * remember the old one, which is a memory test rather than a comparison.
 *
 * Two columns, per note, with the changed words picked out. Against the merge
 * base rather than the base branch's tip, so anything that landed on the
 * original while the rewrite was being written is not reported here as
 * something the rewrite would delete.
 *
 * Notes with no text to compare — a screenshot the rewrite added, a file too
 * long to diff — are listed and said to be so. Leaving them out would make the
 * list a quiet lie about what keeping this would do.
 */

export interface ExperimentCompareDialogProps {
  onClose: () => void;
  owner: string;
  repo: string;
  /** The branch the experiment lands back on. */
  base: string;
  /** The experiment branch itself. */
  head: string;
  /** The experiment's subject, for saying what is being compared. */
  slug: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; comparison: BranchComparisonDto }
  | { kind: "error"; message: string };

export function ExperimentCompareDialog({
  onClose,
  owner,
  repo,
  base,
  head,
  slug,
}: ExperimentCompareDialogProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    void compareBranches(owner, repo, base, head)
      .then((comparison) => {
        if (!live) return;
        setState({ kind: "ready", comparison });
        // Opening on the first changed note saves a click on the common case,
        // which is a rewrite of exactly one note.
        setSelected(comparison.files[0]?.path ?? null);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "These two versions could not be compared on GitHub.",
        });
      });

    return () => {
      live = false;
    };
  }, [owner, repo, base, head]);

  const files = state.kind === "ready" ? state.comparison.files : [];
  // A handful of notes at most, found once per render. Memoising a `find` over
  // an array this size costs more than it saves, and the array is rebuilt each
  // render anyway, so a memo keyed on it would never hit.
  const current = files.find((file) => file.path === selected) ?? null;

  return (
    <Dialog
      title={`The rewrite of ${describeTry(slug)}, beside the original`}
      subtitle={`${head} compared with ${base}`}
      onClose={onClose}
      wide
      steady
    >
      {state.kind === "loading" && (
        <p aria-busy="true" className="text-[13px] text-[var(--fl-muted)]">
          Reading both versions…
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
          {state.message}
        </p>
      )}

      {state.kind === "ready" && files.length === 0 && (
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--fl-muted)]">
          Nothing has been changed on this rewrite yet, so there is nothing to compare.{" "}
          <span className="font-mono text-[12px]">{base}</span> and the rewrite say exactly the same
          thing.
        </p>
      )}

      {state.kind === "ready" && files.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col text-[13px]">
          {state.comparison.behindBy > 0 && (
            <p className="mb-2 shrink-0 text-[12px] leading-relaxed text-[var(--fl-muted)]">
              <span className="font-mono text-[11.5px]">{base}</span> has moved on by{" "}
              {state.comparison.behindBy} {state.comparison.behindBy === 1 ? "commit" : "commits"}{" "}
              since this rewrite started. Those are not shown here — this is what the rewrite
              changed, not what everything else did.
            </p>
          )}

          <FilePicker
            files={files}
            selected={selected}
            onSelect={setSelected}
            truncated={state.comparison.truncated}
          />

          {current && <FileDiff file={current} base={base} head={head} />}
        </div>
      )}
    </Dialog>
  );
}

function FilePicker({
  files,
  selected,
  onSelect,
  truncated,
}: {
  files: ComparedFileDto[];
  selected: string | null;
  onSelect: (path: string) => void;
  truncated: boolean;
}) {
  // One changed note is the common case, and a picker offering a single choice
  // is a control that does nothing. Its name still belongs on screen, which is
  // what the diff's own header says.
  if (files.length === 1 && !truncated) return null;

  return (
    <div className="mb-2 shrink-0">
      <ul className="flex flex-wrap gap-1.5" aria-label="Notes this rewrite changes">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              aria-pressed={file.path === selected}
              onClick={() => onSelect(file.path)}
              className={`rounded border px-2 py-1 text-[11.5px] transition-colors ${
                file.path === selected
                  ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)] text-[var(--fl-text)]"
                  : "border-[var(--fl-border)] text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)]"
              }`}
            >
              <span className="font-mono">{fileName(file.path)}</span>
              {file.status !== "modified" && (
                <span className="ml-1.5 text-[10.5px] uppercase tracking-wide">{file.status}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {truncated && (
        <p className="mt-1.5 text-[11.5px] text-[var(--fl-muted)]">
          This rewrite touches more notes than are listed here. Keeping it takes all of them.
        </p>
      )}
    </div>
  );
}

function FileDiff({ file, base, head }: { file: ComparedFileDto; base: string; head: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-1.5 shrink-0 truncate font-mono text-[11.5px] text-[var(--fl-muted)]">
        {file.previousPath && file.previousPath !== file.path
          ? `${file.previousPath} → ${file.path}`
          : file.path}
      </p>

      {file.diffable ? (
        <DiffView
          oldText={file.before ?? ""}
          newText={file.after ?? ""}
          oldLabel={base}
          newLabel={head}
          mode="split"
          className="min-h-0 flex-1"
        />
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--fl-border)] px-6 py-10 text-center text-[13px] text-[var(--fl-muted)]">
          {file.status === "added"
            ? "This rewrite adds this file. It is not text, so there is nothing to put side by side."
            : file.status === "removed"
              ? "This rewrite deletes this file."
              : "This file changed, but it is not something a diff can show — a picture, or a file too long to compare."}
        </p>
      )}
    </div>
  );
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
