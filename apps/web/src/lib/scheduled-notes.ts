import { joinPath, slugifyFilename } from "@forkleaf/markdown-engine";
import { dateStamp, fillTemplate } from "@/lib/templates";

/**
 * Notes that write themselves on a schedule.
 *
 * A template in `templates/` with a `schedule` property is made into a note
 * when its time comes round: the Monday planning page on Mondays, the monthly
 * review on the first visit of the month, the standup every day. The note is
 * made the first time ForkLeaf is open in that period, and only for the
 * current period — a notebook left alone for a month does not come back to
 * thirty empty standups.
 *
 * Three properties on the template say how, and are not copied to the note:
 *
 * - `schedule`: `daily`, `weekdays`, `weekly` (Mondays), `monthly`, or a day
 *   of the week — `friday`.
 * - `folder`: where the notes go. `journal` unless it says otherwise.
 * - `name`: the title, with the template's `{{date}}`-style placeholders and
 *   `{{week}}` / `{{month}}`. The template's name and the date unless given.
 */

export type Schedule =
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Properties that steer the schedule, never copied onto the notes it makes. */
export const SCHEDULE_FIELDS = ["schedule", "folder", "name"];

export function readSchedule(value: unknown): Schedule | null {
  if (typeof value !== "string") return null;
  const wanted = value.trim().toLowerCase();
  return (
    ["daily", "weekdays", "weekly", "monthly", ...WEEKDAYS].includes(wanted) ? wanted : null
  ) as Schedule | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO week, `2026-W40`: the week a Monday-to-Sunday calendar gives the day. */
export function isoWeek(now: Date): string {
  const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${pad(week)}`;
}

/** Whether a schedule makes a note today. */
export function dueToday(schedule: Schedule, now: Date): boolean {
  const weekday = now.getDay();
  switch (schedule) {
    case "daily":
    case "weekly":
    case "monthly":
      // Made on the first visit of the day, week or month: a note already
      // made for this period is found by its name and not made again.
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    default:
      return WEEKDAYS[weekday] === schedule;
  }
}

/** The part of a note's name that says which period it is for. */
function periodOf(schedule: Schedule, now: Date): string {
  if (schedule === "weekly") return isoWeek(now);
  if (schedule === "monthly") return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  return dateStamp(now);
}

export interface ScheduledNote {
  title: string;
  folder: string;
  path: string;
}

/**
 * The note a template is due to make today, or null when it is not.
 * `path` is where it will be, so a note already made is recognised.
 */
export function scheduledNote(
  template: { name: string; frontmatter: Record<string, unknown> },
  now: Date,
): ScheduledNote | null {
  const schedule = readSchedule(template.frontmatter.schedule);
  if (!schedule || !dueToday(schedule, now)) return null;

  const period = periodOf(schedule, now);
  const pattern =
    typeof template.frontmatter.name === "string" && template.frontmatter.name.trim()
      ? template.frontmatter.name.trim()
      : `${template.name} ${period}`;
  const title = fillTemplate(
    pattern
      .replace(/\{\{\s*week\s*\}\}/g, isoWeek(now))
      .replace(/\{\{\s*month\s*\}\}/g, periodOf("monthly", now)),
    { title: template.name, now },
  ).trim();

  const rawFolder =
    typeof template.frontmatter.folder === "string" ? template.frontmatter.folder : "journal";
  const folder = rawFolder.replace(/^\/+|\/+$/g, "");
  return { title, folder, path: joinPath(folder, `${slugifyFilename(title)}.md`) };
}
