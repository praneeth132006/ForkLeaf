import { parseCardLine } from "./flashcard-line";

/**
 * Decks you can fork: flashcards shared as a public GitHub repository.
 *
 * A shared deck is one file, `deck.md`, of `Question :: Answer` lines under a
 * heading — readable on github.com, and nothing but text. Copying it puts the
 * cards into a note of your own, so your progress is kept where it always is,
 * in your own schedule. Updating compares the version you copied with the
 * newest one and brings over what changed, leaving alone any card you rewrote
 * and any card you added yourself.
 */

export const DECK_FILE = "deck.md";

export interface DeckCard {
  question: string;
  answer: string;
  reversed: boolean;
}

export interface DeckChanges {
  added: DeckCard[];
  changed: { before: DeckCard; after: DeckCard }[];
  removed: DeckCard[];
}

export interface DeckPlan {
  changes: DeckChanges;
  /** Cards to add, after the card at `anchor`. */
  add: DeckCard[];
  /** Indexes into the note's cards, and what each becomes. */
  replace: { index: number; card: DeckCard }[];
  /** Indexes into the note's cards to delete. */
  remove: number[];
  /** Cards the deck changed or dropped that the reader had rewritten: kept as they are. */
  kept: number;
  /** The note's last card that came from the deck, or null. */
  anchor: number | null;
}

export interface DeckBlockState {
  /** `source` for a deck copied from someone, `shared` for one you published. */
  role: "source" | "shared" | "";
  /** `owner/repo`. */
  repo: string;
  /** The commit the cards were copied or published at. */
  version: string;
}

const FENCE = /^\s*(```|~~~)/;
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;
const NAME = /^[\w.-]{1,100}$/;

const keyOf = (card: DeckCard) => card.question.trim().toLowerCase();
const same = (a: DeckCard, b: DeckCard) =>
  a.question.trim() === b.question.trim() &&
  a.answer.trim() === b.answer.trim() &&
  a.reversed === b.reversed;

/** The `Question :: Answer` lines of a note or a deck file, outside code. */
export function deckCardsOf(markdown: string): DeckCard[] {
  const cards: DeckCard[] = [];
  const seen = new Set<string>();
  let fence = false;
  for (const raw of markdown.split("\n")) {
    if (FENCE.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence || /^\s*[|#>]/.test(raw)) continue;
    const card = parseCardLine(raw.replace(LIST_MARKER, "").trim());
    if (!card || seen.has(keyOf(card))) continue;
    seen.add(keyOf(card));
    cards.push(card);
  }
  return cards;
}

export const cardLine = (card: DeckCard) =>
  `${card.question.trim()}${card.reversed ? " ::: " : " :: "}${card.answer.trim()}`;

/** The `deck.md` a shared deck is published as. */
export function deckFile(title: string, cards: readonly DeckCard[]): string {
  return `# ${title.trim() || "Flashcards"}\n\n## Cards\n\n${cards.map(cardLine).join("\n")}\n`;
}

export function readDeckFile(text: string): { title: string; cards: DeckCard[] } {
  const heading = /^#\s+(.+)$/m.exec(text);
  return { title: heading?.[1]?.trim() || "Shared deck", cards: deckCardsOf(text) };
}

export function diffDecks(before: readonly DeckCard[], after: readonly DeckCard[]): DeckChanges {
  const old = new Map(before.map((card) => [keyOf(card), card]));
  const next = new Map(after.map((card) => [keyOf(card), card]));
  return {
    added: after.filter((card) => !old.has(keyOf(card))),
    changed: after.flatMap((card) => {
      const previous = old.get(keyOf(card));
      return previous && !same(previous, card) ? [{ before: previous, after: card }] : [];
    }),
    removed: before.filter((card) => !next.has(keyOf(card))),
  };
}

/**
 * What to do to a note's cards to bring in a new version of the deck.
 *
 * A card is only rewritten or removed when it still reads exactly as the deck
 * had it; one the reader has changed is theirs now, and is counted as kept.
 */
export function planDeckUpdate(
  current: readonly DeckCard[],
  before: readonly DeckCard[],
  after: readonly DeckCard[],
): DeckPlan {
  const changes = diffDecks(before, after);
  const indexOf = new Map<string, number>();
  current.forEach((card, index) => {
    if (!indexOf.has(keyOf(card))) indexOf.set(keyOf(card), index);
  });

  const add: DeckCard[] = [];
  const replace: DeckPlan["replace"] = [];
  const remove: number[] = [];
  let kept = 0;

  for (const { before: previous, after: next } of changes.changed) {
    const index = indexOf.get(keyOf(previous));
    if (index === undefined) add.push(next);
    else if (same(current[index]!, previous)) replace.push({ index, card: next });
    else kept += 1;
  }
  for (const previous of changes.removed) {
    const index = indexOf.get(keyOf(previous));
    if (index === undefined) continue;
    if (same(current[index]!, previous)) remove.push(index);
    else kept += 1;
  }
  for (const next of changes.added) if (!indexOf.has(keyOf(next))) add.push(next);

  const fromDeck = new Set([...before, ...after].map(keyOf));
  const removed = new Set(remove);
  let anchor: number | null = null;
  current.forEach((card, index) => {
    if (fromDeck.has(keyOf(card)) && !removed.has(index)) anchor = index;
  });

  return { changes, add, replace, remove, kept, anchor };
}

/** `owner/repo` from what was typed: the pair itself, or a GitHub address. */
export function parseRepoAddress(input: string): { owner: string; repo: string } | null {
  const trimmed = input
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const path = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i.exec(trimmed)?.[1] ?? trimmed;
  const [owner, repo] = path.split("/");
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo) || /^\.+$/.test(repo)) return null;
  if (path.split("/").length > 2 && !/github\.com/i.test(trimmed)) return null;
  return { owner, repo };
}

/** A repository name for a deck: its title in lowercase words, ending `-deck`. */
export function deckRepoName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return `${slug || "flashcards"}-deck`;
}

export function parseDeckBlock(text: string): DeckBlockState {
  const state: DeckBlockState = { role: "", repo: "", version: "" };
  for (const raw of text.split("\n")) {
    const field = /^\s*(source|shared|version)\s*:\s*(\S*)\s*$/i.exec(raw);
    if (!field) continue;
    const name = field[1]!.toLowerCase();
    if (name === "version") state.version = /^[0-9a-f]{7,40}$/i.test(field[2]!) ? field[2]! : "";
    else if (parseRepoAddress(field[2]!)) {
      state.role = name as "source" | "shared";
      state.repo = field[2]!;
    }
  }
  return state;
}

export function formatDeckBlock(state: DeckBlockState): string {
  if (!state.role || !state.repo) return "";
  return [
    `${state.role}: ${state.repo}`,
    ...(state.version ? [`version: ${state.version}`] : []),
  ].join("\n");
}
