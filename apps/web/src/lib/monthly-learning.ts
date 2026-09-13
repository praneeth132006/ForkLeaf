import { countWords, parseDecision, stripExtension } from "@forkleaf/markdown-engine";
import { findCards, parseSchedule, type Card } from "@/lib/flashcards";
import { extractMeeting } from "@/lib/meeting";
import { dateStamp, isTemplatePath, JOURNAL_FOLDER } from "@/lib/templates";

/**
 * What I learned this month: a page the notebook writes about itself.
 *
 * The notes started and worked on, how the flashcards are coming along — which
 * have settled into long gaps, which are still being learned, which have not
 * been started — the decisions chosen in decision blocks, and the ones written
 * down in meetings. It is an ordinary note in the journal, so it can be edited,
 * kept, and published like any other page.
 */

export interface MonthSource {
  path: string;
  title: string;
  content: string;
  /** From the note's `created` property, when it has one. */
  created: string | null;
  updatedAt: string | null;
}

export interface DeckProgress {
  path: string;
  title: string;
  cards: number;
  mature: number;
}

export interface MonthDecision {
  text: string;
  path: string;
  title: string;
  from: "decision" | "meeting";
}

export interface MonthSummary {
  /** "September 2026". */
  label: string;
  start: string;
  end: string;
  created: MonthSource[];
  edited: MonthSource[];
  words: number;
  cards: {
    total: number;
    /** A gap of three weeks or more before it comes back. */
    mature: number;
    /** Reviewed, but still coming back often. */
    learning: number;
    notStarted: number;
    /** Written in notes started this month. */
    added: number;
  };
  decks: DeckProgress[];
  decisions: MonthDecision[];
}

/** A gap this long before a card returns, and it is as good as learned. */
export const MATURE_DAYS = 21;
const MAX_DECKS = 8;
const MAX_DECISIONS = 20;

const pad = (n: number) => String(n).padStart(2, "0");

export function monthlyPagePath(now: Date): string {
  return `${JOURNAL_FOLDER}/${now.getFullYear()}-${pad(now.getMonth() + 1)}-learned.md`;
}

/** Not the month's own business: templates, the journal's reviews, the schedule. */
function counts(path: string): boolean {
  return (
    !isTemplatePath(path) &&
    !/^journal\/\d{4}-(w\d{2}|\d{2}-learned)\.md$/i.test(path) &&
    !path.startsWith("reviews/")
  );
}

const DECISION_FENCE = /^```decision\n([\s\S]*?)\n```$/gm;

export function summariseMonth(
  notes: readonly MonthSource[],
  schedule: string | null,
  now: Date,
): MonthSummary {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const inMonth = (iso: string | null) => {
    if (!iso) return false;
    const parsed = new Date(iso);
    return !Number.isNaN(parsed.getTime()) && parsed >= first && parsed <= now;
  };

  const eligible = notes.filter((note) => counts(note.path));
  const created = eligible.filter((note) => inMonth(note.created));
  const createdPaths = new Set(created.map((note) => note.path));
  const edited = eligible.filter((note) => !createdPaths.has(note.path) && inMonth(note.updatedAt));

  const states = parseSchedule(schedule);
  const cardsByNote = new Map<string, Card[]>();
  for (const note of eligible) {
    const cards = findCards(note.path, note.title, note.content);
    if (cards.length > 0) cardsByNote.set(note.path, cards);
  }
  const all = [...cardsByNote.values()].flat();
  const matureCard = (card: Card) => (states.get(card.id)?.interval ?? 0) >= MATURE_DAYS;
  const mature = all.filter(matureCard).length;
  const notStarted = all.filter((card) => !states.has(card.id)).length;

  const titleOf = new Map(eligible.map((note) => [note.path, note.title]));
  const decks = [...cardsByNote.entries()]
    .map(([path, cards]) => ({
      path,
      title: titleOf.get(path) ?? path,
      cards: cards.length,
      mature: cards.filter(matureCard).length,
    }))
    .sort((a, b) => b.cards - a.cards || a.title.localeCompare(b.title))
    .slice(0, MAX_DECKS);

  const decisions: MonthDecision[] = [];
  for (const note of eligible) {
    for (const match of note.content.matchAll(DECISION_FENCE)) {
      const decision = parseDecision(match[1]!);
      const chosenThisMonth = decision.history.filter((entry) => entry.startsWith(month));
      const latest = chosenThisMonth.at(-1);
      if (!latest || !decision.chosen) continue;
      const question = decision.question.trim();
      decisions.push({
        text: question ? `${question} — ${decision.chosen}` : `Chose ${decision.chosen}`,
        path: note.path,
        title: note.title,
        from: "decision",
      });
    }
    if (inMonth(note.created) || inMonth(note.updatedAt)) {
      for (const text of extractMeeting(note.content).decisions) {
        decisions.push({ text, path: note.path, title: note.title, from: "meeting" });
      }
    }
  }

  const byTitle = (a: MonthSource, b: MonthSource) => a.title.localeCompare(b.title);
  return {
    label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    start: dateStamp(first),
    end: dateStamp(now),
    created: created.sort(byTitle),
    edited: edited.sort(byTitle),
    words: created.reduce((sum, note) => sum + countWords(note.content), 0),
    cards: {
      total: all.length,
      mature,
      learning: all.length - mature - notStarted,
      notStarted,
      added: all.filter((card) => createdPaths.has(card.path)).length,
    },
    decks,
    decisions: decisions.slice(0, MAX_DECISIONS),
  };
}

const link = (path: string, title: string) =>
  `[[${stripExtension(path)}|${title.replace(/[|\]]/g, "")}]]`;
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

function longDate(stamp: string): string {
  const [year, month, day] = stamp.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

export function formatMonthlyPage(summary: MonthSummary): string {
  const lines = [
    `# What I learned — ${summary.label}`,
    "",
    `${longDate(summary.start)} – ${longDate(summary.end)}.`,
    "",
    "## In numbers",
    "",
    `- ${plural(summary.created.length, "new note")}, ${plural(summary.words, "word")}`,
    `- ${plural(summary.edited.length, "note")} worked on`,
  ];
  const { cards } = summary;
  if (cards.total > 0) {
    lines.push(
      `- ${plural(cards.total, "flashcard")}: ${cards.mature} mature, ${cards.learning} learning, ${cards.notStarted} not started yet` +
        (cards.added > 0 ? ` (${cards.added} added this month)` : ""),
    );
  }
  if (summary.decisions.length > 0) lines.push(`- ${plural(summary.decisions.length, "decision")}`);
  lines.push("");

  const section = (heading: string, items: string[], empty: string) => {
    lines.push(`## ${heading}`, "", ...(items.length ? items : [empty]), "");
  };

  section(
    "New notes",
    summary.created.map((note) => `- ${link(note.path, note.title)}`),
    "Nothing new this month.",
  );
  if (summary.decks.length > 0) {
    section(
      "Flashcards",
      summary.decks.map(
        (deck) =>
          `- ${link(deck.path, deck.title)} — ${plural(deck.cards, "card")}, ${deck.mature} mature`,
      ),
      "",
    );
  }
  section(
    "Decisions",
    summary.decisions.map(
      (decision) =>
        `- ${decision.text} — ${link(decision.path, decision.title)}${decision.from === "meeting" ? " (meeting)" : ""}`,
    ),
    "No decisions written down this month.",
  );
  section(
    "Worked on",
    summary.edited.map((note) => `- ${link(note.path, note.title)}`),
    "Nothing else this month.",
  );
  lines.push("## Looking back", "", "");
  return lines.join("\n");
}
