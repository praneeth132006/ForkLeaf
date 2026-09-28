/**
 * Which revision of a note to hold up against today's.
 *
 * "What did I think about this a year ago?" is the question a notebook kept
 * in git can answer and almost no notes app can. The answer is the version
 * that was current on that day: the newest commit made on or before it.
 *
 * A note younger than the span asked for has no version from then, and saying
 * "nothing" would waste the question — so its first version is offered
 * instead, labelled as what it is. The same when the history listing stops
 * short of the date: the oldest revision there is, said plainly.
 */

export type Span = "month" | "half-year" | "year";

export const SPANS: { span: Span; label: string }[] = [
  { span: "month", label: "A month ago" },
  { span: "half-year", label: "Six months ago" },
  { span: "year", label: "A year ago" },
];

export interface Revision {
  sha: string;
  /** ISO timestamp. */
  date: string;
}

export interface Pick<T extends Revision> {
  revision: T;
  /** True when it is from the day asked for; false when it is the oldest there was. */
  exact: boolean;
}

/** `YYYY-MM-DD`, `span` before `today`. */
export function spanBefore(today: string, span: Span): string {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const months = span === "month" ? 1 : span === "half-year" ? 6 : 12;
  const target = new Date(Date.UTC(year, month - 1 - months, day));
  // 31 March minus a month is 3 March in Date arithmetic; the last day of
  // February is what a person means.
  if (target.getUTCDate() !== day) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** `commits` newest first, as the history listing returns them. */
export function revisionOn<T extends Revision>(commits: readonly T[], day: string): Pick<T> | null {
  if (commits.length === 0) return null;
  const found = commits.find((commit) => commit.date.slice(0, 10) <= day);
  if (found) return { revision: found, exact: true };
  return { revision: commits[commits.length - 1]!, exact: false };
}

/** "3 months", "1 year", "12 days" — how long before `today` a date was. */
export function ageOf(date: string, today: string): string {
  const [y1, m1, d1] = date.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = today.split("-").map(Number) as [number, number, number];
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (days < 45) return plural(Math.max(days, 0), "day");
  if (days < 365) return plural(Math.round(days / 30.4), "month");
  return plural(Math.round(days / 365), "year");
}

const words = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** What changed, in the terms a reader cares about: words and whole paragraphs. */
export function growth(then: string, now: string) {
  const paragraphs = (text: string) =>
    new Set(
      text
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean),
    );
  const before = paragraphs(then);
  const after = paragraphs(now);
  return {
    wordsThen: words(then),
    wordsNow: words(now),
    newParagraphs: [...after].filter((block) => !before.has(block)).length,
    goneParagraphs: [...before].filter((block) => !after.has(block)).length,
  };
}
