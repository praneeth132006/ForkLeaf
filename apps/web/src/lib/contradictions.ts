import { plainText } from "@/lib/mind";
import { stem } from "@/lib/ask";

/**
 * Places where the notebook disagrees with itself.
 *
 * Two sentences that say almost the same thing, about the same subject, but
 * not quite: one gives 2019 and the other 2021; one says a thing is safe and
 * the other that it is not; one says prices rose and the other that they fell.
 * Written months apart, in different notes, neither is noticed — until it
 * matters which was right.
 *
 * Found by comparison, not understanding. Sentences are paired when they share
 * most of their meaningful words, and a pair is reported only when what differs
 * between them is a number, a negation, or a pair of opposite words. That keeps
 * it quiet: it says where to look and why, never which sentence is wrong.
 *
 * Nothing leaves the device.
 */

export interface ContradictionSource {
  path: string;
  title: string;
  content: string;
}

export type ContradictionKind = "numbers" | "negation" | "opposites";

export interface Statement {
  path: string;
  title: string;
  /** 1-based line the sentence is on. */
  line: number;
  text: string;
  /** The words or figures that differ from the other statement, as written. */
  differs: string[];
}

export interface Contradiction {
  /** Stable across runs, for "not a contradiction". */
  id: string;
  kind: ContradictionKind;
  /** What differs, in plain words: "2019 or 2021", "is / is not", "rose / fell". */
  summary: string;
  a: Statement;
  b: Statement;
  /** How alike the two sentences are otherwise, 0–1. */
  overlap: number;
}

/** Words too common to say what a sentence is about. */
const STOP = new Set(
  (
    "a an and are as at be been being but by did do does for from had has have he her him his how " +
    "i if in into is it its me my of on or our she so than that the their them then there these they " +
    "this those to too us was we were what when where which while who why will with would you your " +
    "about after also any because before can could each every here just more most much only other " +
    "over some such very should may might shall one"
  ).split(" "),
);

/** Words that turn a statement into its opposite. */
const NEGATIONS = new Set([
  "not",
  "no",
  "never",
  "none",
  "nobody",
  "nothing",
  "neither",
  "nor",
  "cannot",
  "cant",
  "can't",
  "isn't",
  "isnt",
  "aren't",
  "arent",
  "wasn't",
  "wasnt",
  "weren't",
  "werent",
  "doesn't",
  "doesnt",
  "don't",
  "dont",
  "didn't",
  "didnt",
  "won't",
  "wont",
  "shouldn't",
  "shouldnt",
  "couldn't",
  "couldnt",
  "hasn't",
  "hasnt",
  "haven't",
  "havent",
  "without",
]);

/** Pairs of words that say opposite things about the same subject. */
const OPPOSITES: Array<[string, string]> = [
  ["true", "false"],
  ["increase", "decrease"],
  ["increased", "decreased"],
  ["increases", "decreases"],
  ["rise", "fall"],
  ["rose", "fell"],
  ["rises", "falls"],
  ["up", "down"],
  ["more", "less"],
  ["more", "fewer"],
  ["higher", "lower"],
  ["high", "low"],
  ["larger", "smaller"],
  ["bigger", "smaller"],
  ["faster", "slower"],
  ["fast", "slow"],
  ["better", "worse"],
  ["best", "worst"],
  ["safe", "unsafe"],
  ["safe", "dangerous"],
  ["always", "never"],
  ["all", "none"],
  ["before", "after"],
  ["earlier", "later"],
  ["first", "last"],
  ["allowed", "forbidden"],
  ["allowed", "banned"],
  ["legal", "illegal"],
  ["possible", "impossible"],
  ["required", "optional"],
  ["mandatory", "optional"],
  ["enabled", "disabled"],
  ["on", "off"],
  ["open", "closed"],
  ["success", "failure"],
  ["succeeded", "failed"],
  ["accepted", "rejected"],
  ["approved", "rejected"],
  ["positive", "negative"],
  ["win", "lose"],
  ["won", "lost"],
  ["agree", "disagree"],
  ["supports", "opposes"],
  ["helps", "hurts"],
  ["cheaper", "expensive"],
  ["cheap", "expensive"],
  ["easy", "hard"],
  ["easy", "difficult"],
  ["simple", "complex"],
  ["synchronous", "asynchronous"],
  ["sync", "async"],
  ["public", "private"],
  ["inside", "outside"],
  ["include", "exclude"],
  ["includes", "excludes"],
  ["valid", "invalid"],
  ["correct", "incorrect"],
  ["likely", "unlikely"],
];

const OPPOSITE_OF = new Map<string, Set<string>>();
for (const [a, b] of OPPOSITES) {
  if (!OPPOSITE_OF.has(a)) OPPOSITE_OF.set(a, new Set());
  if (!OPPOSITE_OF.has(b)) OPPOSITE_OF.set(b, new Set());
  OPPOSITE_OF.get(a)!.add(b);
  OPPOSITE_OF.get(b)!.add(a);
}

/** A number as written, including years, decimals, percentages and thousands separators. */
const NUMBER = /(?<![\p{L}\p{N}])[-−]?\d[\d,]*(?:\.\d+)?%?(?![\p{L}\p{N}])/gu;
const WORD = /[\p{L}][\p{L}'’]*/gu;

interface Sentence {
  path: string;
  title: string;
  line: number;
  text: string;
  /** Meaningful words, stemmed, without negations, opposites or numbers. */
  core: Set<string>;
  /** Numbers, normalised: "1,200" and "1200" are the same. */
  numbers: string[];
  /** The numbers as written. */
  numbersRaw: string[];
  negations: string[];
  /** Lower-case words that have an opposite. */
  polar: string[];
}

const MIN_CORE = 3;

function normaliseNumber(raw: string): string {
  return raw.replace(/[−]/g, "-").replace(/,/g, "");
}

/** Sentences of a note's prose, with the line each starts on. */
export function sentencesOf(source: ContradictionSource): Sentence[] {
  const lines = source.content.split("\n");
  const sentences: Sentence[] = [];
  let fence = false;
  let start = 0;

  // Front matter is properties, not statements.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
    if (end > 0) start = end + 1;
  }

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/^\s*(#{1,6}\s|\||<!--|>?\s*$)/.test(line)) continue;
    // Flashcards are questions and answers, not claims.
    if (line.includes("::")) continue;

    const prose = plainText(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ""));
    for (const raw of prose.split(/(?<=[.!?])\s+(?=[\p{Lu}\d"“])/u)) {
      const text = raw.trim();
      if (text.length < 12) continue;
      const sentence = describe(source, index + 1, text);
      if (sentence.core.size >= MIN_CORE) sentences.push(sentence);
    }
  }
  return sentences;
}

function describe(source: ContradictionSource, line: number, text: string): Sentence {
  const numbersRaw = text.match(NUMBER) ?? [];
  const withoutNumbers = text.replace(NUMBER, " ");
  const words = (withoutNumbers.match(WORD) ?? []).map((word) =>
    word.toLowerCase().replace(/’/g, "'"),
  );

  const core = new Set<string>();
  const negations: string[] = [];
  const polar: string[] = [];
  for (const word of words) {
    if (NEGATIONS.has(word)) {
      negations.push(word);
      continue;
    }
    if (OPPOSITE_OF.has(word)) {
      polar.push(word);
      continue;
    }
    if (word.length < 2 || STOP.has(word)) continue;
    core.add(stem(word.replace(/'s$/, "")));
  }

  return {
    path: source.path,
    title: source.title,
    line,
    text,
    core,
    numbers: numbersRaw.map(normaliseNumber),
    numbersRaw,
    negations,
    polar,
  };
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((value, index) => value === y[index]);
}

/** Order-independent and stable: the same pair has the same id however it was found. */
function idOf(a: Sentence, b: Sentence): string {
  const keys = [`${a.path}\u0000${a.text}`, `${b.path}\u0000${b.text}`].sort();
  let hash = 2166136261;
  for (const character of keys.join("\u0001")) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function judge(
  a: Sentence,
  b: Sentence,
):
  | (Omit<Contradiction, "id" | "a" | "b"> & {
      aDiffers: string[];
      bDiffers: string[];
    })
  | null {
  if (a.text === b.text) return null;
  const overlap = jaccard(a.core, b.core);

  // The same claim with a different figure: a date, a count, a price.
  if (
    overlap >= 0.6 &&
    a.numbers.length > 0 &&
    b.numbers.length > 0 &&
    a.numbers.length === b.numbers.length &&
    !sameList(a.numbers, b.numbers) &&
    sameList(a.negations, b.negations)
  ) {
    const aOnly = a.numbersRaw.filter((_raw, i) => !b.numbers.includes(a.numbers[i]!));
    const bOnly = b.numbersRaw.filter((_raw, i) => !a.numbers.includes(b.numbers[i]!));
    return {
      kind: "numbers",
      summary: `${aOnly.join(", ")} or ${bOnly.join(", ")}`,
      overlap,
      aDiffers: aOnly,
      bDiffers: bOnly,
    };
  }

  // The same claim, once denied.
  if (
    overlap >= 0.7 &&
    (a.negations.length === 0) !== (b.negations.length === 0) &&
    sameList(a.numbers, b.numbers)
  ) {
    const negated = a.negations.length > 0 ? a.negations : b.negations;
    return {
      kind: "negation",
      summary: `said, and then “${negated[0]}”`,
      overlap,
      aDiffers: a.negations,
      bDiffers: b.negations,
    };
  }

  // The same claim with opposite words in it.
  if (overlap >= 0.6 && sameList(a.numbers, b.numbers) && sameList(a.negations, b.negations)) {
    for (const word of a.polar) {
      const opposite = b.polar.find((other) => OPPOSITE_OF.get(word)?.has(other));
      if (opposite && !a.polar.includes(opposite) && !b.polar.includes(word)) {
        return {
          kind: "opposites",
          summary: `${word} or ${opposite}`,
          overlap,
          aDiffers: [word],
          bDiffers: [opposite],
        };
      }
    }
  }

  return null;
}

export interface FindOptions {
  /** Ids already looked at and judged fine. */
  dismissed?: ReadonlySet<string>;
  /** At most this many, closest pairs first. */
  limit?: number;
}

/** Every pair of sentences in the notebook that look like they disagree. */
export function findContradictions(
  sources: readonly ContradictionSource[],
  options: FindOptions = {},
): Contradiction[] {
  const sentences = sources.flatMap((source) => sentencesOf(source));

  // Only sentences sharing a rare-ish word are ever compared, so a notebook of
  // thousands of sentences is not a million comparisons.
  const byWord = new Map<string, number[]>();
  sentences.forEach((sentence, index) => {
    for (const word of sentence.core) {
      const list = byWord.get(word);
      if (list) list.push(index);
      else byWord.set(word, [index]);
    }
  });

  const seen = new Set<string>();
  const found: Contradiction[] = [];

  sentences.forEach((sentence, i) => {
    const candidates = new Map<number, number>();
    for (const word of sentence.core) {
      const list = byWord.get(word)!;
      // A word in a fifth of all sentences says nothing about which pair match.
      if (list.length > Math.max(50, sentences.length / 5)) continue;
      for (const j of list) if (j > i) candidates.set(j, (candidates.get(j) ?? 0) + 1);
    }

    for (const [j, shared] of candidates) {
      if (shared < MIN_CORE) continue;
      const other = sentences[j]!;
      const verdict = judge(sentence, other);
      if (!verdict) continue;

      const id = idOf(sentence, other);
      if (seen.has(id) || options.dismissed?.has(id)) continue;
      seen.add(id);

      found.push({
        id,
        kind: verdict.kind,
        summary: verdict.summary,
        overlap: verdict.overlap,
        a: { ...pick(sentence), differs: verdict.aDiffers },
        b: { ...pick(other), differs: verdict.bDiffers },
      });
    }
  });

  return found
    .sort((x, y) => y.overlap - x.overlap || x.a.path.localeCompare(y.a.path))
    .slice(0, options.limit ?? 100);
}

function pick(sentence: Sentence) {
  return { path: sentence.path, title: sentence.title, line: sentence.line, text: sentence.text };
}

// ─── "Not a contradiction" ──────────────────────────────────────────────────

/**
 * Pairs somebody has looked at and decided are fine — two different years,
 * two different products. Kept on this device, like dismissed stale notes:
 * it is a fact about a person's attention, not about the notebook.
 */
const key = (workspaceId: string) => `forkleaf:contradictions-dismissed:${workspaceId}`;

export function readDismissedContradictions(workspaceId: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(workspaceId)) ?? "[]");
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function dismissContradiction(workspaceId: string, id: string): void {
  try {
    const ids = readDismissedContradictions(workspaceId);
    ids.add(id);
    window.localStorage.setItem(key(workspaceId), JSON.stringify([...ids]));
  } catch {
    // Blocked storage: it is dismissed until the dialog is closed.
  }
}
