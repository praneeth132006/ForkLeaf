import { parseDocument, stripExtension } from "@forkleaf/markdown-engine";
import type { NoteFrontmatter } from "@forkleaf/types";

/**
 * Note templates, and the note for today.
 *
 * A template is an ordinary markdown file in `templates/` — no settings page,
 * no hidden store. It is in the repository, so it syncs to every device, it
 * has history, and anybody can edit one with any tool. The placeholders are the
 * `{{date}}` spelling most note tools already share.
 *
 * Today's note is a file named for the date in `journal/`, made from
 * `templates/daily.md` when there is one.
 */

export const TEMPLATE_FOLDER = "templates";
export const JOURNAL_FOLDER = "journal";
export const DAILY_TEMPLATE = `${TEMPLATE_FOLDER}/daily.md`;

export interface Template {
  path: string;
  /** The filename without its extension, which is what people call it. */
  name: string;
}

export function isTemplatePath(path: string): boolean {
  return path.startsWith(`${TEMPLATE_FOLDER}/`);
}

export function templatesIn(paths: readonly string[]): Template[] {
  return paths
    .filter((path) => isTemplatePath(path) && /\.mdx?$/i.test(path))
    .map((path) => ({ path, name: stripExtension(path.split("/").pop() ?? path) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM-DD` in the writer's own time zone — today is where they are. */
export function dateStamp(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shiftDays(now: Date, days: number): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + days);
  return next;
}

export function dailyNotePath(now: Date): string {
  return `${JOURNAL_FOLDER}/${dateStamp(now)}.md`;
}

/**
 * Fills `{{title}}`, `{{date}}`, `{{time}}`, `{{weekday}}`, `{{yesterday}}` and
 * `{{tomorrow}}`. Anything else in braces is left exactly as written, because
 * it may be somebody's own syntax rather than a placeholder of ours.
 */
export function fillTemplate(text: string, values: { title: string; now: Date }): string {
  const { now } = values;
  const known: Record<string, string> = {
    title: values.title,
    date: dateStamp(now),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
    yesterday: dateStamp(shiftDays(now, -1)),
    tomorrow: dateStamp(shiftDays(now, 1)),
  };

  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => known[name] ?? whole);
}

/** Fields the new note must own rather than inherit from the template file. */
const OWN_FIELDS = ["title", "created", "updated"];

/**
 * A new note's body and properties, from a template file's raw text.
 *
 * The template's own title and dates are dropped: they describe the template,
 * and inheriting them would give every meeting note the same creation date.
 */
export function noteFromTemplate(
  raw: string,
  values: { title: string; now: Date },
): { content: string; frontmatter: NoteFrontmatter } {
  const parsed = parseDocument(fillTemplate(raw, values));
  const frontmatter = Object.fromEntries(
    Object.entries(parsed.frontmatter).filter(([key]) => !OWN_FIELDS.includes(key)),
  );
  return { content: parsed.content.replace(/^\n+/, ""), frontmatter };
}

/** Today's note when nobody has written a `templates/daily.md`. */
export function defaultDailyNote(now: Date): string {
  const long = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // No empty `- [ ]` under To do: the rich editor reads a box with nothing
  // after it as a bullet whose text is "[ ]", and writes it back escaped.
  return `# ${long}\n\n## To do\n\n## Notes\n\n`;
}
