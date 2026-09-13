import { findCards, readable } from "@/lib/flashcards";

/**
 * Flashcards a note already contains, before anybody has written one.
 *
 * Nobody opens a flashcards feature knowing the `question :: answer` syntax,
 * and most notes already hold what a card needs: a term in bold with its
 * meaning, a list of "term — meaning" lines, a heading that asks a question
 * and the paragraph that answers it. This finds those and offers them as cards,
 * to be ticked and added — nothing is written until someone chooses.
 */

export interface SuggestedCard {
  question: string;
  answer: string;
  /** 0-based line the suggestion came from. */
  line: number;
}

const FENCE = /^\s*(```|~~~)/;
/** `**Term** — meaning`, `**Term**: meaning`, `**Term** is meaning`, in a list or not. */
const BOLD_TERM = /^\s*(?:[-*+]\s+)?\*\*(.+?)\*\*\s*(?:[:—–]|-\s|\bis\b|\bare\b|\bmeans\b)\s*(.+)$/;
/** `- Term — meaning` or `- Term: meaning` in a list, with a short term. */
const LIST_TERM = /^\s*[-*+]\s+(?!\[[ xX]\])([^:—–*`]{2,60}?)\s*(?::|—|–|\s-\s)\s+(.{3,})$/;
const QUESTION_HEADING = /^\s*#{2,6}\s+(.+\?)\s*$/;
const MAX_ANSWER = 300;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function suggestCards(content: string): SuggestedCard[] {
  const lines = content.split("\n");
  const existing = new Set(
    findCards("", "", content).map((card) => card.question.trim().toLowerCase()),
  );
  const seen = new Set<string>();
  const suggestions: SuggestedCard[] = [];

  const offer = (question: string, answer: string, line: number) => {
    const q = readable(question).replace(/[:\s]+$/, "");
    const a = readable(answer);
    const key = q.toLowerCase();
    if (!q || !a || words(a) < 2 || existing.has(key) || seen.has(key)) return;
    if (/https?:\/\//i.test(q)) return;
    seen.add(key);
    suggestions.push({
      question: q,
      answer: a.length > MAX_ANSWER ? `${a.slice(0, MAX_ANSWER - 1)}…` : a,
      line,
    });
  };

  let fence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!;
    if (FENCE.test(raw)) {
      fence = !fence;
      continue;
    }
    // Code, tables, and lines that are already cards are left alone.
    if (fence || /^\s*\|/.test(raw) || raw.includes("::")) continue;

    const heading = QUESTION_HEADING.exec(raw);
    if (heading) {
      const body: string[] = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        const line = lines[next]!;
        if (/^\s*#/.test(line) || FENCE.test(line)) break;
        if (!line.trim()) {
          if (body.length > 0) break;
          continue;
        }
        body.push(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
      }
      if (body.length > 0) offer(heading[1]!, body.join(" "), index);
      continue;
    }
    if (/^\s*#/.test(raw)) continue;

    const bold = BOLD_TERM.exec(raw);
    if (bold && words(bold[1]!) <= 8) {
      offer(bold[1]!, bold[2]!, index);
      continue;
    }
    const listed = LIST_TERM.exec(raw);
    if (listed && words(listed[1]!) <= 6) offer(listed[1]!, listed[2]!, index);
  }

  return suggestions;
}

/** One card as a line (or lines) of markdown. */
export function formatCard(question: string, answer: string): string {
  const q = question.trim().replace(/\s*\n\s*/g, " ");
  const a = answer.trim();
  return a.includes("\n") ? `${q}\n?\n${a}` : `${q} :: ${a}`;
}

export const CARDS_HEADING = "## Flashcards";

/**
 * A note with cards added under its Flashcards heading, made at the end if the
 * note has none. Cards are separated by blank lines, so a multi-line card never
 * runs into the next one.
 */
export function withCards(
  content: string,
  cards: readonly { question: string; answer: string }[],
): string {
  if (cards.length === 0) return content;
  const block = cards.map((card) => formatCard(card.question, card.answer)).join("\n\n");
  const lines = content.split("\n");
  const start = lines.findIndex((line) => /^##\s+flashcards\s*$/i.test(line.trim()));

  if (start === -1) {
    const trimmed = content.replace(/\s*$/, "");
    return `${trimmed ? `${trimmed}\n\n` : ""}${CARDS_HEADING}\n\n${block}\n`;
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  const section = lines.slice(start, end).join("\n").replace(/\s*$/, "");
  const after = lines.slice(end).join("\n");
  const before = lines.slice(0, start).join("\n");
  return `${before ? `${before}\n` : ""}${section}\n\n${block}\n${after ? `\n${after}` : ""}`;
}
