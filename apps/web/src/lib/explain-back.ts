import { terms } from "@/lib/ask";
import { plainText } from "@/lib/mind";

/**
 * Explain it back: what a written recollection of a note got, and what it left out.
 *
 * Recalling something from memory fixes it far better than reading it again,
 * but only if you find out what you forgot. So the note is split into
 * sentences, each sentence into the words that carry its meaning, and every
 * sentence is marked by how many of those words the recollection used —
 * stemmed, so "shipped" counts for "shipping", and with the missing words
 * named. Sentences in the recollection that nothing in the note backs are
 * marked too: a confident, wrong memory is the one most worth catching.
 *
 * Deliberately a word match, not a judge of meaning. It runs on the device,
 * instantly, and says exactly why a sentence counts as missed.
 */

export type RecallStatus = "remembered" | "partly" | "missed";

export interface RecallSentence {
  text: string;
  status: RecallStatus;
  /** The note's own words for what was left out, in the order they appear. */
  missing: string[];
}

export interface AttemptSentence {
  text: string;
  /** False when little of it is in the note — worth checking. */
  inNote: boolean;
}

export interface RecallReport {
  /** Share of the note's key words that came back, 0–100. */
  score: number;
  remembered: number;
  partly: number;
  missed: number;
  sentences: RecallSentence[];
  attempt: AttemptSentence[];
}

const REMEMBERED = 0.6;
const PARTLY = 0.3;
const IN_NOTE = 0.5;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const FENCE = /^\s*(```|~~~)/;

/** Sentences of prose, split where one ends and a capital or number begins. */
function split(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["“(\p{Lu}\p{N}])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * The sentences of a note, as a person reads them.
 *
 * Headings are left out — the title and section names are what the reader was
 * handed, not what they recalled — and so are code, tables and pictures. A
 * flashcard line reads as its question and answer.
 */
export function sentencesOf(markdown: string): string[] {
  const blocks: string[] = [];
  let buffer: string[] = [];
  let fence = false;
  const flush = () => {
    if (buffer.length > 0) blocks.push(buffer.join(" "));
    buffer = [];
  };

  for (const raw of markdown.split("\n")) {
    if (FENCE.test(raw)) {
      fence = !fence;
      flush();
      continue;
    }
    if (fence) continue;
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line) || line.startsWith("|") || /^!\[/.test(line)) {
      flush();
      continue;
    }
    // A list item or a card is a thought of its own.
    if (/^([-*+]|\d+[.)])\s/.test(line) || /\s:{2,3}\s/.test(line)) {
      flush();
      blocks.push(line.replace(/\s:{2,3}\s/, " — "));
      continue;
    }
    buffer.push(line);
  }
  flush();

  return blocks.flatMap((block) => split(plainText(block).replace(/^\[[ xX]\]\s*/, "")));
}

/**
 * Words that join a sentence together rather than say what it is about. The
 * search stoplist keeps some of them, because a question can hinge on one; a
 * recollection that leaves out "through" has not forgotten anything.
 */
const CONNECTIVE = new Set(
  (
    "through throughout across along among around between during without within into onto upon " +
    "each every other another such like many much well only even still yet however therefore thus " +
    "because since although though unless until whether both either neither per via way"
  ).split(" "),
);

/** The meaning-carrying words of a sentence, stemmed, each once. */
const keyTerms = (text: string) => [
  ...new Set(terms(text).filter((term) => term.length >= 3 && !CONNECTIVE.has(term))),
];

/** True when a term is in the set, or shares a long stem with one that is. */
function recalled(term: string, known: ReadonlySet<string>): boolean {
  if (known.has(term)) return true;
  if (term.length < 6) return false;
  const root = term.slice(0, 6);
  for (const other of known) if (other.length >= 6 && other.startsWith(root)) return true;
  return false;
}

export function compareRecall(note: string, attempt: string): RecallReport {
  const recalledTerms = new Set(keyTerms(attempt));
  const noteTerms = new Set<string>();

  const sentences: RecallSentence[] = [];
  for (const text of sentencesOf(note)) {
    const key = keyTerms(text);
    if (key.length === 0) continue;
    key.forEach((term) => noteTerms.add(term));

    const got = key.filter((term) => recalled(term, recalledTerms)).length;
    const share = got / key.length;
    const missing: string[] = [];
    for (const word of text.match(WORD) ?? []) {
      const [term] = terms(word);
      if (!term || term.length < 3 || CONNECTIVE.has(term) || recalled(term, recalledTerms)) {
        continue;
      }
      const lower = word.toLowerCase();
      if (!missing.includes(lower)) missing.push(lower);
    }
    sentences.push({
      text,
      status: share >= REMEMBERED ? "remembered" : share >= PARTLY ? "partly" : "missed",
      missing,
    });
  }

  const recalledCount = [...noteTerms].filter((term) => recalled(term, recalledTerms)).length;
  const attemptSentences = split(attempt.replace(/\s*\n+\s*/g, " ").trim()).map((text) => {
    const key = keyTerms(text);
    if (key.length === 0) return { text, inNote: true };
    const found = key.filter((term) => recalled(term, noteTerms)).length;
    return { text, inNote: found / key.length >= IN_NOTE };
  });

  return {
    score: noteTerms.size === 0 ? 0 : Math.round((100 * recalledCount) / noteTerms.size),
    remembered: sentences.filter((sentence) => sentence.status === "remembered").length,
    partly: sentences.filter((sentence) => sentence.status === "partly").length,
    missed: sentences.filter((sentence) => sentence.status === "missed").length,
    sentences,
    attempt: attemptSentences,
  };
}
