"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { suggestCards } from "@/lib/flashcard-suggestions";
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
 * Flashcards: learn what is in your notes, and keep it.
 *
 * The first thing shown is what flashcards are for and how many are waiting,
 * not a card — a review session with no explanation was the whole feature
 * before, and nobody could tell what it wanted or how to feed it. From here a
 * card can be added without knowing any syntax, the open note's definitions
 * can be turned into cards with a tick, and a deck (the cards in one note) can
 * be studied on its own.
 *
 * A study session is one card at a time: the question, then the answer when
 * asked for, then how well it was remembered. Each grade is written to the
 * schedule straight away, so closing halfway loses nothing, and a card
 * forgotten in a session comes round again before it ends.
 */

export interface NewCard {
  question: string;
  answer: string;
}

export interface FlashcardsDialogProps {
  onClose: () => void;
  loadCards: () => Promise<Card[]>;
  /** The schedule file's text, or null when there is not one yet. */
  readSchedule: () => Promise<string | null>;
  writeSchedule: (content: string) => Promise<void>;
  onOpenNote: (path: string) => void;
  /** Adds cards to a note, making the note if it does not exist. */
  onAddCards: (path: string, cards: NewCard[]) => Promise<void>;
  /** The note open in the editor, to suggest cards from and add cards to. */
  currentNote?: { path: string; title: string; content: string } | null;
  /** Where cards go when there is no deck to put them in yet. */
  defaultDeck?: string;
  /** For tests; defaults to the clock. */
  now?: Date;
}

type Load =
  { kind: "reading" } | { kind: "ready"; cards: Card[] } | { kind: "error"; message: string };

type Session = { deck: string | null; practising: boolean; total: number };

const GRADES: { grade: Grade; label: string; means: string; key: string }[] = [
  { grade: "again", label: "Again", means: "Forgot it", key: "1" },
  { grade: "hard", label: "Hard", means: "Barely", key: "2" },
  { grade: "good", label: "Good", means: "Knew it", key: "3" },
  { grade: "easy", label: "Easy", means: "Too easy", key: "4" },
];

const DEFAULT_DECK = "flashcards/Flashcards.md";
const NEW_PER_SESSION = 20;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const gap = (days: number) =>
  days < 30
    ? plural(days, "day")
    : days < 365
      ? plural(Math.round(days / 30), "month")
      : plural(Math.round(days / 365), "year");

const field =
  "w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[13.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]";

export function FlashcardsDialog({
  onClose,
  loadCards,
  readSchedule,
  writeSchedule,
  onOpenNote,
  onAddCards,
  currentNote = null,
  defaultDeck = DEFAULT_DECK,
  now,
}: FlashcardsDialogProps) {
  const today = dateStamp(now ?? new Date());
  const [load, setLoad] = useState<Load>({ kind: "reading" });
  const [schedule, setSchedule] = useState<Schedule>(new Map());
  const [session, setSession] = useState<Session | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [deckChoice, setDeckChoice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());

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
        setSchedule(parseSchedule(text));
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
  }, [today, reloads]);

  const cards = useMemo(() => (load.kind === "ready" ? load.cards : []), [load]);
  const due = useMemo(() => dueCards(cards, schedule, today, Infinity), [cards, schedule, today]);
  const dueCount = due.filter((card) => schedule.has(card.id)).length;
  const newCount = cards.filter((card) => !schedule.has(card.id)).length;
  const studyCount = dueCount + Math.min(newCount, NEW_PER_SESSION);
  const upcoming = nextDue(cards, schedule, today);

  const decks = useMemo(() => {
    const byPath = new Map<string, { path: string; title: string; cards: Card[] }>();
    for (const card of cards) {
      const deck = byPath.get(card.path) ?? { path: card.path, title: card.noteTitle, cards: [] };
      deck.cards.push(card);
      byPath.set(card.path, deck);
    }
    return [...byPath.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [cards]);

  const suggestions = useMemo(
    () => (currentNote ? suggestCards(currentNote.content) : []),
    [currentNote],
  );
  const ticked = suggestions.filter((suggestion) => !unticked.has(suggestion.question));

  // Where a new card goes: the chosen deck, else the open note if it already
  // has cards, else the first deck, else a new Flashcards note.
  const deckOptions = useMemo(() => {
    const options = decks.map((deck) => ({ path: deck.path, label: deck.title }));
    if (currentNote && !options.some((option) => option.path === currentNote.path)) {
      options.push({ path: currentNote.path, label: `${currentNote.title} (open note)` });
    }
    if (!options.some((option) => option.path === defaultDeck)) {
      options.push({ path: defaultDeck, label: "Flashcards (a new note)" });
    }
    return options;
  }, [decks, currentNote, defaultDeck]);
  const deck =
    deckChoice ??
    (currentNote && decks.some((each) => each.path === currentNote.path)
      ? currentNote.path
      : (decks[0]?.path ?? defaultDeck));

  const start = (deckPath: string | null) => {
    const pool = deckPath ? cards.filter((card) => card.path === deckPath) : cards;
    const waiting = dueCards(pool, schedule, today, NEW_PER_SESSION);
    // A deck with nothing due can still be practised: every card, once.
    const practising = waiting.length === 0;
    const next = practising ? pool : waiting;
    if (next.length === 0) return;
    setQueue(next);
    setSession({ deck: deckPath, practising, total: next.length });
    setReviewed(0);
    setRevealed(false);
  };

  const card = session ? (queue[0] ?? null) : null;

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

  const add = async (path: string, newCards: NewCard[], done: string) => {
    setAdding(true);
    setProblem(null);
    try {
      await onAddCards(path, newCards);
      setNotice(done);
      setReloads((count) => count + 1);
      return true;
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "The cards could not be saved.");
      return false;
    } finally {
      setAdding(false);
    }
  };

  const addOne = async () => {
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) return;
    const label = deckOptions.find((option) => option.path === deck)?.label ?? deck;
    if (await add(deck, [{ question: q, answer: a }], `Added a card to ${label}.`)) {
      setQuestion("");
      setAnswer("");
    }
  };

  const addSuggested = async () => {
    if (!currentNote || ticked.length === 0) return;
    await add(
      currentNote.path,
      ticked.map(({ question: q, answer: a }) => ({ question: q, answer: a })),
      `Added ${plural(ticked.length, "card")} to ${currentNote.title}.`,
    );
  };

  // Space or Enter shows the answer; 1–4 grade it. Only while studying.
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

  const section = "rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4";
  const heading = "text-[13px] font-semibold text-[var(--fl-text)]";

  return (
    <Dialog
      title="Flashcards"
      subtitle="Turn what is in your notes into things you remember"
      onClose={onClose}
      wide
      steady
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-[13px]">
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

        {/* ── Studying ───────────────────────────────────────────────────── */}
        {load.kind === "ready" && session && (
          <>
            <div className="flex items-center gap-2 text-[12px] text-[var(--fl-muted)]">
              <button
                type="button"
                onClick={() => setSession(null)}
                className="rounded-lg border border-[var(--fl-border)] px-2 py-1 hover:text-[var(--fl-text)]"
              >
                ← Back to flashcards
              </button>
              <span>
                {session.practising ? "Practising ahead · " : ""}
                {card ? `${queue.length} left · ${reviewed} reviewed` : null}
              </span>
            </div>

            {card ? (
              <>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[var(--fl-elevated)]"
                  aria-hidden="true"
                >
                  <div
                    className="h-full bg-[var(--fl-accent)] transition-all"
                    style={{
                      width: `${Math.min(100, (reviewed / Math.max(1, reviewed + queue.length)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[11.5px] text-[var(--fl-muted)]">
                  {schedule.has(card.id) ? "Review" : "New card"}
                  {card.kind === "cloze"
                    ? " · fill in the blank"
                    : card.kind === "reversed"
                      ? " · reversed"
                      : ""}{" "}
                  · from{" "}
                  <button
                    type="button"
                    onClick={() => onOpenNote(card.path)}
                    className="underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                  >
                    {card.noteTitle}
                  </button>
                </p>

                <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-6 text-center">
                  <p className="whitespace-pre-line text-[18px] font-medium text-[var(--fl-text)]">
                    {card.question}
                  </p>
                  {revealed ? (
                    <p
                      aria-live="polite"
                      className="mt-4 whitespace-pre-line border-t border-[var(--fl-border)] pt-4 text-[16px] text-[var(--fl-text)]"
                    >
                      {card.answer}
                    </p>
                  ) : (
                    <p className="mt-4 text-[12px] text-[var(--fl-muted)]">
                      Try to remember the answer, then show it.
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
                  <>
                    <p className="text-center text-[12px] text-[var(--fl-muted)]">
                      How well did you know it? It comes back sooner the less you knew it.
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {GRADES.map((entry) => (
                        <button
                          key={entry.grade}
                          type="button"
                          onClick={() => grade(entry.grade)}
                          className="rounded-lg border border-[var(--fl-border)] px-2 py-2 text-[12.5px] font-medium text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
                        >
                          {entry.label}
                          <span className="block text-[11px] font-normal text-[var(--fl-muted)]">
                            {entry.means} · again in{" "}
                            {entry.grade === "again"
                              ? "this session"
                              : gap(
                                  review(schedule.get(card.id), entry.grade, today).interval,
                                )}{" "}
                            · {entry.key}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className={`${section} text-center`}>
                <p className="text-[15px] font-medium text-[var(--fl-text)]">
                  Done — {plural(reviewed, "card")} reviewed.
                </p>
                <p className="mt-1 text-[var(--fl-muted)]">
                  {upcoming
                    ? `The next card is due on ${upcoming}.`
                    : "Everything is reviewed for now."}
                </p>
                <button
                  type="button"
                  onClick={() => setSession(null)}
                  className="fl-btn fl-btn-primary mt-3"
                >
                  Back to flashcards
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Home ──────────────────────────────────────────────────────── */}
        {load.kind === "ready" && !session && (
          <>
            {notice && (
              <p role="status" className="text-[var(--fl-accent)]">
                {notice}
              </p>
            )}

            <div className={`${section} flex flex-wrap items-center gap-3`}>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-[var(--fl-text)]">
                  {studyCount > 0
                    ? `${plural(studyCount, "card")} to study today`
                    : cards.length > 0
                      ? "Nothing to study today"
                      : "No flashcards yet"}
                </p>
                <p className="mt-0.5 text-[12.5px] text-[var(--fl-muted)]">
                  {plural(dueCount, "review")} due · {newCount} new · {cards.length} in total
                  {studyCount === 0 && upcoming ? ` · next review on ${upcoming}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={studyCount === 0}
                onClick={() => start(null)}
                className="fl-btn fl-btn-primary disabled:opacity-50"
              >
                {studyCount > 0 ? `Study ${plural(studyCount, "card")}` : "All caught up"}
              </button>
            </div>

            <details open={cards.length === 0} className={section}>
              <summary className={`${heading} cursor-pointer`}>How flashcards work</summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed text-[var(--fl-muted)]">
                <li>
                  <strong className="text-[var(--fl-text)]">Make a card</strong> — a question and
                  its answer. Add one below, tick the ones found in your note, or write{" "}
                  <code>Question :: Answer</code> on its own line in any note.
                </li>
                <li>
                  <strong className="text-[var(--fl-text)]">Study</strong> — you see the question,
                  try to remember, then show the answer.
                </li>
                <li>
                  <strong className="text-[var(--fl-text)]">Say how well you knew it</strong> — a
                  card you knew comes back in days, then weeks, then months; one you forgot comes
                  back today. A few minutes a day, and you keep what you learn. That is spaced
                  repetition.
                </li>
              </ol>
            </details>

            <form
              className={section}
              onSubmit={(event) => {
                event.preventDefault();
                void addOne();
              }}
            >
              <p className={heading}>Add a card</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11.5px] text-[var(--fl-muted)]">Question</span>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="What is the capital of Portugal?"
                    aria-label="Question"
                    className={field}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11.5px] text-[var(--fl-muted)]">Answer</span>
                  <textarea
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Lisbon"
                    aria-label="Answer"
                    rows={1}
                    className={`${field} resize-y`}
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[12px] text-[var(--fl-muted)]">
                  Save to
                  <select
                    value={deck}
                    onChange={(event) => setDeckChoice(event.target.value)}
                    aria-label="Save to"
                    className={`${field} w-auto py-1`}
                  >
                    {deckOptions.map((option) => (
                      <option key={option.path} value={option.path}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={adding || !question.trim() || !answer.trim()}
                  className="fl-btn fl-btn-primary ml-auto disabled:opacity-50"
                >
                  Add card
                </button>
              </div>
            </form>

            {currentNote && (
              <div className={section}>
                <p className={heading}>Cards from “{currentNote.title}”</p>
                {suggestions.length === 0 ? (
                  <p className="mt-1 leading-relaxed text-[var(--fl-muted)]">
                    No definitions found in this note. Write a term in bold with its meaning —{" "}
                    <code>**Osmosis**: water moving across a membrane</code> — or a heading that
                    asks a question, and cards will be suggested here.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-[var(--fl-muted)]">
                      Found in the note. Untick any you do not want.
                    </p>
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                      {suggestions.map((suggestion) => (
                        <li key={suggestion.question}>
                          <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-[var(--fl-elevated)]">
                            <input
                              type="checkbox"
                              checked={!unticked.has(suggestion.question)}
                              onChange={() =>
                                setUnticked((current) => {
                                  const next = new Set(current);
                                  if (next.has(suggestion.question))
                                    next.delete(suggestion.question);
                                  else next.add(suggestion.question);
                                  return next;
                                })
                              }
                              className="mt-0.5 accent-[var(--fl-accent)]"
                            />
                            <span className="min-w-0">
                              <span className="font-medium text-[var(--fl-text)]">
                                {suggestion.question}
                              </span>
                              <span className="block truncate text-[12px] text-[var(--fl-muted)]">
                                {suggestion.answer}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={adding || ticked.length === 0}
                      onClick={() => void addSuggested()}
                      className="fl-btn fl-btn-primary mt-2 disabled:opacity-50"
                    >
                      Add {plural(ticked.length, "card")} to this note
                    </button>
                  </>
                )}
              </div>
            )}

            {decks.length > 0 && (
              <div className={section}>
                <p className={heading}>Decks</p>
                <p className="mt-0.5 text-[12px] text-[var(--fl-muted)]">
                  Every note with cards in it is a deck.
                </p>
                <ul className="mt-2 divide-y divide-[var(--fl-border)]">
                  {decks.map((each) => {
                    const deckDue = dueCards(each.cards, schedule, today, NEW_PER_SESSION).length;
                    return (
                      <li key={each.path} className="flex items-center gap-2 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-[var(--fl-text)]">
                            {each.title}
                          </span>
                          <span className="text-[11.5px] text-[var(--fl-muted)]">
                            {plural(each.cards.length, "card")}
                            {deckDue > 0 ? ` · ${deckDue} to study` : " · all reviewed"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => start(each.path)}
                          aria-label={`${deckDue > 0 ? "Study" : "Practise"} ${each.title}`}
                          className="rounded-lg border border-[var(--fl-border)] px-2.5 py-1 text-[12px] text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
                        >
                          {deckDue > 0 ? "Study" : "Practise"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenNote(each.path)}
                          aria-label={`Open ${each.title}`}
                          className="rounded-lg px-2 py-1 text-[12px] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                        >
                          Open
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
