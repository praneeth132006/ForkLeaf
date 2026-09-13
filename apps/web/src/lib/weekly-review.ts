import { countWords, stripExtension } from "@forkleaf/markdown-engine";
import { findTasks } from "@/lib/tasks";
import { dateStamp, isTemplatePath, JOURNAL_FOLDER } from "@/lib/templates";

/**
 * A week of the notebook, written down as a note.
 *
 * What was started, what was worked on, what went, and what is waiting — read
 * from the notes themselves, so it works offline and on a notebook with no
 * repository behind it. The result is an ordinary note in `journal/`, with
 * links to everything it mentions and a heading left empty for the part only
 * a person can write.
 */

export interface WeekSource {
  path: string;
  title: string;
  content: string;
  /** From the note's `created` property, when it has one. */
  created: string | null;
  /** When it was last saved. */
  updatedAt: string | null;
}

export interface WeekTask {
  path: string;
  title: string;
  text: string;
  due: string;
}

/** A note the notebook check flagged, and what it needs. */
export interface StaleEntry {
  path: string;
  title: string;
  reason: string;
}

/** The parts of a notebook-check finding the review reads. */
export interface StaleFinding {
  path: string;
  title: string;
  verdict: string;
  reasons: string[];
  missingFiles: string[];
  missingLinks: string[];
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * What the notebook check found, as one line per note.
 *
 * Broken references are said plainly — they are facts. A note that has only
 * aged is included when the check thinks it is likely out of date, with the
 * check's own first reason, and left out when it is merely worth a glance: a
 * weekly list that grows every week is a list nobody reads.
 */
export function staleEntries(findings: readonly StaleFinding[]): StaleEntry[] {
  return findings.flatMap((finding) => {
    const parts: string[] = [];
    if (finding.missingFiles.length > 0) {
      parts.push(
        `points at ${plural(finding.missingFiles.length, "missing file", "missing files")}`,
      );
    }
    if (finding.missingLinks.length > 0) {
      parts.push(
        plural(
          finding.missingLinks.length,
          "link to a note that does not exist",
          "links to notes that do not exist",
        ),
      );
    }
    if (parts.length === 0 && finding.verdict === "likely-stale") {
      parts.push(finding.reasons[0]?.replace(/\.$/, "") ?? "may be out of date");
    }
    return parts.length > 0
      ? [{ path: finding.path, title: finding.title, reason: parts.join("; ") }]
      : [];
  });
}

export interface WeekSummary {
  year: number;
  week: number;
  /** `YYYY-MM-DD` of the Monday the week starts on. */
  start: string;
  /** `YYYY-MM-DD` of today. */
  end: string;
  created: WeekSource[];
  edited: WeekSource[];
  deleted: string[];
  /** Words in the notes started this week. */
  words: number;
  overdue: WeekTask[];
  comingUp: WeekTask[];
  /** Notes the notebook check flagged, broken references first. */
  stale: StaleEntry[];
}

/** ISO 8601 week: weeks start on Monday, week 1 holds the year's first Thursday. */
export function isoWeek(now: Date): { year: number; week: number; monday: Date } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = (day.getDay() + 6) % 7; // Monday is 0
  const monday = new Date(day);
  monday.setDate(day.getDate() - weekday);

  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const year = thursday.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const firstMonday = new Date(firstThursday);
  firstMonday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7));
  const week = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1;

  return { year, week, monday };
}

export function weeklyReviewTitle(now: Date): string {
  const { year, week } = isoWeek(now);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function weeklyReviewPath(now: Date): string {
  return `${JOURNAL_FOLDER}/${weeklyReviewTitle(now).toLowerCase()}.md`;
}

/** Not the week's own business: templates, earlier reviews, the flashcard schedule. */
function counts(path: string): boolean {
  return (
    !isTemplatePath(path) &&
    !/^journal\/\d{4}-w\d{2}\.md$/i.test(path) &&
    !path.startsWith("reviews/")
  );
}

export function summariseWeek(
  notes: readonly WeekSource[],
  now: Date,
  deleted: readonly string[] = [],
  stale: readonly StaleEntry[] = [],
): WeekSummary {
  const { year, week, monday } = isoWeek(now);
  const start = dateStamp(monday);
  const end = dateStamp(now);
  const inWeek = (iso: string | null) => {
    if (!iso) return false;
    const parsed = new Date(iso);
    return !Number.isNaN(parsed.getTime()) && parsed >= monday && parsed <= now;
  };

  const eligible = notes.filter((note) => counts(note.path));
  const created = eligible.filter((note) => inWeek(note.created));
  const createdPaths = new Set(created.map((note) => note.path));
  const edited = eligible.filter((note) => !createdPaths.has(note.path) && inWeek(note.updatedAt));

  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);
  const horizon = dateStamp(nextWeek);

  const overdue: WeekTask[] = [];
  const comingUp: WeekTask[] = [];
  for (const note of eligible) {
    for (const task of findTasks(note.content)) {
      if (task.done || !task.due) continue;
      const entry = { path: note.path, title: note.title, text: task.text, due: task.due };
      if (task.due < end) overdue.push(entry);
      else if (task.due <= horizon) comingUp.push(entry);
    }
  }
  const byDue = (a: WeekTask, b: WeekTask) =>
    a.due.localeCompare(b.due) || a.text.localeCompare(b.text);

  const byTitle = (a: WeekSource, b: WeekSource) => a.title.localeCompare(b.title);
  return {
    year,
    week,
    start,
    end,
    created: created.sort(byTitle),
    edited: edited.sort(byTitle),
    deleted: deleted.filter(counts).sort((a, b) => a.localeCompare(b)),
    words: created.reduce((sum, note) => sum + countWords(note.content), 0),
    overdue: overdue.sort(byDue),
    comingUp: comingUp.sort(byDue),
    stale: stale.slice(0, 8),
  };
}

const link = (path: string, title: string) =>
  `[[${stripExtension(path)}|${title.replace(/[|\]]/g, "")}]]`;

function longDate(stamp: string): string {
  const [year, month, day] = stamp.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

/**
 * The review as markdown.
 *
 * Tasks are copied as plain bullets, never as `- [ ]` boxes: a box here would
 * be a second copy of a to-do that already lives in its own note, and would
 * show up twice in the list of open ones.
 */
export function formatWeeklyReview(summary: WeekSummary): string {
  const lines: string[] = [
    `# Week ${summary.week}, ${summary.year}`,
    "",
    `${longDate(summary.start)} – ${longDate(summary.end)}.`,
    "",
  ];

  const nothing = "Nothing this week.";
  const section = (heading: string, items: string[]) => {
    lines.push(`## ${heading}`, "", ...(items.length ? items : [nothing]), "");
  };

  const wordLine =
    summary.created.length > 0
      ? `${summary.created.length} new note${summary.created.length === 1 ? "" : "s"}, ${summary.words} word${summary.words === 1 ? "" : "s"}.`
      : "";
  lines.push("## Started", "");
  if (summary.created.length > 0) {
    lines.push(wordLine, "", ...summary.created.map((note) => `- ${link(note.path, note.title)}`));
  } else {
    lines.push(nothing);
  }
  lines.push("");

  section(
    "Worked on",
    summary.edited.map((note) => `- ${link(note.path, note.title)}`),
  );
  if (summary.deleted.length > 0)
    section(
      "Deleted",
      summary.deleted.map((path) => `- ${path}`),
    );
  section(
    "Overdue",
    summary.overdue.map((task) => `- ${task.text} — ${link(task.path, task.title)}`),
  );
  section(
    "Coming up",
    summary.comingUp.map((task) => `- ${task.text} — ${link(task.path, task.title)}`),
  );
  if (summary.stale.length > 0) {
    section(
      "Worth a look",
      summary.stale.map((entry) => `- ${link(entry.path, entry.title)} — ${entry.reason}`),
    );
  }
  lines.push("## Looking back", "", "");

  return lines.join("\n");
}
