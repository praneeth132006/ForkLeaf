import { dateStamp } from "@/lib/templates";

/**
 * Flashcards written in notes, and when to see each one again.
 *
 * A card is one line: `Question :: Answer`. That is the spelling Obsidian's
 * spaced-repetition plugin already reads, so a note full of cards is not a
 * ForkLeaf format — and on github.com it is still a readable line of text.
 *
 * The schedule is SM-2, the algorithm most flashcard apps descend from, and
 * it is kept in `reviews/flashcards.md`: a markdown table, one row per card, in
 * the repository beside everything else. It syncs to every device, it has
 * history, and anybody curious about why a card came back today can open it.
 */

export const SCHEDULE_PATH = "reviews/flashcards.md";

export interface Card {
  /** Stable across edits to anything but the question itself. */
  id: string;
  path: string;
  noteTitle: string;
  question: string;
  answer: string;
  line: number;
}

export interface CardState {
  /** `YYYY-MM-DD` the card is next shown. */
  due: string;
  /** Days between the last review and `due`. */
  interval: number;
  /** SM-2 easiness, never below 1.3. */
  ease: number;
  /** Successful reviews in a row. */
  reps: number;
}

export type Schedule = Map<string, CardState>;
export type Grade = "again" | "hard" | "good" | "easy";

const FENCE = /^\s*(```|~~~)/;
const CARD = /^\s*(?:[-*+]\s+)?(.+?)\s+::\s+(.+?)\s*$/;

/** FNV-1a, as eight hex digits. Short, stable, and no dependency. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, "0");
}

export function cardId(path: string, question: string): string {
  return hash(`${path}\n${question.trim().toLowerCase()}`);
}

export function findCards(path: string, noteTitle: string, content: string): Card[] {
  const cards: Card[] = [];
  let fence: string | null = null;

  content.split("\n").forEach((raw, line) => {
    const fenceMatch = FENCE.exec(raw);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1]!;
      else if (fenceMatch[1] === fence) fence = null;
      return;
    }
    // A `::` in code — a C++ scope, a Haskell type — is not a card.
    if (fence !== null || raw.startsWith("    ") || raw.startsWith("\t")) return;
    // Nor is one in a table row, or a heading.
    if (/^\s*[|#]/.test(raw)) return;

    const match = CARD.exec(raw);
    if (!match) return;
    const question = match[1]!.trim();
    const answer = match[2]!.trim();
    if (!question || !answer || question.includes("`") || answer.includes("::")) return;

    cards.push({ id: cardId(path, question), path, noteTitle, question, answer, line });
  });

  return cards;
}

function addDays(today: string, days: number): string {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  return dateStamp(new Date(year, month - 1, day + days));
}

/**
 * The next state of a card after one review.
 *
 * SM-2 with the four buttons most apps have settled on. **Again** starts the
 * card over and shows it tomorrow; the others grow the gap by the card's ease,
 * which each grade nudges up or down.
 */
export function review(state: CardState | undefined, grade: Grade, today: string): CardState {
  const quality = { again: 1, hard: 3, good: 4, easy: 5 }[grade];
  const previous = state ?? { due: today, interval: 0, ease: 2.5, reps: 0 };

  const ease = Math.max(
    1.3,
    Math.round((previous.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))) * 100) / 100,
  );

  if (grade === "again") {
    return { due: addDays(today, 1), interval: 1, ease, reps: 0 };
  }

  const reps = previous.reps + 1;
  let interval: number;
  if (reps === 1) interval = grade === "easy" ? 4 : 1;
  else if (reps === 2) interval = grade === "hard" ? 3 : 6;
  else interval = Math.round(previous.interval * (grade === "hard" ? 1.2 : ease));
  if (grade === "easy" && reps > 1) interval = Math.round(interval * 1.3);
  interval = Math.max(1, interval);

  return { due: addDays(today, interval), interval, ease, reps };
}

/** Cards due today or earlier first (most overdue first), then new ones. */
export function dueCards(
  cards: readonly Card[],
  schedule: Schedule,
  today: string,
  newLimit = 20,
): Card[] {
  const due = cards
    .filter((card) => {
      const state = schedule.get(card.id);
      return state !== undefined && state.due <= today;
    })
    .sort((a, b) => schedule.get(a.id)!.due.localeCompare(schedule.get(b.id)!.due));
  const fresh = cards.filter((card) => !schedule.has(card.id)).slice(0, newLimit);
  return [...due, ...fresh];
}

/** The soonest date anything comes back, for "nothing due — next on …". */
export function nextDue(cards: readonly Card[], schedule: Schedule, today: string): string | null {
  let soonest: string | null = null;
  for (const card of cards) {
    const state = schedule.get(card.id);
    if (state && state.due > today && (!soonest || state.due < soonest)) soonest = state.due;
  }
  return soonest;
}

// ── The schedule file ─────────────────────────────────────────────────────

const HEADER =
  "# Flashcard reviews\n\n" +
  "Kept by ForkLeaf. One row per card: when it is next due, the gap in days, how\n" +
  "easy it has been, and how many times in a row it has been remembered. Delete a\n" +
  "row to start that card over.\n\n" +
  "| card | due | interval | ease | reps |\n" +
  "| ---- | --- | -------- | ---- | ---- |\n";

export function parseSchedule(content: string | null): Schedule {
  const schedule: Schedule = new Map();
  if (!content) return schedule;

  for (const line of content.split("\n")) {
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((_, i, all) => i > 0 && i < all.length - 1);
    if (cells.length < 5) continue;
    const [id, due, interval, ease, reps] = cells as [string, string, string, string, string];
    if (!/^[0-9a-f]{8}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    const parsed = { due, interval: Number(interval), ease: Number(ease), reps: Number(reps) };
    if ([parsed.interval, parsed.ease, parsed.reps].some((n) => !Number.isFinite(n))) continue;
    schedule.set(id, parsed);
  }
  return schedule;
}

export function formatSchedule(schedule: Schedule): string {
  const rows = [...schedule.entries()]
    .sort(([a, stateA], [b, stateB]) => stateA.due.localeCompare(stateB.due) || a.localeCompare(b))
    .map(
      ([id, state]) =>
        `| ${id} | ${state.due} | ${state.interval} | ${state.ease} | ${state.reps} |`,
    );
  return `${HEADER}${rows.join("\n")}${rows.length ? "\n" : ""}`;
}
