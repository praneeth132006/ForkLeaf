/**
 * FSRS: the scheduler that replaced SM-2 in Anki.
 *
 * SM-2 grows every card's gap by one "ease" number and has no notion of how
 * likely you are to remember a card on a given day. FSRS models that directly:
 * each card has a *stability* — the days until the chance of recalling it
 * falls to 90% — and a *difficulty*, and a review is scheduled for the day the
 * chance reaches the retention asked for. For the same retention that is
 * typically a fifth to a third fewer reviews than SM-2.
 *
 * This is FSRS-4.5 with its published default weights, which are fitted to
 * hundreds of millions of Anki reviews. It needs no network and no training:
 * the defaults are good for most people, and a pure function is what lets the
 * schedule stay a markdown table in the repository.
 */

export type FsrsGrade = 1 | 2 | 3 | 4;

/** FSRS-4.5 default parameters. */
export const WEIGHTS = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072,
  0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81;
/** The chance of remembering a card that a review is scheduled for. */
export const RETENTION = 0.9;
const MAX_INTERVAL = 36500;

const w = (i: number) => WEIGHTS[i]!;
const clampDifficulty = (d: number) => Math.min(10, Math.max(1, d));

/** The chance of recalling a card `elapsed` days after a review, given its stability. */
export function retrievability(elapsed: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsed)) / stability, DECAY);
}

/** Days until recall falls to the retention asked for. */
export function nextInterval(stability: number, retention = RETENTION): number {
  const days = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(days)));
}

export function initialStability(grade: FsrsGrade): number {
  return Math.max(0.1, w(grade - 1));
}

export function initialDifficulty(grade: FsrsGrade): number {
  return clampDifficulty(w(4) - (grade - 3) * w(5));
}

function nextDifficulty(difficulty: number, grade: FsrsGrade): number {
  const moved = difficulty - w(6) * (grade - 3);
  // Mean reversion towards a new card's "good" difficulty, so no card is
  // stuck at the extremes by one bad week.
  return clampDifficulty(w(7) * initialDifficulty(3) + (1 - w(7)) * moved);
}

function recalledStability(d: number, s: number, r: number, grade: FsrsGrade): number {
  const hard = grade === 2 ? w(15) : 1;
  const easy = grade === 4 ? w(16) : 1;
  return (
    s *
    (1 +
      Math.exp(w(8)) *
        (11 - d) *
        Math.pow(s, -w(9)) *
        (Math.exp(w(10) * (1 - r)) - 1) *
        hard *
        easy)
  );
}

function forgottenStability(d: number, s: number, r: number): number {
  const next =
    w(11) * Math.pow(d, -w(12)) * (Math.pow(s + 1, w(13)) - 1) * Math.exp(w(14) * (1 - r));
  // Forgetting never makes a card more stable than it was.
  return Math.min(next, s);
}

export interface Memory {
  stability: number;
  difficulty: number;
}

/**
 * A card's memory after a review, `elapsed` days after the previous one.
 * `previous` is null for a card seen for the first time.
 */
export function remember(previous: Memory | null, grade: FsrsGrade, elapsed: number): Memory {
  if (!previous) {
    return { stability: initialStability(grade), difficulty: initialDifficulty(grade) };
  }
  const r = retrievability(elapsed, previous.stability);
  const difficulty = nextDifficulty(previous.difficulty, grade);
  const stability =
    grade === 1
      ? forgottenStability(previous.difficulty, previous.stability, r)
      : recalledStability(previous.difficulty, previous.stability, r, grade);
  return { stability: Math.max(0.1, stability), difficulty };
}

/**
 * A memory for a card only ever scheduled by SM-2, so switching loses nothing.
 *
 * Its last gap is roughly how long it could be left, which is what stability
 * measures; an ease near SM-2's floor of 1.3 is a hard card and one near 3 is
 * an easy one.
 */
export function memoryFromSm2(interval: number, ease: number): Memory {
  const difficulty = clampDifficulty(11 - ((ease - 1.3) / (3 - 1.3)) * 9);
  return { stability: Math.max(0.5, interval), difficulty };
}
