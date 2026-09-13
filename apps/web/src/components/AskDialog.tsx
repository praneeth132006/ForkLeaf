"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ask, highlight, type Answer, type AskSource } from "@/lib/ask";

/**
 * "Ask your notebook."
 *
 * A question in, the passages that answer it out — quoted from your notes,
 * each with the note, the heading and the line, and a button that opens the
 * note there. No model writes anything: every word shown is one you wrote,
 * and nothing leaves the device.
 */

export interface AskDialogProps {
  onClose: () => void;
  /** Every note, read the first time a question is asked. */
  loadNotes: () => Promise<AskSource[]>;
  onOpen: (path: string, line: number) => void;
}

type State =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "answered"; question: string; answer: Answer }
  | { kind: "error"; message: string };

const EXAMPLES = [
  "When do we launch?",
  "What did we decide about pricing?",
  "bread oven temperature",
];

export function AskDialog({ onClose, loadNotes, onOpen }: AskDialogProps) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const notes = useRef<AskSource[] | null>(null);

  const run = async (asked: string) => {
    const trimmed = asked.trim();
    if (!trimmed) return;
    setState({ kind: "searching" });
    try {
      notes.current ??= await loadNotes();
      setState({ kind: "answered", question: trimmed, answer: ask(trimmed, notes.current) });
    } catch (error: unknown) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Your notes could not be read.",
      });
    }
  };

  const noteCount =
    state.kind === "answered"
      ? new Set(state.answer.passages.map((passage) => passage.path)).size
      : 0;

  return (
    <Dialog
      title="Ask your notebook"
      subtitle="Answers are quoted from your own notes, with where each came from. Nothing leaves this device."
      onClose={onClose}
      wide
      steady
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(question);
          }}
          className="flex gap-2"
        >
          <input
            type="search"
            autoFocus
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question about your notes…"
            aria-label="Question"
            className="min-w-0 flex-1 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[14px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
          />
          <button
            type="submit"
            disabled={!question.trim() || state.kind === "searching"}
            className="fl-btn fl-btn-primary disabled:opacity-60"
          >
            {state.kind === "searching" ? "Looking…" : "Ask"}
          </button>
        </form>

        {state.kind === "idle" && (
          <div className="text-[var(--fl-muted)]">
            <p>Try:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setQuestion(example);
                    void run(example);
                  }}
                  className="rounded-full border border-[var(--fl-border)] px-2.5 py-1 text-[12px] hover:text-[var(--fl-text)]"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {state.message}
          </p>
        )}

        {state.kind === "answered" && state.answer.terms.length === 0 && (
          <p role="status" className="text-[var(--fl-muted)]">
            Ask with a few words that would appear in the answer — names, places, things.
          </p>
        )}

        {state.kind === "answered" &&
          state.answer.terms.length > 0 &&
          state.answer.passages.length === 0 && (
            <p role="status" className="text-[var(--fl-muted)]">
              Nothing in your notes answers &ldquo;{state.question}&rdquo;. Try other words — this
              only quotes what you have written.
            </p>
          )}

        {state.kind === "answered" && state.answer.passages.length > 0 && (
          <>
            <p role="status" className="text-[var(--fl-muted)]">
              {state.answer.passages.length} passage{state.answer.passages.length === 1 ? "" : "s"}{" "}
              from {noteCount} note{noteCount === 1 ? "" : "s"}, best answer first.
            </p>
            <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {state.answer.passages.map((passage) => (
                <li
                  key={`${passage.path}:${passage.line}`}
                  className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3"
                >
                  <blockquote className="whitespace-pre-line border-l-2 border-[var(--fl-accent)] pl-3 text-[14px] leading-relaxed text-[var(--fl-text)]">
                    {highlight(passage.text, passage.matched).map((run, index) =>
                      run.hit ? (
                        <mark
                          key={index}
                          className="rounded bg-[var(--fl-accent-soft)] px-0.5 text-[var(--fl-text)]"
                        >
                          {run.text}
                        </mark>
                      ) : (
                        <span key={index}>{run.text}</span>
                      ),
                    )}
                  </blockquote>
                  <div className="mt-2 flex items-center gap-2 text-[11.5px] text-[var(--fl-muted)]">
                    <span className="min-w-0 flex-1 truncate">
                      {passage.title}
                      {passage.heading ? ` › ${passage.heading}` : ""} · line {passage.line}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpen(passage.path, passage.line)}
                      className="shrink-0 underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                    >
                      Open at line {passage.line}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Dialog>
  );
}
