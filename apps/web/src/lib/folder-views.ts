/**
 * A folder of notes, seen as a board or as a table.
 *
 * Both are views of the same thing — the properties at the top of each note —
 * and neither keeps anything of its own. Moving a card writes `status: Doing`
 * into that note; editing a cell writes that property. There is no board file
 * and no database, so the notes stay readable in any other tool, and a board
 * rebuilt from them on another device is the same board.
 */

export interface ViewSource {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
}

/** Notes in a folder or anywhere beneath it. `""` is the whole notebook. */
export function inFolder<T extends { path: string }>(notes: readonly T[], folder: string): T[] {
  if (!folder) return [...notes];
  return notes.filter((note) => note.path.startsWith(`${folder}/`));
}

/** A property value as one line of text. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Text typed into a cell, as the value to store.
 *
 * Keeps the shape the property already had: a list stays a list, a number a
 * number, a yes/no a yes/no. Guessing a type for a brand-new property would
 * turn a version like "1.10" into 1.1, so a new one is always text. Empty
 * means remove.
 */
export function parseValue(input: string, previous: unknown): unknown {
  const text = input.trim();
  if (text === "") return undefined;
  if (Array.isArray(previous)) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (typeof previous === "number" && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (typeof previous === "boolean" && /^(true|false)$/i.test(text)) {
    return text.toLowerCase() === "true";
  }
  return text;
}

// ── Board ────────────────────────────────────────────────────────────────

export const NO_VALUE = "";
export const DEFAULT_COLUMNS = ["To do", "Doing", "Done"];

export interface BoardColumn {
  /** The property value; `NO_VALUE` for notes that have none. */
  value: string;
  cards: ViewSource[];
}

export function boardFrom(
  notes: readonly ViewSource[],
  property: string,
  extraColumns: readonly string[] = [],
): BoardColumn[] {
  const groups = new Map<string, ViewSource[]>();
  const found: string[] = [];

  for (const note of notes) {
    const value = formatValue(note.frontmatter[property]).trim();
    if (value && !groups.has(value)) found.push(value);
    groups.set(value, [...(groups.get(value) ?? []), note]);
  }

  const lower = (value: string) => value.toLowerCase();
  const order: string[] = [];
  const add = (value: string) => {
    if (!order.some((existing) => lower(existing) === lower(value))) order.push(value);
  };

  // The usual three first when the folder uses any of them — or when it uses
  // nothing yet — so a new board has somewhere to drag to.
  const usesDefaults =
    found.length === 0 || found.some((value) => DEFAULT_COLUMNS.map(lower).includes(lower(value)));
  if (usesDefaults) DEFAULT_COLUMNS.forEach(add);
  [...found].sort((a, b) => a.localeCompare(b)).forEach(add);
  extraColumns.forEach(add);

  const byTitle = (a: ViewSource, b: ViewSource) => a.title.localeCompare(b.title);
  const columns: BoardColumn[] = order.map((value) => ({
    value,
    cards: [...groups.entries()]
      .filter(([key]) => key && lower(key) === lower(value))
      .flatMap(([, cards]) => cards)
      .sort(byTitle),
  }));

  const loose = (groups.get(NO_VALUE) ?? []).sort(byTitle);
  return loose.length > 0 ? [{ value: NO_VALUE, cards: loose }, ...columns] : columns;
}

// ── Table ────────────────────────────────────────────────────────────────

export interface TableRow {
  path: string;
  title: string;
  values: Record<string, unknown>;
}

/**
 * Fields left out of the table.
 *
 * The title has its own column, and `generator` is the same URL on every note
 * ForkLeaf has saved — a column of it only pushes the useful ones off screen.
 */
const HIDDEN = new Set(["title", "generator"]);

export function tableFrom(notes: readonly ViewSource[]): { columns: string[]; rows: TableRow[] } {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const key of Object.keys(note.frontmatter)) {
      if (HIDDEN.has(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  // The properties most notes have come first; the ones ForkLeaf maintains on
  // every note, which nobody sorts a reading list by, go last.
  const late = new Set(["created", "updated", "editedBy"]);
  const columns = [...counts.entries()]
    .sort(
      ([a, countA], [b, countB]) =>
        Number(late.has(a)) - Number(late.has(b)) || countB - countA || a.localeCompare(b),
    )
    .map(([key]) => key);

  return {
    columns,
    rows: notes.map((note) => ({ path: note.path, title: note.title, values: note.frontmatter })),
  };
}

/** Sorts by a column: numbers as numbers, everything else as text; empty last. */
export function sortRows(
  rows: readonly TableRow[],
  column: string,
  direction: "asc" | "desc",
): TableRow[] {
  const read = (row: TableRow) => (column === "title" ? row.title : row.values[column]);
  const sign = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = read(a);
    const right = read(b);
    const emptyLeft = formatValue(left) === "";
    const emptyRight = formatValue(right) === "";
    if (emptyLeft || emptyRight) {
      return emptyLeft === emptyRight ? a.title.localeCompare(b.title) : emptyLeft ? 1 : -1;
    }
    if (typeof left === "number" && typeof right === "number") return (left - right) * sign;
    return (
      formatValue(left).localeCompare(formatValue(right), undefined, { numeric: true }) * sign ||
      a.title.localeCompare(b.title)
    );
  });
}

/** Rows whose title, path or any value contains every word typed. */
export function filterRows(rows: readonly TableRow[], query: string): TableRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...rows];
  return rows.filter((row) => {
    const haystack = [row.title, row.path, ...Object.values(row.values).map(formatValue)]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
