/**
 * Every unfinished to-do in the notebook, in one place.
 *
 * A `- [ ]` line is the one piece of structure people reliably put in notes,
 * and the one this app did nothing with: a to-do written in Tuesday's meeting
 * note is invisible from Wednesday's. This reads them back out.
 *
 * The syntax is GitHub's task list, and the due date is the Obsidian Tasks
 * dialect (`📅 2026-09-14`) or a plain `due: 2026-09-14` — dialects rather than
 * inventions, because these are files other tools will read. Nothing here
 * adds markup to a note; ticking a box changes exactly one character.
 */

export interface Task {
  /** Zero-based line in the note's body. */
  line: number;
  /** The words after the checkbox, as written. */
  text: string;
  done: boolean;
  /** `YYYY-MM-DD`, when the line carries a due date. */
  due: string | null;
}

export interface NoteTasks {
  path: string;
  title: string;
  tasks: Task[];
}

export interface TaskSource {
  path: string;
  title: string;
  content: string;
}

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const DUE = /(?:📅|\bdue:)\s*(\d{4}-\d{2}-\d{2})\b/u;

export function findTasks(content: string): Task[] {
  const tasks: Task[] = [];
  let fence: string | null = null;

  content.split("\n").forEach((raw, line) => {
    const fenceMatch = FENCE.exec(raw);
    if (fenceMatch) {
      // A to-do inside a code block is an example of a to-do, not one.
      if (fence === null) fence = fenceMatch[1]!;
      else if (fenceMatch[1] === fence) fence = null;
      return;
    }
    if (fence !== null) return;

    const match = TASK_LINE.exec(raw);
    if (!match) return;
    const text = match[4]!.trim();
    // `- [ ] ` with nothing after it is a template's empty slot, not a task.
    if (!text) return;

    tasks.push({
      line,
      text,
      done: match[2] !== " ",
      due: DUE.exec(text)?.[1] ?? null,
    });
  });

  return tasks;
}

/**
 * Ticks or unticks one task, or returns null when it cannot be found.
 *
 * The list was read some time before the click, and the note may have been
 * edited since. The line number is tried first, then the only line with the
 * same words; when neither holds, nothing is written — ticking the wrong box
 * is worse than asking somebody to look again.
 */
export function setTaskDone(content: string, task: Task, done: boolean): string | null {
  const lines = content.split("\n");

  const matches = (index: number) => {
    const match = TASK_LINE.exec(lines[index] ?? "");
    return match !== null && match[4]!.trim() === task.text;
  };

  let index = matches(task.line) ? task.line : -1;
  if (index === -1) {
    const candidates = lines.map((_, i) => i).filter(matches);
    if (candidates.length !== 1) return null;
    index = candidates[0]!;
  }

  lines[index] = lines[index]!.replace(
    TASK_LINE,
    (_, open, _mark, close, rest) => `${open}${done ? "x" : " "}${close}${rest}`,
  );
  return lines.join("\n");
}

/** The notes with open to-dos, the most pressing first. */
export function collectOpenTasks(
  notes: readonly TaskSource[],
  options: { exclude?: (path: string) => boolean } = {},
): NoteTasks[] {
  const found: NoteTasks[] = [];

  for (const note of notes) {
    if (options.exclude?.(note.path)) continue;
    const tasks = findTasks(note.content).filter((task) => !task.done);
    if (tasks.length > 0) found.push({ path: note.path, title: note.title, tasks });
  }

  const soonest = (entry: NoteTasks) =>
    entry.tasks.reduce<string | null>(
      (best, task) => (task.due && (!best || task.due < best) ? task.due : best),
      null,
    );

  return found.sort((a, b) => {
    const dueA = soonest(a);
    const dueB = soonest(b);
    if (dueA && dueB && dueA !== dueB) return dueA < dueB ? -1 : 1;
    if (dueA && !dueB) return -1;
    if (dueB && !dueA) return 1;
    return a.path.localeCompare(b.path);
  });
}

/** "overdue", "today" or "later", against a `YYYY-MM-DD` for today. */
export function dueState(due: string, today: string): "overdue" | "today" | "later" {
  if (due < today) return "overdue";
  return due === today ? "today" : "later";
}
