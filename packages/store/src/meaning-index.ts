import { isStopword, tokenize } from "./search-index";

/**
 * Search by meaning, learned from the notebook itself.
 *
 * Full-text search finds the notes that contain your words. It cannot find
 * the note about "cars" when you type "vehicles", or the meeting where "churn"
 * was discussed when you search "customers leaving". A language model could,
 * but it is tens of megabytes to download and a third-party script to run in
 * the one page that holds every note — too much to put under a search box.
 *
 * So this learns which words mean related things from how *this notebook*
 * uses them. Words that keep company — appear near each other, in note after
 * note — end up with similar vectors (random indexing: each word gets a fixed
 * random signature, and its meaning vector is the sum of the signatures of the
 * words around it). A note's vector is the weighted sum of its words'; a query
 * is compared with every note by angle. A few hundred numbers per word, built
 * in the browser in milliseconds, nothing downloaded, nothing sent anywhere.
 *
 * It is only as good as the notebook is large. In a handful of notes it knows
 * little; in a few hundred it starts to find what you meant rather than what
 * you typed.
 */

const DIMENSIONS = 384;
/** Non-zero entries in a word's random signature. */
const SPARSITY = 8;
/** Words either side that count as a word's company. */
const WINDOW = 4;
/** Words in fewer notes than this say nothing about meaning yet. */
const MIN_DOCS = 2;
/** The most distinct words to learn, most widely used first. */
const MAX_VOCABULARY = 6000;

export interface MeaningDoc {
  id: string;
  workspaceId: string;
  path: string;
  title: string;
  text: string;
}

export interface MeaningHit {
  id: string;
  workspaceId: string;
  path: string;
  title: string;
  /** Cosine similarity, 0–1. */
  score: number;
}

/** FNV-1a, so a word's signature is the same on every build. */
function hash(text: string, seed: number): number {
  let value = 0x811c9dc5 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/** A word's fixed random signature: a few ±1 entries at hashed positions. */
function signature(word: string): [number, number][] {
  const entries: [number, number][] = [];
  for (let i = 0; i < SPARSITY; i += 1) {
    const h = hash(word, i * 7919);
    entries.push([h % DIMENSIONS, h & 0x10000 ? 1 : -1]);
  }
  return entries;
}

function normalise(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i]! * vector[i]!;
  const length = Math.sqrt(sum);
  if (length > 0) for (let i = 0; i < vector.length; i += 1) vector[i]! /= length;
  return vector;
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i]! * b[i]!;
  return sum;
}

const wordsOf = (text: string) =>
  tokenize(text).filter((word) => word.length > 2 && !isStopword(word) && !/^\d+$/.test(word));

export class MeaningIndex {
  private readonly vectors = new Map<string, Float32Array>();
  private readonly idf = new Map<string, number>();
  private readonly docs: { doc: MeaningDoc; vector: Float32Array }[] = [];

  constructor(documents: readonly MeaningDoc[]) {
    const tokenised = documents.map((doc) => ({
      doc,
      words: [...wordsOf(doc.title), ...wordsOf(doc.title), ...wordsOf(doc.text)],
    }));

    // Which words to learn: in at least two notes, most widespread first, but
    // not in nearly every note — a word everywhere distinguishes nothing.
    const df = new Map<string, number>();
    for (const { words } of tokenised) {
      for (const word of new Set(words)) df.set(word, (df.get(word) ?? 0) + 1);
    }
    const total = Math.max(1, documents.length);
    const vocabulary = [...df.entries()]
      .filter(([, count]) => count >= MIN_DOCS && (total < 10 || count / total < 0.6))
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_VOCABULARY);
    for (const [word, count] of vocabulary) {
      this.idf.set(word, Math.log(1 + total / count));
      this.vectors.set(word, new Float32Array(DIMENSIONS));
    }

    // Each word's vector is the company it keeps.
    const signatures = new Map<string, [number, number][]>();
    const sign = (word: string) => {
      let found = signatures.get(word);
      if (!found) {
        found = signature(word);
        signatures.set(word, found);
      }
      return found;
    };
    for (const { words } of tokenised) {
      for (let i = 0; i < words.length; i += 1) {
        const vector = this.vectors.get(words[i]!);
        if (!vector) continue;
        const from = Math.max(0, i - WINDOW);
        const to = Math.min(words.length - 1, i + WINDOW);
        for (let j = from; j <= to; j += 1) {
          if (j === i) continue;
          const neighbour = words[j]!;
          const weight = (this.idf.get(neighbour) ?? 0.5) / Math.abs(i - j);
          for (const [position, value] of sign(neighbour)) vector[position]! += value * weight;
        }
      }
    }
    // The word's own signature too, so an exact match still counts for most.
    for (const [word, vector] of this.vectors) {
      normalise(vector);
      for (const [position, value] of sign(word)) vector[position]! += value * 0.35;
      normalise(vector);
    }

    for (const { doc, words } of tokenised) {
      this.docs.push({ doc, vector: this.embed(words) });
    }
  }

  get size(): number {
    return this.docs.length;
  }

  /** How many words it has learned a meaning for. */
  get vocabulary(): number {
    return this.vectors.size;
  }

  private embed(words: readonly string[]): Float32Array {
    const counts = new Map<string, number>();
    for (const word of words)
      if (this.vectors.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
    const out = new Float32Array(DIMENSIONS);
    for (const [word, count] of counts) {
      const vector = this.vectors.get(word)!;
      const weight = (1 + Math.log(count)) * (this.idf.get(word) ?? 1);
      for (let i = 0; i < DIMENSIONS; i += 1) out[i]! += vector[i]! * weight;
    }
    return normalise(out);
  }

  /** Notes closest in meaning to the query, best first. Empty when no word of it is known. */
  search(query: string, options: { limit?: number; workspaceId?: string } = {}): MeaningHit[] {
    const vector = this.embed(wordsOf(query));
    if (vector.every((value) => value === 0)) return [];
    return this.docs
      .filter(({ doc }) => !options.workspaceId || doc.workspaceId === options.workspaceId)
      .map(({ doc, vector: other }) => ({
        id: doc.id,
        workspaceId: doc.workspaceId,
        path: doc.path,
        title: doc.title,
        score: Math.max(0, dot(vector, other)),
      }))
      .filter((hit) => hit.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit ?? 20);
  }
}
