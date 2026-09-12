"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  dueCards,
  formatSchedule,
  nextDue,
  parseSchedule,
  review,
  type Card,
  type Grade,
  type Schedule,
} from "@/lib/flashcards";
import { dateStamp } from "@/lib/templates";

/**
 * A review session over every `question :: answer` line in the notebook.
 *
 * One card at a time: the question, then the answer when asked for, then how
 * well it was remembered. Each grade is written to the schedule file straight
 * away, so closing the dialog halfway through loses nothing, and a card
 * forgotten in this session comes round again before it ends.
 */

export interface FlashcardsDialogProps {
  onClose: () => void;
  loadCards: () => Promise<Card[]>;
  /** The schedule file's text, or null when there is not one yet. */
  readSchedule: () => Promise<string | null>;
  writeSchedule: (content: string) => Promise<void>;
  onOpenNote: (path: string) => void;
  /** For tests; defaults to the clock. */
  now?: Date;
}

type Load =
  { kind: "reading" } | { kind: "ready"; cards: Card[] } | { kind: "error"; message: string };

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: "again", label: "Again", key: "1" },
  { grade: "hard", label: "Hard", key: "2" },
  { grade: "good", label: "Good", key: "3" },
  { grade: "easy", label: "Easy", key: "4" },
];

const gap = (days: number) =>
  days < 30 ? `${days}d` : days < 365 ? `${Math.round(days / 30)}mo` : `${Math.round(days / 365)}y`;

export function FlashcardsDialog({
  onClose,
  loadCards,
  readSchedule,
  writeSchedule,
  onOpenNote,
  now,
}: FlashcardsDialogProps) {
  const today = dateStamp(now ?? new Date());
  const [load, setLoad] = useState<Load>({ kind: "reading" });
  const [schedule, setSchedule] = useState<Schedule>(new Map());
  const [queue, setQueue] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  const loaders = useRef({ loadCards, readSchedule });
  useEffect(() => {
    loaders.current = { loadCards, readSchedule };
  }, [loadCards, readSchedule]);

  /** Writes queued one after another, so an older schedule never lands last. */
  const writing = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let live = true;
    Promise.all([loaders.current.loadCards(), loaders.current.readSchedule()]).then(
      ([cards, text]) => {
        if (!live) return;
        const parsed = parseSchedule(text);
        setSchedule(parsed);
        setQueue(dueCards(cards, parsed, today));
        setLoad({ kind: "ready", cards });
      },
      (error: unknown) => {
        if (!live) return;
        setLoad({
          kind: "error",
          message: error instanceof Error ? error.message : "Your notes could not be read.",
        });
      },
    );
    return () => {
      live = false;
    };
  }, [today]);

  const card = queue[0] ?? null;

  const grade = (chosen: Grade) => {
    if (!card || !revealed) return;
    const next = new Map(schedule).set(card.id, review(schedule.get(card.id), chosen, today));
    setSchedule(next);
    setReviewed((count) => count + 1);
    setRevealed(false);
    // A forgotten card comes round again at the end of this session.
    setQueue((current) => (chosen === "again" ? [...current.slice(1), card] : current.slice(1)));

    const text = formatSchedule(next);
    writing.current = writing.current
      .then(() => writeSchedule(text))
      .then(
        () => setProblem(null),
        () => setProblem("The schedule could not be saved. Your grades so far are kept here."),
      );
  };

  // Space or Enter shows the answer; 1–4 grade it.
  const handlers = useRef({ grade, reveal: () => setRevealed(true), card, revealed });
  useEffect(() => {
    handlers.current = { grade, reveal: () => setRevealed(true), card, revealed };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const current = handlers.current;
      if (!current.card) return;
      if (
        !current.revealed &&
        (event.key === " " || event.code === "Space" || event.key === "Enter")
      ) {
        event.preventDefault();
        current.reveal();
        return;
      }
      const chosen = GRADES.find(
        (entry) =>
          entry.key === event.key ||
          event.code === `Digit${entry.key}` ||
          event.code === `Numpad${entry.key}`,
      );
      if (current.revealed && chosen) {
        event.preventDefault();
        current.grade(chosen.grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cards = load.kind === "ready" ? load.cards : [];
  const upcoming = load.kind === "ready" && !card ? nextDue(cards, schedule, today) : null;

  return (
    <Dialog
      title="Review flashcards"
      subtitle="Every question :: answer line in your notes, when it is due"
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-3 text-[13px]">
        {load.kind === "reading" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Reading your notes…
          </p>
        )}
        {load.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {load.message}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem}
          </p>
        )}

        {load.kind === "ready" && cards.length === 0 && (
          <div className="leading-relaxed text-[var(--fl-muted)]">
            <p>There are no flashcards in your notes yet.</p>
            <p className="mt-2">
              Write a line like <code>Capital of Portugal :: Lisbon</code> in any note. Every line
              with <code>::</code> between a question and its answer becomes a card.
            </p>
          </div>
        )}

        {load.kind === "ready" && cards.length > 0 && !card && (
          <div className="leading-relaxed">
            <p className="text-[var(--fl-text)]">
              {reviewed > 0
                ? `Done for today — ${reviewed} review${reviewed === 1 ? "" : "s"}.`
                : "Nothing is due today."}
            </p>
            <p className="mt-1 text-[var(--fl-muted)]">
              {upcoming
                ? `The next card is due on ${upcoming}.`
                : `${cards.length} card${cards.length === 1 ? "" : "s"} in your notes.`}
            </p>
          </div>
        )}

        {card && (
          <>
            <p className="text-[11.5px] text-[var(--fl-muted)]">
              {queue.length} left · {reviewed} reviewed ·{" "}
              {schedule.has(card.id) ? "review" : "new card"} · from{" "}
              <button
                type="button"
                onClick={() => onOpenNote(card.path)}
                className="underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
              >
                {card.noteTitle}
              </button>
            </p>

            <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-6 text-center">
              <p className="text-[17px] font-medium text-[var(--fl-text)]">{card.question}</p>
              {revealed && (
                <p
                  aria-live="polite"
                  className="mt-4 border-t border-[var(--fl-border)] pt-4 text-[16px] text-[var(--fl-text)]"
                >
                  {card.answer}
                </p>
              )}
            </div>

            {!revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="fl-btn fl-btn-primary self-center"
              >
                Show answer <span className="opacity-60">(Space)</span>
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map((entry) => (
                  <button
                    key={entry.grade}
                    type="button"
                    onClick={() => grade(entry.grade)}
                    className="rounded-lg border border-[var(--fl-border)] px-2 py-2 text-[12.5px] font-medium text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
                  >
                    {entry.label}
                    <span className="block text-[11px] font-normal text-[var(--fl-muted)]">
                      {gap(review(schedule.get(card.id), entry.grade, today).interval)} ·{" "}
                      {entry.key}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
