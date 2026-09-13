"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  collectOpenTasks,
  dueState,
  type NoteTasks,
  type Task,
  type TaskSource,
} from "@/lib/tasks";
import { dateStamp } from "@/lib/templates";

/**
 * Every open to-do in the notebook, with a box you can tick from here.
 *
 * Ticking writes the note, the same one-character change as ticking it in the
 * editor, so it syncs and has history like any other edit. A ticked row stays
 * on the list, struck through, until the dialog is closed — a row that
 * vanished under the cursor could not be unticked by somebody who misclicked.
 */

export interface TasksDialogProps {
  onClose: () => void;
  /** Every note in the notebook, read when the dialog opens. */
  loadNotes: () => Promise<TaskSource[]>;
  /** Writes one box; false when the task could not be found in the note. */
  onToggle: (path: string, task: Task, done: boolean) => Promise<boolean>;
  onOpenNote: (path: string) => void;
  /** For tests; defaults to the clock. */
  now?: Date;
}

type State =
  { kind: "reading" } | { kind: "done"; notes: NoteTasks[] } | { kind: "error"; message: string };

const keyOf = (path: string, task: Task) => `${path}::${task.line}::${task.text}`;

export function TasksDialog({ onClose, loadNotes, onToggle, onOpenNote, now }: TasksDialogProps) {
  const [state, setState] = useState<State>({ kind: "reading" });
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const today = dateStamp(now ?? new Date());

  /**
   * Bumped to read the notebook again.
   *
   * The reader is held in a ref rather than listed as a dependency: callers
   * pass it inline, so it is a new function on every render, and an effect
   * keyed on it would read the whole notebook in a loop.
   */
  const [generation, setGeneration] = useState(0);
  const loadRef = useRef(loadNotes);
  useEffect(() => {
    loadRef.current = loadNotes;
  }, [loadNotes]);

  useEffect(() => {
    let live = true;
    loadRef.current().then(
      (sources) => {
        if (live) setState({ kind: "done", notes: collectOpenTasks(sources) });
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
  }, [generation]);

  const read = () => {
    setState({ kind: "reading" });
    setGeneration((value) => value + 1);
  };

  const toggle = async (path: string, task: Task) => {
    const key = keyOf(path, task);
    const done = !ticked.has(key);
    setProblem(null);

    const written = await onToggle(path, task, done);
    if (!written) {
      setProblem("That to-do has changed since this list was read, so nothing was ticked.");
      void read();
      return;
    }
    setTicked((current) => {
      const next = new Set(current);
      if (done) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const notes = state.kind === "done" ? state.notes : [];
  const open = notes.reduce(
    (sum, note) => sum + note.tasks.filter((task) => !ticked.has(keyOf(note.path, task))).length,
    0,
  );
  const overdue = notes.reduce(
    (sum, note) =>
      sum +
      note.tasks.filter(
        (task) =>
          task.due &&
          dueState(task.due, today) === "overdue" &&
          !ticked.has(keyOf(note.path, task)),
      ).length,
    0,
  );

  return (
    <Dialog
      title="Open to-dos"
      subtitle="Every unticked box in the notebook, soonest due first"
      onClose={onClose}
      wide
    >
      {state.kind === "reading" && (
        <p role="status" className="text-[13px] text-[var(--fl-muted)]">
          Reading your notes…
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
          {state.message}
        </p>
      )}

      {state.kind === "done" && notes.length === 0 && (
        <div className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          <p>Nothing left to do.</p>
          <p className="mt-2 max-w-2xl">
            A line like <code>- [ ] Send the draft 📅 2026-09-14</code> in any note shows up here.
            The date is optional; with one, overdue items come first.
          </p>
        </div>
      )}

      {state.kind === "done" && notes.length > 0 && (
        <div className="text-[13px] leading-relaxed">
          <p className="text-[var(--fl-text)]">
            {open} open in {notes.length} note{notes.length === 1 ? "" : "s"}
            {overdue > 0 && <span className="text-[var(--fl-danger)]"> · {overdue} overdue</span>}
          </p>

          {problem && (
            <p role="alert" className="mt-2 text-[12.5px] text-[var(--fl-danger)]">
              {problem}
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {notes.map((note) => (
              <li
                key={note.path}
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-2.5"
              >
                <button
                  type="button"
                  onClick={() => onOpenNote(note.path)}
                  className="block max-w-full truncate text-left text-[13px] font-medium text-[var(--fl-text)] underline decoration-dotted underline-offset-2"
                >
                  {note.title}
                </button>
                <span className="block truncate font-mono text-[10.5px] text-[var(--fl-muted)]">
                  {note.path}
                </span>

                <ul className="mt-1.5 space-y-1">
                  {note.tasks.map((task) => {
                    const key = keyOf(note.path, task);
                    const done = ticked.has(key);
                    const state = task.due ? dueState(task.due, today) : null;
                    return (
                      <li key={key}>
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => void toggle(note.path, task)}
                            className="mt-[3px] accent-[var(--fl-accent)]"
                          />
                          <span
                            className={`min-w-0 flex-1 ${
                              done ? "text-[var(--fl-muted)] line-through" : "text-[var(--fl-text)]"
                            }`}
                          >
                            {task.text}
                          </span>
                          {state && !done && (
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                                state === "overdue"
                                  ? "bg-[var(--fl-danger)] text-white"
                                  : state === "today"
                                    ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                                    : "border border-[var(--fl-border)] text-[var(--fl-muted)]"
                              }`}
                            >
                              {state === "overdue"
                                ? "Overdue"
                                : state === "today"
                                  ? "Today"
                                  : task.due}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
