/**
 * Which days flashcards were studied, and how many cards each day.
 *
 * Spaced repetition works only if you come back, and the most reliable nudge
 * to come back is seeing the run you would break. So each grade adds one to
 * today's row in `reviews/study-log.md` — a markdown table beside the schedule,
 * in the repository, synced like everything else — and the Flashcards overview
 * draws it as a streak and a year-style grid of days.
 *
 * A file of its own rather than more rows in the schedule: the schedule is
 * rewritten whole by several writers that know nothing about days, and a log
 * living inside it would be dropped by the first of them.
 */

export const STUDY_LOG_PATH = "reviews/study-log.md";

export type StudyLog = Map<string, number>;

const HEADER =
  "# Study log\n\n" +
  "Kept by ForkLeaf. One row per day flashcards were studied, with how many cards\n" +
  "were graded.\n\n" +
  "| day | cards |\n" +
  "| --- | ----- |\n";

export function parseLog(content: string | null): StudyLog {
  const log: StudyLog = new Map();
  if (!content) return log;
  for (const line of content.split("\n")) {
    const match = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d+)\s*\|/.exec(line);
    if (match) log.set(match[1]!, (log.get(match[1]!) ?? 0) + Number(match[2]));
  }
  return log;
}

export function formatLog(log: StudyLog): string {
  const rows = [...log.entries()]
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => `| ${day} | ${count} |`);
  return `${HEADER}${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

/** The log's text with `count` more cards on `day`. */
export function logReviews(content: string | null, day: string, count = 1): string {
  const log = parseLog(content);
  log.set(day, (log.get(day) ?? 0) + count);
  return formatLog(log);
}

function shift(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(year, month - 1, date + days));
  return moved.toISOString().slice(0, 10);
}

/**
 * Days in a row with at least one card studied, ending today — or yesterday,
 * so a streak is not shown as broken in the morning before today's session.
 */
export function streak(log: StudyLog, today: string): number {
  let day = (log.get(today) ?? 0) > 0 ? today : shift(today, -1);
  let run = 0;
  while ((log.get(day) ?? 0) > 0) {
    run += 1;
    day = shift(day, -1);
  }
  return run;
}

/** Cards studied in the seven days ending today. */
export function thisWeek(log: StudyLog, today: string): number {
  let total = 0;
  for (let i = 0; i < 7; i += 1) total += log.get(shift(today, -i)) ?? 0;
  return total;
}

export interface HeatDay {
  day: string;
  count: number;
  /** 0 for none, then 1–4 by how busy the day was against the busiest shown. */
  level: 0 | 1 | 2 | 3 | 4;
  /** After today: drawn empty. */
  future: boolean;
}

/**
 * Weeks of days for the grid, oldest first, each week Monday to Sunday, the
 * last one holding today.
 */
export function heatmap(log: StudyLog, today: string, weeks = 18): HeatDay[][] {
  const [year, month, date] = today.split("-").map(Number) as [number, number, number];
  const weekday = (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
  const start = shift(today, -weekday - (weeks - 1) * 7);

  let busiest = 0;
  for (let i = 0; i < weeks * 7; i += 1) busiest = Math.max(busiest, log.get(shift(start, i)) ?? 0);

  const grid: HeatDay[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const week: HeatDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = shift(start, w * 7 + d);
      const count = log.get(day) ?? 0;
      const level =
        count === 0 || busiest === 0
          ? 0
          : (Math.min(4, Math.max(1, Math.ceil((count / busiest) * 4))) as 1 | 2 | 3 | 4);
      week.push({ day, count, level, future: day > today });
    }
    grid.push(week);
  }
  return grid;
}

let pending: Promise<unknown> = Promise.resolve();

/**
 * Adds one graded card to today's row, one write at a time.
 *
 * Grading is quick — four in as many seconds is normal — and two writes that
 * both read the file before either saved it would count one card, not two.
 * Every writer in the page goes through this one queue.
 */
export function recordReview(
  store: { upsertNote: (path: string, change: (content: string) => string) => Promise<unknown> },
  day: string,
): Promise<void> {
  const next = pending.then(() =>
    store.upsertNote(STUDY_LOG_PATH, (text) => logReviews(text, day)),
  );
  pending = next.catch(() => undefined);
  return next.then(() => undefined);
}
