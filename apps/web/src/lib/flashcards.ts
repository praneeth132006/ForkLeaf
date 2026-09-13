import { parseCardLine } from "@forkleaf/markdown-engine";
import { dateStamp } from "@/lib/templates";

/**
 * Flashcards written in notes, and when to see each one again.
 *
 * A card is one line: `Question :: Answer`. That is the spelling Obsidian's
 * spaced-repetition plugin already reads, so a note full of cards is not a
 * ForkLeaf format — and on github.com it is still a readable line of text.
 *
 * The schedule is SM-2, the algorithm most flashcard apps descend from, and
 * it is kept in `reviews/flashcards.md`: a markdown table, one row per card, in
 * the repository beside everything else. It syncs to every device, it has
 * history, and anybody curious about why a card came back today can open it.
 */

export const SCHEDULE_PATH = "reviews/flashcards.md";

export interface Card {
  /** Stable across edits to anything but the question itself. */
  id: string;
  path: string;
  noteTitle: string;
  question: string;
  answer: string;
  line: number;
  /** How it was written: `q :: a`, both ways with `:::`, or a highlighted blank. */
  kind: CardKind;
}

export type CardKind = "basic" | "reversed" | "cloze";

export interface FindOptions {
  /** Read `==highlighted==` words as blanks to fill in. */
  clozes?: boolean;
}

export interface CardState {
  /** `YYYY-MM-DD` the card is next shown. */
  due: string;
  /** Days between the last review and `due`. */
  interval: number;
  /** SM-2 easiness, never below 1.3. */
  ease: number;
  /** Successful reviews in a row. */
  reps: number;
}

export type Schedule = Map<string, CardState>;
export type Grade = "again" | "hard" | "good" | "easy";

const FENCE = /^\s*(```|~~~)/;
/** Blockquote arrows, a list bullet or number, and a task box, before the card. */
const LIST_MARKER = /^\s*(?:>\s?)*(?:(?:[-*+]|\d+[.)])\s+)?(?:\[[ xX]\]\s+)?/;
/** A character markdown lets be escaped, and the rich editor does escape. */
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|~<>=:])/g;
/** Holds an escaped character's place while formatting is stripped around it. */
const HOLD = String.fromCharCode(0xe000);
const HELD = new RegExp(`${HOLD}(\\d+)${HOLD}`, "g");
const CLOZE = /==(?=\S)(.+?)(?<=\S)==/g;

/** FNV-1a, as eight hex digits. Short, stable, and no dependency. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, "0");
}

export function cardId(path: string, question: string): string {
  return hash(`${path}\n${question.trim().toLowerCase()}`);
}

/**
 * Markdown as a person reads it on a card.
 *
 * The rich editor saves what it shows, escaped: `2 * 3` is written `2 \* 3`,
 * `[[Roadmap]]` is written `\[\[Roadmap\]\]`, and a line that ends inside a
 * paragraph ends in a backslash. Cards showed all of that — and a trailing `\`
 * on every answer but the last in a paragraph. Formatting marks, link syntax
 * and escapes are removed here; the words stay.
 */
export function readable(markdown: string): string {
  const held: string[] = [];
  const text = markdown
    .replace(/\s*\\$/, "")
    .replace(ESCAPED, (_match, char: string) => {
      held.push(char);
      return `${HOLD}${held.length - 1}${HOLD}`;
    })
    .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/!?\[\[([^\]]+)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, "$1$2")
    .replace(/(^|[^\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/g, "$1$2")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "$1")
    .replace(CLOZE, "$1");
  // Link brackets the editor escaped are still a link once restored.
  return text
    .replace(HELD, (_match, index: string) => held[Number(index)] ?? "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .trim();
}

function inlineCard(body: string): { question: string; answer: string; reversed: boolean } | null {
  const found = parseCardLine(body);
  if (!found) return null;
  const question = readable(found.question);
  const answer = readable(found.answer);
  if (!question || !answer) return null;
  return { question, answer, reversed: found.reversed };
}

/** One card per highlighted blank: the line with that blank hidden. */
function clozeCards(body: string): { question: string; answer: string; key: string }[] {
  const whole = readable(body);
  return [...body.matchAll(CLOZE)].map((match, index) => {
    let seen = -1;
    const question = readable(
      body.replace(CLOZE, (_all, inner: string) => {
        seen += 1;
        return seen === index ? "[…]" : inner;
      }),
    );
    return { question, answer: readable(match[1]!), key: `${whole}#${index}` };
  });
}

/** True for a note tagged `flashcards`, whose highlights are blanks to fill in. */
export function wantsClozes(frontmatter: Record<string, unknown>, content: string): boolean {
  const tags = frontmatter.tags;
  const list = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(/[,\s]+/) : [];
  const tagged = list.some(
    (tag) => typeof tag === "string" && tag.replace(/^#/, "").toLowerCase() === "flashcards",
  );
  return tagged || /(^|\s)#flashcards\b/im.test(content);
}

/**
 * Every card in a note.
 *
 * - `Question :: Answer` on one line, in a list or not. Without spaces
 *   (`What is H2O?::Water`) when the question reads like one.
 * - `Word ::: Translation` makes two cards, one each way.
 * - A question, a line holding only `?` (or `??` for both ways), then the
 *   answer, all in one paragraph — a card over several lines.
 * - With `clozes`, each `==highlight==` is a blank in its sentence.
 *
 * The same spellings Obsidian's spaced-repetition plugin reads. Nothing in
 * code, a table or a heading is a card.
 */
export function findCards(
  path: string,
  noteTitle: string,
  content: string,
  options: FindOptions = {},
): Card[] {
  const cards: Card[] = [];
  const seen = new Set<string>();
  const add = (question: string, answer: string, line: number, kind: CardKind, key = question) => {
    const id = cardId(path, key);
    if (seen.has(id)) return;
    seen.add(id);
    cards.push({ id, path, noteTitle, question, answer, line, kind });
  };

  // Lines that can hold cards, in blocks split by blank lines, code, tables
  // and headings. A card over several lines lives inside one block.
  const blocks: { text: string; line: number }[][] = [];
  let block: { text: string; line: number }[] = [];
  const close = () => {
    if (block.length > 0) blocks.push(block);
    block = [];
  };
  let fence: string | null = null;

  content.split("\n").forEach((raw, line) => {
    const fenceMatch = FENCE.exec(raw);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1]!;
      else if (fenceMatch[1] === fence) fence = null;
      close();
      return;
    }
    // A `::` in code — a C++ scope, a Haskell type — is not a card. Nor is one
    // in a table row or a heading.
    if (
      fence !== null ||
      raw.startsWith("    ") ||
      raw.startsWith("\t") ||
      /^\s*[|#]/.test(raw) ||
      !raw.trim()
    ) {
      close();
      return;
    }
    block.push({ text: raw.replace(LIST_MARKER, ""), line });
  });
  close();

  const markerOf = (text: string) => text.trim().replace(/\s*\\$/, "");

  for (const lines of blocks) {
    const marker = lines.findIndex((entry) => /^\?\??$/.test(markerOf(entry.text)));
    if (marker > 0 && marker < lines.length - 1) {
      const question = lines
        .slice(0, marker)
        .map((entry) => readable(entry.text))
        .join("\n")
        .trim();
      const answer = lines
        .slice(marker + 1)
        .map((entry) => readable(entry.text))
        .join("\n")
        .trim();
      if (question && answer) {
        add(question, answer, lines[0]!.line, "basic");
        if (markerOf(lines[marker]!.text) === "??") {
          add(answer, question, lines[0]!.line, "reversed", `↔ ${answer}`);
        }
      }
      continue;
    }

    for (const entry of lines) {
      const inline = inlineCard(entry.text);
      if (inline) {
        add(inline.question, inline.answer, entry.line, "basic");
        if (inline.reversed) {
          add(inline.answer, inline.question, entry.line, "reversed", `↔ ${inline.answer}`);
        }
      } else if (options.clozes) {
        for (const cloze of clozeCards(entry.text)) {
          add(cloze.question, cloze.answer, entry.line, "cloze", cloze.key);
        }
      }
    }
  }

  return cards;
}
function addDays(today: string, days: number): string {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  return dateStamp(new Date(year, month - 1, day + days));
}

/**
 * The next state of a card after one review.
 *
 * SM-2 with the four buttons most apps have settled on. **Again** starts the
 * card over and shows it tomorrow; the others grow the gap by the card's ease,
 * which each grade nudges up or down.
 */
export function review(state: CardState | undefined, grade: Grade, today: string): CardState {
  const quality = { again: 1, hard: 3, good: 4, easy: 5 }[grade];
  const previous = state ?? { due: today, interval: 0, ease: 2.5, reps: 0 };

  const ease = Math.max(
    1.3,
    Math.round((previous.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))) * 100) / 100,
  );

  if (grade === "again") {
    return { due: addDays(today, 1), interval: 1, ease, reps: 0 };
  }

  const reps = previous.reps + 1;
  let interval: number;
  if (reps === 1) interval = grade === "easy" ? 4 : 1;
  else if (reps === 2) interval = grade === "hard" ? 3 : 6;
  else interval = Math.round(previous.interval * (grade === "hard" ? 1.2 : ease));
  if (grade === "easy" && reps > 1) interval = Math.round(interval * 1.3);
  interval = Math.max(1, interval);

  return { due: addDays(today, interval), interval, ease, reps };
}

/** Cards due today or earlier first (most overdue first), then new ones. */
export function dueCards(
  cards: readonly Card[],
  schedule: Schedule,
  today: string,
  newLimit = 20,
): Card[] {
  const due = cards
    .filter((card) => {
      const state = schedule.get(card.id);
      return state !== undefined && state.due <= today;
    })
    .sort((a, b) => schedule.get(a.id)!.due.localeCompare(schedule.get(b.id)!.due));
  const fresh = cards.filter((card) => !schedule.has(card.id)).slice(0, newLimit);
  return [...due, ...fresh];
}

/** The soonest date anything comes back, for "nothing due — next on …". */
export function nextDue(cards: readonly Card[], schedule: Schedule, today: string): string | null {
  let soonest: string | null = null;
  for (const card of cards) {
    const state = schedule.get(card.id);
    if (state && state.due > today && (!soonest || state.due < soonest)) soonest = state.due;
  }
  return soonest;
}

// ── The schedule file ─────────────────────────────────────────────────────

const HEADER =
  "# Flashcard reviews\n\n" +
  "Kept by ForkLeaf. One row per card: when it is next due, the gap in days, how\n" +
  "easy it has been, and how many times in a row it has been remembered. Delete a\n" +
  "row to start that card over.\n\n" +
  "| card | due | interval | ease | reps |\n" +
  "| ---- | --- | -------- | ---- | ---- |\n";

export function parseSchedule(content: string | null): Schedule {
  const schedule: Schedule = new Map();
  if (!content) return schedule;

  for (const line of content.split("\n")) {
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((_, i, all) => i > 0 && i < all.length - 1);
    if (cells.length < 5) continue;
    const [id, due, interval, ease, reps] = cells as [string, string, string, string, string];
    if (!/^[0-9a-f]{8}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    const parsed = { due, interval: Number(interval), ease: Number(ease), reps: Number(reps) };
    if ([parsed.interval, parsed.ease, parsed.reps].some((n) => !Number.isFinite(n))) continue;
    schedule.set(id, parsed);
  }
  return schedule;
}

export function formatSchedule(schedule: Schedule): string {
  const rows = [...schedule.entries()]
    .sort(([a, stateA], [b, stateB]) => stateA.due.localeCompare(stateB.due) || a.localeCompare(b))
    .map(
      ([id, state]) =>
        `| ${id} | ${state.due} | ${state.interval} | ${state.ease} | ${state.reps} |`,
    );
  return `${HEADER}${rows.join("\n")}${rows.length ? "\n" : ""}`;
}
