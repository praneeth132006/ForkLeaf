import { parseCardLine } from "@forkleaf/markdown-engine";
import { readable } from "@/lib/flashcards";

/**
 * Flashcards written by the reader's own model, from the open note.
 *
 * The suggestions found by rule — a bolded term and its meaning, a heading that
 * asks a question — only exist in notes written that way. Most notes are
 * paragraphs. A model can read a paragraph and ask what is worth remembering
 * in it; this is the question it is asked, and the reading of its reply.
 *
 * The reply is asked for in the notebook's own card spelling, one per line, so
 * reading it is the same parser that reads a note — and a reply that wanders
 * into prose around the cards loses only the prose.
 */

export const AI_CARD_COUNT = 10;

export function cardsRequest(title: string, count = AI_CARD_COUNT): string {
  return [
    `Write up to ${count} flashcards that test the most important things in the note "${title}".`,
    "One card per line, exactly in the form: Question :: Answer",
    "Each question must make sense on its own, without the note beside it. Each answer is as short as it can be while still being right — a word, a name, a number or one sentence.",
    "Test understanding and facts that are worth remembering, not trivia about the wording of the note. Never ask two cards about the same thing.",
    "Use only what the note says. Write nothing else: no heading, no numbering, no blank lines, no commentary.",
  ].join("\n");
}

export interface AiCard {
  question: string;
  answer: string;
}

/**
 * The cards in a model's reply.
 *
 * Numbering and bullets are forgiven — models add them however firmly they are
 * asked not to — and so is bold around the question. Anything else that is not
 * a card is dropped, as is a question already asked.
 */
export function readCardReply(reply: string, existing: readonly string[] = []): AiCard[] {
  const seen = new Set(existing.map((question) => question.trim().toLowerCase()));
  const cards: AiCard[] = [];
  for (const raw of reply.split("\n")) {
    const line = raw.replace(/^\s*(?:[-*+•]|\d+[.)]|Q\d*[:.])\s*/i, "").trim();
    const card = parseCardLine(line);
    if (!card) continue;
    const question = readable(card.question).replace(/^Q:\s*/i, "");
    const answer = readable(card.answer).replace(/^A:\s*/i, "");
    if (!question || !answer) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ question, answer });
  }
  return cards;
}
