/**
 * One line of a note read as a flashcard: `Question :: Answer`.
 *
 * Shared by the rich editor, which draws such a line as a card, the preview,
 * and the review queue, so the three can never disagree about what a card is.
 * This reads the raw text only; turning markdown into the words a person sees
 * on the card is the caller's business.
 */

export interface CardLine {
  question: string;
  answer: string;
  /** Written `:::`, which makes a card each way. */
  reversed: boolean;
}

/** Where `::` (or `:::`) splits a line, ignoring inline code and escapes. */
export function cardSeparator(text: string): { at: number; length: number } | null {
  let code = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "`") {
      code = !code;
      continue;
    }
    if (code || char !== ":" || text[i + 1] !== ":") continue;
    let length = 2;
    while (text[i + length] === ":") length += 1;
    return length <= 3 ? { at: i, length } : null;
  }
  return null;
}

/**
 * The question and answer on a line, or null when the line is not a card.
 *
 * `std::vector` and `Foo::bar()` are code, and so is `Use std::vector here`.
 * A card written without spaces around `::` has to read like a question — a
 * question mark, or several words with no identifier glued to a lowercase
 * one across the separator: `What is H2O?::Water`, `Capital of Portugal::Lisbon`.
 * A line with a second separator is not a card either.
 */
export function parseCardLine(text: string): CardLine | null {
  const found = cardSeparator(text);
  if (!found) return null;
  const left = text.slice(0, found.at);
  const right = text.slice(found.at + found.length);

  const tight = !/\s$/.test(left) && !/^\s/.test(right);
  if (tight && !left.trim().endsWith("?")) {
    if (!/\s/.test(left.trim())) return null;
    if (/[A-Za-z_]\w*$/.test(left) && /^[a-z_]/.test(right)) return null;
  }
  if (cardSeparator(right)) return null;

  const question = left.trim();
  const answer = right.replace(/\s*\\$/, "").trim();
  if (!question || !answer) return null;
  return { question, answer, reversed: found.length === 3 };
}
