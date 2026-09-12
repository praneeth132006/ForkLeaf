import { dateStamp } from "@/lib/templates";

/**
 * Which notes have gone, found by comparing the notebook with itself.
 *
 * Git keeps every deleted file; what nobody has is a list of them. The file
 * list on an earlier day, minus the file list now, is exactly that list — no
 * walking the commit log one deletion at a time, and no new server route,
 * because reading the notebook on a day is something the time machine already
 * does.
 *
 * A note renamed rather than deleted also disappears from its old path. When a
 * file with the same name has appeared since, that is said, so nobody restores
 * a second copy of a note they only moved.
 */

export interface DeletedNote {
  path: string;
  /** A file with the same name that is new since, when there is exactly one. */
  movedTo: string | null;
}

const NOTE = /\.mdx?$/i;
const baseName = (path: string) => (path.split("/").pop() ?? path).toLowerCase();

export function deletedSince(before: readonly string[], current: readonly string[]): DeletedNote[] {
  const now = new Set(current);
  const then = new Set(before);

  const arrivals = new Map<string, string[]>();
  for (const path of current) {
    if (then.has(path)) continue;
    const name = baseName(path);
    arrivals.set(name, [...(arrivals.get(name) ?? []), path]);
  }

  return before
    .filter((path) => NOTE.test(path) && !now.has(path))
    .sort((a, b) => a.localeCompare(b))
    .map((path) => {
      const candidates = arrivals.get(baseName(path)) ?? [];
      return { path, movedTo: candidates.length === 1 ? candidates[0]! : null };
    });
}

/** The `YYYY-MM-DD` a number of days before `now`, in local time. */
export function daysBefore(now: Date, days: number): string {
  const then = new Date(now);
  then.setDate(then.getDate() - days);
  return dateStamp(then);
}
