"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { DiffView } from "@/components/DiffView";
import { SPANS, ageOf, growth, revisionOn, spanBefore, type Span } from "@/lib/then-and-now";

/**
 * This note, then and now.
 *
 * The version of the note that was current a month, six months or a year ago,
 * against the one open today: how much it grew, what was added and what was
 * let go. The question is less "what changed in the file" — the history
 * panel answers that commit by commit — than "how has my thinking about this
 * moved", which only a comparison across a long gap shows.
 *
 * Read-only. Bringing an old version back is the history panel's job.
 */

export interface ThenAndNowCommit {
  sha: string;
  date: string;
  message: string;
}

export interface ThenAndNowDialogProps {
  title: string;
  now: string;
  onClose: () => void;
  /** The note's commits, newest first. */
  loadHistory: () => Promise<ThenAndNowCommit[]>;
  /** The note's text at one commit, or null when it did not exist there. */
  readAt: (sha: string) => Promise<string | null>;
  /** `YYYY-MM-DD`; for tests. */
  today?: string;
}

type Load<T> =
  { kind: "reading" } | { kind: "ready"; value: T } | { kind: "error"; message: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ThenAndNowDialog({
  title,
  now,
  onClose,
  loadHistory,
  readAt,
  today = new Date().toISOString().slice(0, 10),
}: ThenAndNowDialogProps) {
  const [span, setSpan] = useState<Span>("year");
  const [history, setHistory] = useState<Load<ThenAndNowCommit[]>>({ kind: "reading" });
  const [then, setThen] = useState<Load<string | null>>({ kind: "reading" });

  useEffect(() => {
    let live = true;
    loadHistory().then(
      (commits) => live && setHistory({ kind: "ready", value: commits }),
      (error: unknown) =>
        live &&
        setHistory({
          kind: "error",
          message: error instanceof Error ? error.message : "The history could not be read.",
        }),
    );
    return () => {
      live = false;
    };
    // Once: the history does not change while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = useMemo(
    () => (history.kind === "ready" ? revisionOn(history.value, spanBefore(today, span)) : null),
    [history, today, span],
  );

  useEffect(() => {
    if (!pick) return;
    let live = true;
    readAt(pick.revision.sha).then(
      (text) => live && setThen({ kind: "ready", value: text }),
      (error: unknown) =>
        live &&
        setThen({
          kind: "error",
          message: error instanceof Error ? error.message : "That version could not be read.",
        }),
    );
    return () => {
      live = false;
    };
    // The reader is stable for the dialog's life; the pick is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.revision.sha]);

  const shown = then.kind === "ready" && pick ? then.value : null;
  const change = shown !== null ? growth(shown, now) : null;

  return (
    <Dialog title="Then and now" subtitle={title} onClose={onClose} wide steady>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-[13px]">
        <div role="tablist" aria-label="How far back" className="flex flex-wrap gap-1.5">
          {SPANS.map((entry) => (
            <button
              key={entry.span}
              type="button"
              role="tab"
              aria-selected={span === entry.span}
              onClick={() => {
                setSpan(entry.span);
                setThen({ kind: "reading" });
              }}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                span === entry.span
                  ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                  : "border border-[var(--fl-border)] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {history.kind === "reading" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Reading the note&apos;s history…
          </p>
        )}
        {history.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {history.message}
          </p>
        )}
        {history.kind === "ready" && !pick && (
          <p className="text-[var(--fl-muted)]">
            This note has no history on GitHub yet. Once it has been synced, its earlier versions
            will show here.
          </p>
        )}

        {pick && (
          <p className="text-[var(--fl-muted)]">
            {pick.exact
              ? `As it was ${ageOf(pick.revision.date, today)} ago`
              : `The note is younger than that — this is its first version, from ${ageOf(pick.revision.date, today)} ago`}
            {" · "}
            <span className="text-[var(--fl-text)]">{pick.revision.message.split("\n")[0]}</span>
          </p>
        )}

        {then.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {then.message}
          </p>
        )}

        {change && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="then-and-now-stats">
            {[
              ["Words then", String(change.wordsThen)],
              ["Words now", String(change.wordsNow)],
              ["Paragraphs added", String(change.newParagraphs)],
              ["Paragraphs let go", String(change.goneParagraphs)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2"
              >
                <p className="text-[18px] font-semibold tabular-nums text-[var(--fl-text)]">
                  {value}
                </p>
                <p className="text-[11.5px] text-[var(--fl-muted)]">{label}</p>
              </div>
            ))}
          </div>
        )}

        {change && shown !== null && (
          <>
            <p className="text-[12px] text-[var(--fl-muted)]">
              {change.wordsNow >= change.wordsThen
                ? `${plural(change.wordsNow - change.wordsThen, "word")} more than then.`
                : `${plural(change.wordsThen - change.wordsNow, "word")} shorter than then.`}
            </p>
            <DiffView oldText={shown} newText={now} oldLabel="Then" newLabel="Now" mode="split" />
          </>
        )}
      </div>
    </Dialog>
  );
}
