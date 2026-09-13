import { terms } from "@/lib/ask";
import { plainText } from "@/lib/mind";

/**
 * The claim checker: which sentences in a note nothing else in the notebook backs.
 *
 * A claim is a sentence that states something as so — a number, a date, "is",
 * "causes", "always" — rather than a question, a plan, an opinion, or a
 * sentence that already cites a link. It counts as backed when a passage in
 * another note, a saved page or quote, or a PDF's highlights says the same
 * thing: most of its meaning-carrying words, and every number in it. Nothing
 * judges whether the claim is true; it says where you have a source, and where
 * you do not yet.
 */

export interface SupportSource {
  path: string;
  title: string;
  content: string;
}

export interface Support {
  path: string;
  title: string;
  /** 1-based line of the passage. */
  line: number;
  text: string;
}

export type ClaimCheck =
  { status: "supported"; source: Support } | { status: "unsupported" } | { status: "not-a-claim" };

interface Passage extends Support {
  terms: Set<string>;
  numbers: Set<string>;
}

export interface SupportIndex {
  passages: Passage[];
  byTerm: Map<string, number[]>;
}

const NUMBER = /\d+(?:[.,]\d+)*%?/g;
const FENCE = /^\s*(```|~~~)/;
const ASSERTS =
  /\b(is|are|was|were|has|have|had|causes?|caused|increases?|increased|decreases?|decreased|reduces?|reduced|leads? to|led to|shows?|showed|proves?|proved|found|means|always|never|every|most|all|none|only|first|largest|smallest|best|worst)\b/i;
const HEDGED =
  /\b(i think|i feel|i guess|in my opinion|maybe|perhaps|probably|might|could|should|would like|let's|todo)\b/i;
const MIN_WORDS = 6;
const SUPPORTED = 0.6;
const MIN_MATCHED = 3;

const numbersIn = (text: string) =>
  new Set((text.match(NUMBER) ?? []).map((number) => number.replace(/,/g, "")));
const keyTerms = (text: string) => [...new Set(terms(text).filter((term) => term.length >= 3))];

/** Sentences of prose, split where one ends and the next begins. */
export function sentencesIn(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["“(\p{Lu}\p{N}])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function isClaim(sentence: string): boolean {
  const text = sentence.trim();
  if (!text || text.endsWith("?") || text.endsWith(":")) return false;
  // Already cites something: a link, a wikilink, a footnote.
  if (/https?:\/\/|\]\(|\[\[|\[\^/.test(text)) return false;
  if (text.split(/\s+/).length < MIN_WORDS) return false;
  if (/^(i|we|you|let's|todo|note to self)\b/i.test(text) || HEDGED.test(text)) return false;
  return /\d/.test(text) || ASSERTS.test(text);
}

/** Every passage in the notebook that could back a claim, indexed by word. */
export function buildSupportIndex(sources: readonly SupportSource[]): SupportIndex {
  const passages: Passage[] = [];
  const byTerm = new Map<string, number[]>();

  for (const source of sources) {
    let fence = false;
    source.content.split("\n").forEach((raw, index) => {
      if (FENCE.test(raw)) {
        fence = !fence;
        return;
      }
      if (fence || !raw.trim()) return;
      for (const text of sentencesIn(plainText(raw))) {
        const words = keyTerms(text);
        if (words.length === 0) continue;
        const id = passages.length;
        passages.push({
          path: source.path,
          title: source.title,
          line: index + 1,
          text,
          terms: new Set(words),
          numbers: numbersIn(text),
        });
        for (const word of words) {
          const list = byTerm.get(word);
          if (list) list.push(id);
          else byTerm.set(word, [id]);
        }
      }
    });
  }
  return { passages, byTerm };
}

/**
 * Whether anything backs a sentence written in the note at `path`.
 *
 * The note itself is left out — a claim cannot be its own source — and so is a
 * sentence too short to judge, which is never flagged.
 */
export function checkClaim(index: SupportIndex, sentence: string, path: string | null): ClaimCheck {
  if (!isClaim(sentence)) return { status: "not-a-claim" };
  const wanted = keyTerms(plainText(sentence));
  if (wanted.length < MIN_MATCHED) return { status: "not-a-claim" };
  const numbers = numbersIn(sentence);

  const hits = new Map<number, number>();
  for (const word of wanted) {
    for (const id of index.byTerm.get(word) ?? []) hits.set(id, (hits.get(id) ?? 0) + 1);
  }

  let best: { passage: Passage; matched: number } | null = null;
  for (const [id, matched] of hits) {
    const passage = index.passages[id]!;
    if (passage.path === path) continue;
    if (matched < MIN_MATCHED || matched / wanted.length < SUPPORTED) continue;
    if ([...numbers].some((number) => !passage.numbers.has(number))) continue;
    if (!best || matched > best.matched) best = { passage, matched };
  }
  if (!best) return { status: "unsupported" };
  const { path: found, title, line, text } = best.passage;
  return { status: "supported", source: { path: found, title, line, text } };
}
