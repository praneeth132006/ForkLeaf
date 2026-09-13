import { plainText } from "@/lib/mind";

/**
 * Asking the notebook a question, and getting back the places that answer it.
 *
 * There is no language model here, on purpose. An answer written by a model
 * can say things your notes do not, and has to send your notes somewhere to
 * write it. This finds the passages that answer the question — a paragraph, a
 * list item — ranks them by how much of the question they cover, and quotes
 * them with the note, the heading and the line they are on. Everything it says
 * is something you wrote, and nothing leaves the device.
 *
 * Ranking is BM25-flavoured: rare words count for more than common ones, a
 * passage that covers more of the question beats one that repeats a single
 * word, and the note's title and the heading above a passage count a little.
 */

export interface AskSource {
  path: string;
  title: string;
  content: string;
}

export interface Passage {
  path: string;
  title: string;
  /** The heading the passage sits under, when there is one. */
  heading: string | null;
  /** 1-based line the passage starts on. */
  line: number;
  /** The passage as a person reads it. */
  text: string;
  /** Words of the question it contains, as written in the passage. */
  matched: string[];
  score: number;
}

export interface Answer {
  /** The words of the question that were searched for. */
  terms: string[];
  passages: Passage[];
}

const STOP = new Set(
  (
    "a about after all also am an and any are as at be been before being but by can could did do " +
    "does doing done for from get got had has have having he her here him his how i if in into is it " +
    "its just me more most my no not now of on or our out over said say she should so some tell than " +
    "that the their them then there these they this those to too up us very was we were what when " +
    "where which while who whom why will with would you your yours note notes wrote write written " +
    "find show know"
  ).split(" "),
);

const SKIPPED = /^(templates|reviews)\//;
const ENCRYPTED = "<!-- forkleaf:encrypted v1 -->";

/** Crude English stemming: enough that "shipping", "ships" and "shipped" meet. */
export function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 5) return undouble(word.slice(0, -3));
  if (word.endsWith("ed") && word.length > 4) return undouble(word.slice(0, -2));
  if (word.endsWith("es") && /(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function undouble(word: string): string {
  return /([^aeiouls])\1$/.test(word) ? word.slice(0, -1) : word;
}

const WORD = /[\p{L}\p{N}]+/gu;

/** The searchable words of a text, stemmed, without the ones every sentence has. */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? [])
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map(stem);
}

interface Chunk {
  path: string;
  title: string;
  heading: string | null;
  line: number;
  raw: string;
  words: string[];
}

/** A note as passages: paragraphs, and each list item on its own. */
function chunksOf(source: AskSource): Chunk[] {
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let buffer: { line: number; lines: string[] } | null = null;
  let fence = false;

  const flush = () => {
    if (buffer) {
      const raw = buffer.lines.join("\n");
      const words = terms(raw);
      if (words.length > 0) {
        chunks.push({
          path: source.path,
          title: source.title,
          heading,
          line: buffer.line + 1,
          raw,
          words,
        });
      }
    }
    buffer = null;
  };

  source.content.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      fence = !fence;
      return;
    }
    if (fence) return;
    const headingMatch = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush();
      heading = plainText(headingMatch[1]!).trim() || null;
      return;
    }
    if (!line.trim() || /^\s*(---|\|)/.test(line)) {
      flush();
      return;
    }
    // Each list item is its own answer.
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) flush();
    if (buffer) buffer.lines.push(line);
    else buffer = { line: index, lines: [line] };
  });
  flush();
  return chunks;
}

/** The words of a passage that are words of the question, as the passage spells them. */
function matchedWords(raw: string, wanted: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  for (const word of raw.match(WORD) ?? []) {
    if (wanted.has(stem(word.toLowerCase()))) seen.add(word);
  }
  return [...seen];
}

export function ask(
  question: string,
  sources: readonly AskSource[],
  options: { limit?: number; perNote?: number } = {},
): Answer {
  const limit = options.limit ?? 6;
  const perNote = options.perNote ?? 2;
  const wanted = [...new Set(terms(question))];
  if (wanted.length === 0) return { terms: [], passages: [] };

  const chunks = sources
    .filter(
      (source) =>
        /\.mdx?$/i.test(source.path) &&
        !SKIPPED.test(source.path) &&
        !source.content.includes(ENCRYPTED),
    )
    .flatMap(chunksOf);
  if (chunks.length === 0) return { terms: wanted, passages: [] };

  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const word of new Set(chunk.words)) {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    }
  }
  const idf = (word: string) =>
    Math.log(1 + chunks.length / Math.max(1, documentFrequency.get(word) ?? 0));
  const averageLength = chunks.reduce((sum, chunk) => sum + chunk.words.length, 0) / chunks.length;
  // Most of the question has to be there; a one- or two-word question needs all of it.
  const needed = wanted.length <= 2 ? wanted.length : Math.ceil(wanted.length * 0.5);
  const phrase = terms(question).join(" ");

  const scored = chunks.flatMap((chunk) => {
    const counts = new Map<string, number>();
    for (const word of chunk.words) counts.set(word, (counts.get(word) ?? 0) + 1);
    const context = new Set([...terms(chunk.title), ...terms(chunk.heading ?? "")]);

    let score = 0;
    let covered = 0;
    for (const word of wanted) {
      const count = counts.get(word) ?? 0;
      if (count > 0) {
        covered += 1;
        const saturation =
          (count * 2.2) / (count + 1.2 * (0.25 + (0.75 * chunk.words.length) / averageLength));
        score += idf(word) * saturation;
      } else if (context.has(word)) {
        covered += 0.5;
        score += idf(word) * 0.4;
      }
    }
    if (covered < needed || score <= 0) return [];

    score *= 0.4 + covered / wanted.length;
    if (wanted.length > 1 && chunk.words.join(" ").includes(phrase)) score *= 1.5;

    return [
      {
        path: chunk.path,
        title: chunk.title,
        heading: chunk.heading,
        line: chunk.line,
        text: plainText(chunk.raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "")),
        matched: matchedWords(chunk.raw, new Set(wanted)),
        score: Math.round(score * 1000) / 1000,
      },
    ];
  });

  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);

  const perPath = new Map<string, number>();
  const passages: Passage[] = [];
  for (const passage of scored) {
    const used = perPath.get(passage.path) ?? 0;
    if (used >= perNote) continue;
    perPath.set(passage.path, used + 1);
    passages.push(passage);
    if (passages.length === limit) break;
  }
  return { terms: wanted, passages };
}

/** Splits a passage into plain and matched runs, for highlighting. */
export function highlight(
  text: string,
  matched: readonly string[],
): { text: string; hit: boolean }[] {
  if (matched.length === 0) return [{ text, hit: false }];
  const escaped = matched.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const runs: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index), hit: false });
    runs.push({ text: match[0], hit: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), hit: false });
  return runs;
}
