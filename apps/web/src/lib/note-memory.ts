/**
 * How much of each note you probably still remember.
 *
 * Flashcards schedule single facts. Most of what a notebook holds is not
 * facts on cards but notes — an explanation, a plan, a summary of a paper —
 * and those fade too, with nothing to say so. This gives every note the same
 * treatment spaced repetition gives a card, from what the app already sees:
 * each time you open or edit a note is a review.
 *
 * The model is the forgetting curve at its simplest. Recall falls as
 * e^(−days / stability); a note visited once is stable for a few days, and
 * each visit on a later day doubles that, up to a year. Visits on the same
 * day count once — rereading a note five times in an afternoon is not five
 * reviews. It is an estimate, and says so; its job is to put the right few
 * notes in front of you, not to be exact.
 *
 * Visits are kept per device in localStorage: when you last read a note is
 * about you on this device, and syncing it would commit on every open.
 */

export const MEMORY_KEY = "forkleaf:note-memory";

/** Days a note seen once stays well remembered. */
const FIRST_STABILITY = 3;
const MAX_STABILITY = 365;
/** Notes tracked; the least recently visited are dropped past this. */
const LIMIT = 2000;

export interface Visit {
  /** `YYYY-MM-DD` of the last visit. */
  last: string;
  /** Visits on distinct days. */
  days: number;
}

export type Visits = Record<string, Visit>;

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function stability(days: number): number {
  return Math.min(MAX_STABILITY, FIRST_STABILITY * 2 ** Math.max(0, days - 1));
}

/** 0–1: the chance the note is still well remembered today. */
export function recall(visit: Visit, today: string): number {
  const elapsed = Math.max(0, daysBetween(visit.last, today));
  return Math.exp(-elapsed / stability(visit.days));
}

/** The visits with one more to `key` today. A second visit the same day changes nothing. */
export function visit(visits: Visits, key: string, today: string): Visits {
  const previous = visits[key];
  if (previous && previous.last === today) return visits;
  const next: Visits = {
    ...visits,
    [key]: { last: today, days: (previous?.days ?? 0) + 1 },
  };
  const keys = Object.keys(next);
  if (keys.length <= LIMIT) return next;
  const oldest = keys.sort((a, b) => next[a]!.last.localeCompare(next[b]!.last));
  for (const drop of oldest.slice(0, keys.length - LIMIT)) delete next[drop];
  return next;
}

export function parseVisits(raw: string | null): Visits {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Visits = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const candidate = entry as Visit;
      if (
        candidate &&
        typeof candidate.last === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(candidate.last) &&
        Number.isFinite(candidate.days) &&
        candidate.days > 0
      ) {
        out[key] = { last: candidate.last, days: Math.round(candidate.days) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function readVisits(): Visits {
  try {
    return parseVisits(window.localStorage.getItem(MEMORY_KEY));
  } catch {
    return {};
  }
}

export function recordVisit(key: string, today: string): void {
  try {
    const current = readVisits();
    const next = visit(current, key, today);
    if (next !== current) window.localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the note simply is not tracked on this device.
  }
}

export interface Fading<T> {
  item: T;
  recall: number;
  /** Days since the last visit. */
  since: number;
}

/**
 * The notes slipping away: visited on at least two days — something you meant
 * to keep, not something opened once by accident — and now below the line.
 * Least remembered first.
 */
export function fading<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  visits: Visits,
  today: string,
  { threshold = 0.5, limit = 6 } = {},
): Fading<T>[] {
  return items
    .flatMap((item) => {
      const seen = visits[keyOf(item)];
      if (!seen || seen.days < 2) return [];
      const left = recall(seen, today);
      return left < threshold ? [{ item, recall: left, since: daysBetween(seen.last, today) }] : [];
    })
    .sort((a, b) => a.recall - b.recall)
    .slice(0, limit);
}
