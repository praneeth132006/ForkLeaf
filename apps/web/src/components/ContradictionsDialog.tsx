"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  findContradictions,
  type Contradiction,
  type ContradictionKind,
  type ContradictionSource,
  type Statement,
} from "@/lib/contradictions";

/**
 * Where the notebook disagrees with itself.
 *
 * Each pair is shown side by side with what differs highlighted, both opening
 * the note at the line. "Not a contradiction" hides a pair for good on this
 * device — two different years about two different things are fine.
 */

export interface ContradictionsDialogProps {
  onClose: () => void;
  loadNotes: () => Promise<ContradictionSource[]>;
  /** Pairs already judged fine. */
  dismissed: () => ReadonlySet<string>;
  onDismiss: (id: string) => void;
  onOpen: (path: string, line: number) => void;
}

type State =
  | { kind: "reading" }
  | { kind: "done"; found: Contradiction[]; notes: number }
  | { kind: "error"; message: string };

const LABEL: Record<ContradictionKind, string> = {
  numbers: "Different figures",
  negation: "Said, then denied",
  opposites: "Opposite words",
};

export function ContradictionsDialog({
  onClose,
  loadNotes,
  dismissed,
  onDismiss,
  onOpen,
}: ContradictionsDialogProps) {
  const [state, setState] = useState<State>({ kind: "reading" });
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const loadRef = useRef(loadNotes);
  const dismissedRef = useRef(dismissed);

  useEffect(() => {
    let live = true;
    loadRef.current().then(
      (sources) => {
        if (!live) return;
        setState({
          kind: "done",
          found: findContradictions(sources, { dismissed: dismissedRef.current() }),
          notes: sources.length,
        });
      },
      (error: unknown) => {
        if (!live) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Your notebook could not be read.",
        });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const shown = state.kind === "done" ? state.found.filter((pair) => !hidden.has(pair.id)) : [];

  return (
    <Dialog
      title="Contradictions"
      subtitle="Sentences in your notes that say nearly the same thing, but not quite"
      onClose={onClose}
      wide
    >
      {state.kind === "reading" && (
        <p role="status" className="text-[13px] text-[var(--fl-muted)]">
          Comparing every sentence in your notebook…
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
          {state.message}
        </p>
      )}

      {state.kind === "done" && shown.length === 0 && (
        <div className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          <p className="text-[var(--fl-text)]">
            No contradictions found in {state.notes} note{state.notes === 1 ? "" : "s"}.
          </p>
          <p className="mt-2 max-w-2xl">
            This looks for two sentences about the same thing where a figure differs (2019 and
            2021), one denies the other, or they use opposite words (rose and fell). It points at
            places to look; it never decides which one is right.
          </p>
        </div>
      )}

      {state.kind === "done" && shown.length > 0 && (
        <div className="text-[13px] leading-relaxed">
          <p className="text-[var(--fl-text)]">
            {shown.length} to look at, in {state.notes} note{state.notes === 1 ? "" : "s"}
          </p>
          <ul className="mt-3 space-y-3" data-testid="contradictions">
            {shown.map((pair) => (
              <li
                key={pair.id}
                className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[var(--fl-surface)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--fl-warn)]">
                    {LABEL[pair.kind]}
                  </span>
                  <span className="text-[12px] text-[var(--fl-muted)]">{pair.summary}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onDismiss(pair.id);
                      setHidden((current) => new Set(current).add(pair.id));
                    }}
                    className="ml-auto rounded-lg px-2 py-1 text-[12px] text-[var(--fl-muted)] hover:bg-[var(--fl-surface)] hover:text-[var(--fl-text)]"
                  >
                    Not a contradiction
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Side statement={pair.a} onOpen={onOpen} />
                  <Side statement={pair.b} onOpen={onOpen} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

function Side({
  statement,
  onOpen,
}: {
  statement: Statement;
  onOpen: (path: string, line: number) => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] p-2.5">
      <p className="text-[13.5px] text-[var(--fl-text)]">
        {highlight(statement.text, statement.differs)}
      </p>
      <button
        type="button"
        onClick={() => onOpen(statement.path, statement.line)}
        className="mt-1.5 block max-w-full truncate text-left text-[12px] text-[var(--fl-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
      >
        {statement.title} · line {statement.line}
      </button>
    </div>
  );
}

/** The sentence with what differs from the other one marked. */
function highlight(text: string, differs: readonly string[]): React.ReactNode {
  if (differs.length === 0) return text;
  const escaped = differs.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const parts = text.split(pattern);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded bg-[var(--fl-accent-soft)] px-0.5 font-semibold text-[var(--fl-text)]"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
