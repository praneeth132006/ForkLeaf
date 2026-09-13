import { buildLinkGraph } from "@forkleaf/markdown-engine";
import { plainText } from "@/lib/mind";

/**
 * A few older notes worth reading again today.
 *
 * Notes are written to be used later, and most never are: once a note falls
 * out of the sidebar's recent list it is effectively gone. This brings a
 * handful back, each with the reason it was chosen, in an order that holds
 * for the whole day — so the list is a suggestion to act on, not a slot
 * machine that changes on every click.
 *
 * In order of how likely they are to matter right now:
 *
 * 1. Notes linked to the one being written, either way, that nobody has
 *    touched in a month — the context you already decided was related.
 * 2. Notes written on this day in an earlier year.
 * 3. Notes that have gone longest without an edit, a different few each day.
 */

export interface ResurfaceSource {
  path: string;
  title: string;
  content: string;
  /** When it was last saved. */
  updatedAt: string | null;
  /** From its `created` property, when it has one. */
  created: string | null;
}

export interface Resurfaced {
  path: string;
  title: string;
  /** Why this one, in a phrase: "Linked from this note · last edited 7 months ago". */
  reason: string;
  /** Its first words, without markdown. */
  excerpt: string;
}

const DAY = 86_400_000;
const EXCERPT_LENGTH = 140;
const SKIPPED = /^(templates|reviews)\//;
const ENCRYPTED = "<!-- forkleaf:encrypted v1 -->";

const parse = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** FNV-1a — a stable shuffle for the day, with no dependency. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

export function ago(then: Date, now: Date): string {
  const days = Math.floor((now.getTime() - then.getTime()) / DAY);
  if (days < 45) return `${Math.max(1, Math.round(days / 7))} week${days < 11 ? "" : "s"} ago`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365.25);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function excerptOf(content: string): string {
  const body = content
    .split("\n")
    .filter((line) => line.trim() && !/^\s*(#|---|```)/.test(line))
    .slice(0, 4)
    .join(" ");
  const text = plainText(body);
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text;
}

export function resurface(
  notes: readonly ResurfaceSource[],
  options: {
    /** The note open now, which is never suggested, and whose links lead the list. */
    current: string | null;
    now: Date;
    limit?: number;
    /** How long a note must have gone untouched to count as forgotten. */
    minimumAgeDays?: number;
  },
): Resurfaced[] {
  const { current, now } = options;
  const limit = options.limit ?? 3;
  const oldest = now.getTime() - (options.minimumAgeDays ?? 30) * DAY;
  const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  const touched = (note: ResurfaceSource) => parse(note.updatedAt) ?? parse(note.created);
  const eligible = notes.filter((note) => {
    if (note.path === current || !/\.mdx?$/i.test(note.path) || SKIPPED.test(note.path)) {
      return false;
    }
    if (note.content.includes(ENCRYPTED) || !note.content.trim()) return false;
    const when = touched(note);
    return when !== null && when.getTime() <= oldest;
  });
  const byPath = new Map(eligible.map((note) => [note.path, note]));
  const forToday = (a: ResurfaceSource, b: ResurfaceSource) =>
    hash(`${today}:${a.path}`) - hash(`${today}:${b.path}`);

  const picked = new Map<string, string>();
  const pick = (note: ResurfaceSource, reason: string) => {
    if (picked.size < limit && !picked.has(note.path)) picked.set(note.path, reason);
  };

  // 1. The context of the note being written.
  if (current) {
    const graph = buildLinkGraph(
      notes.map((note) => ({ path: note.path, title: note.title, content: note.content })),
    );
    const linkedFrom = (graph.outgoing.get(current) ?? [])
      .map((ref) => ref.to)
      .filter((path): path is string => path !== null);
    const linkedTo = (graph.backlinks.get(current) ?? []).map((ref) => ref.from);
    const neighbours = [
      ...linkedFrom.map((path) => ({ path, how: "Linked from this note" })),
      ...linkedTo.map((path) => ({ path, how: "Links to this note" })),
    ];
    for (const { path, how } of neighbours) {
      const note = byPath.get(path);
      if (note) pick(note, `${how} · last edited ${ago(touched(note)!, now)}`);
    }
  }

  // 2. On this day.
  const month = now.getMonth();
  const date = now.getDate();
  for (const note of [...eligible].sort(forToday)) {
    const created = parse(note.created);
    if (
      created &&
      created.getMonth() === month &&
      created.getDate() === date &&
      created.getFullYear() < now.getFullYear()
    ) {
      const years = now.getFullYear() - created.getFullYear();
      pick(note, `Written ${years === 1 ? "a year" : `${years} years`} ago today`);
    }
  }

  // 3. The longest forgotten, a different few each day: the oldest quarter,
  //    shuffled by the date.
  const byAge = [...eligible].sort((a, b) => touched(a)!.getTime() - touched(b)!.getTime());
  const forgotten = byAge.slice(0, Math.max(limit * 2, Math.ceil(byAge.length / 4))).sort(forToday);
  for (const note of forgotten) {
    const when = touched(note)!;
    pick(
      note,
      `Not edited since ${when.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
    );
  }

  return [...picked.entries()].map(([path, reason]) => {
    const note = byPath.get(path)!;
    return { path, title: note.title, reason, excerpt: excerptOf(note.content) };
  });
}
