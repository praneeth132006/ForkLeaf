import { formatCard } from "@/lib/flashcard-suggestions";

/**
 * Cards to and from Anki, as the plain text both sides already speak.
 *
 * Anki exports "Notes in Plain Text" as one note per line, the fields
 * separated by a tab, with `#key:value` lines at the top saying how to read
 * the rest. It imports the same shape. That is the whole bridge: no package
 * format, no database, a file anybody can open.
 *
 * Coming in, the first field is the question and the second the answer, and
 * the HTML Anki keeps in its fields is taken down to the words. A cloze note
 * (`{{c1::…}}`) becomes a fill-in-the-blank line. Going out, a deck is one
 * line per card with a header naming the deck, so Anki files it where it
 * belongs.
 */

export interface AnkiCard {
  question: string;
  answer: string;
}

export interface AnkiImport {
  /** The `#deck:` header, when the file has one. */
  deck: string | null;
  cards: AnkiCard[];
  /** `{{c1::…}}` notes, as the sentence with its blanks highlighted. */
  clozes: string[];
  /** Lines that were neither: one field, or empty after the HTML came off. */
  skipped: number;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** An Anki field as words: tags off, breaks as spaces, entities decoded. */
export function fieldText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(div|p|li)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X"))
        return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits one line on the separator, honouring Anki's double-quoted fields. */
function fields(line: string, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"' && current === "") quoted = true;
    else if (char === separator) {
      out.push(current);
      current = "";
    } else current += char;
  }
  out.push(current);
  return out;
}

const SEPARATORS: Record<string, string> = {
  tab: "\t",
  comma: ",",
  semicolon: ";",
  pipe: "|",
  space: " ",
};

export function parseAnkiText(text: string): AnkiImport {
  const result: AnkiImport = { deck: null, cards: [], clozes: [], skipped: 0 };
  let separator: string | null = null;
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  for (const line of lines) {
    const header = /^#([a-z ]+):(.*)$/i.exec(line);
    if (header) {
      if (header[1]!.trim().toLowerCase() === "deck") {
        // Anki nests decks with `::`; the last part is the name.
        result.deck = header[2]!.trim().split("::").pop()!.trim() || null;
      }
      if (header[1]!.trim().toLowerCase() === "separator") {
        const value = header[2]!.trim().toLowerCase();
        separator = SEPARATORS[value] ?? header[2]!.trim().charAt(0) ?? null;
      }
      continue;
    }
    if (!line.trim()) continue;
    // No header: a tab if the line has one, else a comma, else a semicolon.
    const split = separator ?? (line.includes("\t") ? "\t" : line.includes(",") ? "," : ";");
    const [first = "", second = ""] = fields(line, split);

    if (/\{\{c\d+::/i.test(first)) {
      const sentence = fieldText(
        first.replace(/\{\{c\d+::(.+?)(?:::[^}]*)?\}\}/gi, (_all, inner: string) => `==${inner}==`),
      );
      if (sentence) result.clozes.push(sentence);
      else result.skipped += 1;
      continue;
    }

    const question = fieldText(first);
    const answer = fieldText(second);
    if (question && answer) result.cards.push({ question, answer });
    else result.skipped += 1;
  }
  return result;
}

/** A tab or a line break inside a field would break the line into two notes. */
const clean = (text: string) => text.replace(/[\t\r\n]+/g, " ").trim();

export function ankiExport(deck: string, cards: readonly AnkiCard[]): string {
  const header = ["#separator:tab", "#html:false", `#deck:${clean(deck) || "ForkLeaf"}`];
  return `${[...header, ...cards.map((card) => `${clean(card.question)}\t${clean(card.answer)}`)].join("\n")}\n`;
}

/**
 * A note holding an imported deck: a heading, a card per line, and the
 * `#flashcards` tag when there are blanks, which is what makes highlights
 * count as blanks to fill in.
 */
export function deckNote(title: string, deck: AnkiImport): string {
  const lines = [
    ...deck.cards.map((card) => formatCard(card.question, card.answer)),
    ...deck.clozes,
  ];
  const tag = deck.clozes.length > 0 ? "\n\n#flashcards" : "";
  return `# ${title}\n\n${lines.join("\n\n")}${tag}\n`;
}
