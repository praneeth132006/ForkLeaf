/**
 * "3d ago" for a timestamp.
 *
 * Lifted out of the history dialog when the replay panel needed the same
 * phrasing: two copies of this would drift, and a commit that reads "2h ago" in
 * one pane and "today" in the other is a bug report waiting to happen.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.round((now - then) / 1000);
  // A commit dated slightly in the future — a clock skewed by a few seconds on
  // the machine that made it — should read as recent, not as a negative age.
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(then).toLocaleDateString();
}

/**
 * The same, but null once it would just repeat a date.
 *
 * `relativeTime` falls back to an absolute date past a month, which is right
 * where it stands alone and wrong beside one: "3/12/2026 (3/12/2026)" reads as
 * a bug. Callers showing both ask for this and drop the parenthetical when
 * there is nothing left in it.
 */
export function relativeAge(iso: string, now: number = Date.now()): string | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  if (Math.round((now - then) / 1000) >= 2592000) return null;
  return relativeTime(iso, now);
}

/** "4 days", "6 weeks" — how long a stretch of time lasted. */
export function durationLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "a moment";

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return minutes <= 1 ? "a minute" : `${minutes} minutes`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours <= 1 ? "an hour" : `${hours} hours`;

  const days = Math.round(hours / 24);
  if (days < 14) return `${days} days`;

  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks`;

  // No singular case here: the weeks branch above already covers everything
  // short of two months, so `1 month` is unreachable.
  const months = Math.round(days / 30);
  if (months < 24) return `${months} months`;

  // Likewise plural-only: nothing under two years reaches this branch.
  const years = Math.round(days / 365);
  return `${years} years`;
}
