/**
 * Which notes have probably gone off.
 *
 * A notebook accumulates pages that were true once. A page pinning `nmap 7.80`
 * and a CVE from two years ago is not wrong in any way a spell-checker could
 * see — it is wrong because the world moved and the page did not. Nothing in
 * the file says so, so you find out by acting on it.
 *
 * What this can honestly do, and what it cannot, are worth being exact about.
 * It cannot know that a version moved on: that would mean querying every
 * package registry and CVE feed in the world, and being wrong about the ones
 * it guessed. What it can do is notice that a note is *the kind of note that
 * goes stale* — one making specific, datable, checkable claims — and weigh
 * that against how long since anybody touched it.
 *
 * So the verdict is never "this is wrong". It is "this is worth re-reading,
 * and here is exactly why I think so", with the reasons shown so a reader can
 * disagree in one glance. A staleness checker that cried wolf would get turned
 * off in a week, which is why the wording is hedged and the thresholds are not
 * eager.
 */

/** The kinds of claim that expire. */
export type PerishableKind =
  /** A pinned version: `7.80`, `v1.2.3`, `Python 3.11`. */
  | "version"
  /** A published vulnerability, which by definition has a fix by now. */
  | "cve"
  /** A date written into the prose. */
  | "date"
  /** "as of", "currently", "at the time of writing" — a claim about *now*. */
  | "hedge";

export interface PerishableMention {
  kind: PerishableKind;
  /** Exactly as written, so the reader recognises it in their own note. */
  text: string;
  start: number;
  end: number;
}

/**
 * Version numbers, needing at least two components.
 *
 * A bare `v1` matches chapter headings, list items and the letter v followed
 * by a number, none of which expire. Two components is where a string starts
 * meaning a specific release.
 */
const VERSION_RE = /\bv?\d+\.\d+(?:\.\d+)*(?:-[A-Za-z0-9.]+)?\b/g;

/** `CVE-2024-3094`, in any case. */
const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi;

/** ISO dates and the written forms people actually use in notes. */
const DATE_RE =
  /\b(?:\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/gi;

/**
 * Phrases that stake a claim on the present tense.
 *
 * These are the sentences that quietly become false: not because the fact
 * changed, but because "currently" kept meaning the day it was written while
 * the reader assumed it meant today.
 */
const HEDGE_RE =
  /\b(?:as of (?:today|now|this writing|writing)?|at the time of writing|currently|at present|right now|the latest|newest version|most recent|for now|these days|nowadays)\b/gi;

/** Everything in a note that has a shelf life. */
export function findPerishable(content: string): PerishableMention[] {
  const found: PerishableMention[] = [];

  const scan = (re: RegExp, kind: PerishableKind) => {
    re.lastIndex = 0;
    for (const match of content.matchAll(re)) {
      if (match.index === undefined) continue;
      found.push({
        kind,
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  };

  // CVEs first: `CVE-2024-3094` contains no version, but a date pattern could
  // otherwise claim part of one, and the more specific reading should win.
  scan(CVE_RE, "cve");
  scan(DATE_RE, "date");
  scan(VERSION_RE, "version");
  scan(HEDGE_RE, "hedge");

  // Overlaps resolved in favour of whichever started first, then whichever is
  // longer — so a reader never sees the same span reported twice under two
  // names.
  const ordered = found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: PerishableMention[] = [];

  for (const mention of ordered) {
    const previous = kept[kept.length - 1];
    if (previous && mention.start < previous.end) continue;
    kept.push(mention);
  }

  return kept;
}

export type DecayVerdict =
  /** Nothing here expires, or it was checked recently enough not to matter. */
  | "fresh"
  /** Perishable, and old enough to be worth a look. */
  | "worth-checking"
  /** Full of datable claims and untouched for a long time. */
  | "likely-stale"
  /** Never edited here, so there is no age to reason from. */
  | "unknown";

export interface DecayReport {
  mentions: PerishableMention[];
  /** Mentions by kind, for a one-line summary. */
  counts: Record<PerishableKind, number>;
  /** Whole months since the note was last touched, or null. */
  ageMonths: number | null;
  verdict: DecayVerdict;
  /** Why, in sentences a reader can disagree with. */
  reasons: string[];
}

/** Months, rounded down — the unit anyone thinks about note staleness in. */
function monthsBetween(then: number, now: number): number {
  return Math.max(0, Math.floor((now - then) / (30.44 * 24 * 60 * 60 * 1000)));
}

/** "1 month", "7 months" — the count and its unit, agreeing. */
function months(count: number): string {
  return `${count} month${count === 1 ? "" : "s"}`;
}

export interface DecayOptions {
  /** When the note was last edited. Null for one never touched here. */
  updatedAt?: string | null;
  now?: number;
  /**
   * Files this note links to that have changed since it described them.
   *
   * The one hard signal available: not a guess about the world, but a fact
   * about this repository. It outranks every heuristic below.
   */
  changedFiles?: readonly string[];
}

/** Below this, a note is too recent for its contents to matter. */
const YOUNG_MONTHS = 6;

/** Beyond this, even a lightly perishable note is worth re-reading. */
const OLD_MONTHS = 18;

/** Perishable mentions before a note counts as making a lot of claims. */
const MANY_MENTIONS = 4;

/**
 * Weighs what a note claims against how long since anyone checked.
 *
 * Deliberately unwilling to say much. A note with no datable claims is never
 * called stale however old it is — prose about how you think does not expire —
 * and a note edited last month is left alone however many versions it pins.
 */
export function assessDecay(content: string, options: DecayOptions = {}): DecayReport {
  const mentions = findPerishable(content);
  const counts: Record<PerishableKind, number> = { version: 0, cve: 0, date: 0, hedge: 0 };
  for (const mention of mentions) counts[mention.kind] += 1;

  const now = options.now ?? Date.now();
  const then = options.updatedAt ? new Date(options.updatedAt).getTime() : NaN;
  const ageMonths = Number.isNaN(then) ? null : monthsBetween(then, now);

  const reasons: string[] = [];
  const changed = options.changedFiles ?? [];

  // The only fact in here. Everything below it is inference.
  if (changed.length > 0) {
    reasons.push(
      changed.length === 1
        ? `${changed[0]} has changed since this note described it.`
        : `${changed.length} files this note links to have changed since it described them.`,
    );
  }

  const describe = () => {
    const parts: string[] = [];
    if (counts.cve > 0) parts.push(`${counts.cve} CVE${counts.cve === 1 ? "" : "s"}`);
    if (counts.version > 0)
      parts.push(`${counts.version} version number${counts.version === 1 ? "" : "s"}`);
    if (counts.date > 0) parts.push(`${counts.date} date${counts.date === 1 ? "" : "s"}`);
    if (counts.hedge > 0)
      parts.push(`${counts.hedge} claim${counts.hedge === 1 ? "" : "s"} about "now"`);
    return parts.join(", ");
  };

  if (changed.length > 0) {
    return { mentions, counts, ageMonths, verdict: "likely-stale", reasons };
  }

  if (mentions.length === 0) {
    reasons.push("Nothing in this note has a shelf life.");
    return { mentions, counts, ageMonths, verdict: "fresh", reasons };
  }

  if (ageMonths === null) {
    reasons.push(`It names ${describe()}, but nothing here knows when it was last checked.`);
    return { mentions, counts, ageMonths, verdict: "unknown", reasons };
  }

  if (ageMonths < YOUNG_MONTHS) {
    reasons.push(`It names ${describe()}, but it was edited ${months(ageMonths)} ago.`);
    return { mentions, counts, ageMonths, verdict: "fresh", reasons };
  }

  const heavy = mentions.length >= MANY_MENTIONS || counts.cve > 0;

  if (ageMonths >= OLD_MONTHS && heavy) {
    reasons.push(`It names ${describe()} and has not been touched in ${months(ageMonths)}.`);
    return { mentions, counts, ageMonths, verdict: "likely-stale", reasons };
  }

  reasons.push(`It names ${describe()} and was last edited ${months(ageMonths)} ago.`);
  return { mentions, counts, ageMonths, verdict: "worth-checking", reasons };
}
