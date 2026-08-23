/**
 * Full-text search over note bodies.
 *
 * The dashboard could only ever match titles, tags and paths, because those
 * are the only things the index held. That is fine for twenty notes and
 * useless for two hundred: the whole reason to keep notes is to find the one
 * sentence you wrote about a thing six months ago, and the filename almost
 * never contains it.
 *
 * This is a plain inverted index — term → the notes containing it — ranked
 * with BM25. No dependency, no worker, no server: the notes are already in
 * IndexedDB on this machine, and shipping a search engine to look through a
 * few megabytes of prose that is already in memory would be absurd.
 *
 * Pure data and pure functions, like the rest of this package. It knows
 * nothing about IndexedDB or React; something else decides what to feed it.
 */

/** A note as the index sees it. */
export interface SearchDoc {
  /** `${workspaceId}::${path}` — the note's id. */
  id: string;
  workspaceId: string;
  path: string;
  title: string;
  tags: string[];
  /** The markdown body. Frontmatter is not indexed; its title and tags are. */
  content: string;
}

export interface SearchHit {
  id: string;
  workspaceId: string;
  path: string;
  title: string;
  score: number;
  /** A line of the note around the best match, for the result list. */
  snippet: SearchSnippet | null;
  /** Which query terms actually matched, for highlighting elsewhere. */
  matched: string[];
}

export interface SearchSnippet {
  text: string;
  /** `[start, end)` offsets into `text` to highlight. */
  ranges: [number, number][];
}

export interface SearchOptions {
  limit?: number;
  /** Restrict to one connected repository. */
  workspaceId?: string;
  /**
   * Treat the final term as a prefix, which is what makes the box usable while
   * you are still typing the word. On by default; off for a submitted query.
   */
  prefixLast?: boolean;
}

/**
 * BM25 knobs, at their standard values.
 *
 * `k1` bounds how much repeating a term helps — a note that says "kubernetes"
 * forty times is not forty times more relevant than one that says it twice.
 * `b` is how hard length normalisation bites; 0.75 is the usual compromise
 * between "long notes contain everything" and "short notes always win".
 */
const K1 = 1.2;
const B = 0.75;

/** Matches the same word shape the word count uses, so the two agree. */
const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;

/**
 * Words too common to be worth an index entry.
 *
 * Kept deliberately short. An aggressive stoplist makes searching for a phrase
 * that is mostly stopwords — "the way we work" — impossible, and the space
 * saved by dropping another forty words is not worth that.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
]);

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

/** One indexed note: its term counts, and what is needed to show a result. */
interface IndexedDoc {
  id: string;
  workspaceId: string;
  path: string;
  title: string;
  /** Total tokens, for BM25's length normalisation. */
  length: number;
  /** Every term this note contributed, so removing it is not a full scan. */
  terms: string[];
  /**
   * The searchable text, kept so snippets can be cut from it.
   *
   * This is the index's memory cost and it is a deliberate trade: without it a
   * result can say which note matched but not show why, which is most of what
   * makes a result list worth reading. A thousand notes of ordinary prose is a
   * few megabytes.
   */
  text: string;
  /** Lowercased copy of `text`, so phrase checks do not rebuild it per query. */
  folded: string;
}

export class SearchIndex {
  private readonly docs = new Map<string, IndexedDoc>();
  /** term → note id → how many times it occurs (all fields, weighted). */
  private readonly postings = new Map<string, Map<string, number>>();
  private totalLength = 0;

  /** Sorted terms, for prefix lookup. Rebuilt lazily after a write. */
  private sortedTerms: string[] | null = null;

  get size(): number {
    return this.docs.size;
  }

  has(id: string): boolean {
    return this.docs.has(id);
  }

  /** Adds a note, replacing any earlier version of it. */
  add(doc: SearchDoc): void {
    this.remove(doc.id);

    // Title and tags are repeated into the token stream rather than scored as
    // separate fields. It is the cheapest form of field boosting there is, it
    // needs no second index, and BM25 does the rest: a note whose *title* is
    // "Kubernetes" outranks one that mentions it in passing, without a
    // hand-tuned multiplier deciding by how much.
    const tokens = [
      ...repeat(tokenize(doc.title), 4),
      ...repeat(doc.tags.flatMap(tokenize), 3),
      ...repeat(tokenize(pathWords(doc.path)), 2),
      ...tokenize(doc.content),
    ];

    const counts = new Map<string, number>();
    for (const token of tokens) {
      if (STOPWORDS.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    for (const [term, count] of counts) {
      let posting = this.postings.get(term);
      if (!posting) {
        posting = new Map();
        this.postings.set(term, posting);
      }
      posting.set(doc.id, count);
    }

    this.docs.set(doc.id, {
      id: doc.id,
      terms: [...counts.keys()],
      workspaceId: doc.workspaceId,
      path: doc.path,
      title: doc.title,
      length: tokens.length,
      text: doc.content,
      folded: doc.content.toLowerCase(),
    });

    this.totalLength += tokens.length;
    this.sortedTerms = null;
  }

  remove(id: string): void {
    const existing = this.docs.get(id);
    if (!existing) return;

    // Walking this note's own terms rather than the whole index: rebuilding a
    // library of a thousand notes does a thousand removals, and a full scan
    // each time turns that into minutes.
    for (const term of existing.terms) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      posting.delete(id);
      if (posting.size === 0) this.postings.delete(term);
    }

    this.totalLength -= existing.length;
    this.docs.delete(id);
    this.sortedTerms = null;
  }

  clear(): void {
    this.docs.clear();
    this.postings.clear();
    this.totalLength = 0;
    this.sortedTerms = null;
  }

  /**
   * Ranks notes against a query.
   *
   * `"quoted phrases"` must appear verbatim; every other term is required
   * (an AND search), because a notes app answering "these 300 notes contain
   * *one* of your words" is not answering anything.
   */
  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const { limit = 30, workspaceId, prefixLast = true } = options;
    const parsed = parseQuery(query);
    if (parsed.terms.length === 0 && parsed.phrases.length === 0) return [];

    const averageLength = this.docs.size === 0 ? 1 : this.totalLength / this.docs.size;
    const scores = new Map<string, number>();
    const matched = new Map<string, Set<string>>();

    // Every term must appear, so the per-term hit sets are intersected at the
    // end. Kept as a list rather than narrowed as we go, so a rare term still
    // contributes its full BM25 weight to the notes that do contain it.
    const seenIn: Map<string, Set<string>>[] = [];

    parsed.terms.forEach((term, position) => {
      const isLast = position === parsed.terms.length - 1;
      const expansions =
        prefixLast && isLast && !parsed.quotedLast ? this.expandPrefix(term) : [term];

      const hits = new Map<string, Set<string>>();

      for (const expansion of expansions) {
        const posting = this.postings.get(expansion);
        if (!posting) continue;

        // Inverse document frequency, in the BM25 form with the +1 that keeps
        // a term present in every note from going negative.
        const idf = Math.log(1 + (this.docs.size - posting.size + 0.5) / (posting.size + 0.5));

        for (const [id, count] of posting) {
          const doc = this.docs.get(id);
          if (!doc) continue;
          if (workspaceId && doc.workspaceId !== workspaceId) continue;

          const norm = count * (K1 + 1);
          const denominator = count + K1 * (1 - B + (B * doc.length) / averageLength);
          // A prefix expansion is a guess at what is being typed, so it scores
          // slightly under an exact term and cannot outrank one.
          const weight = expansion === term ? 1 : 0.8;

          scores.set(id, (scores.get(id) ?? 0) + (idf * norm * weight) / denominator);

          const words = hits.get(id) ?? new Set<string>();
          words.add(expansion);
          hits.set(id, words);
        }
      }

      seenIn.push(hits);
    });

    // Phrases are checked against the stored text rather than the index: an
    // inverted index without positions cannot tell "note taking" from "taking
    // note", and storing positions to answer a rare query type is not a good
    // trade for an index that lives in a browser tab.
    const phraseCandidates =
      parsed.phrases.length === 0
        ? null
        : new Set(
            [...this.docs.values()]
              .filter((doc) => {
                if (workspaceId && doc.workspaceId !== workspaceId) return false;
                const haystack = `${doc.title.toLowerCase()} ${doc.folded}`;
                return parsed.phrases.every((phrase) => haystack.includes(phrase));
              })
              .map((doc) => doc.id),
          );

    // Phrase-only queries have no scored terms, so seed them from the matches.
    if (parsed.terms.length === 0 && phraseCandidates) {
      for (const id of phraseCandidates) scores.set(id, 1);
    }

    // A term that matched nothing anywhere makes the whole AND query empty.
    if (seenIn.some((hits) => hits.size === 0)) return [];

    const results: SearchHit[] = [];

    for (const [id, score] of scores) {
      if (phraseCandidates && !phraseCandidates.has(id)) continue;
      if (!seenIn.every((hits) => hits.has(id))) continue;

      const doc = this.docs.get(id);
      if (!doc) continue;

      const words = [
        ...new Set([...seenIn.flatMap((hits) => [...(hits.get(id) ?? [])]), ...parsed.phrases]),
      ];

      results.push({
        id,
        workspaceId: doc.workspaceId,
        path: doc.path,
        title: doc.title,
        score,
        snippet: bestSnippet(doc.text, words),
        matched: words,
      });
    }

    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return results.slice(0, limit);
  }

  /** Every indexed term starting with `prefix`, found by binary search. */
  private expandPrefix(prefix: string): string[] {
    if (this.postings.has(prefix) && prefix.length < 3) return [prefix];

    this.sortedTerms ??= [...this.postings.keys()].sort();
    const terms = this.sortedTerms;

    let low = 0;
    let high = terms.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (terms[mid]! < prefix) low = mid + 1;
      else high = mid;
    }

    const out: string[] = [];
    // Bounded: a one-letter prefix in a large library otherwise expands to
    // thousands of terms, and scoring all of them changes no answer.
    for (let i = low; i < terms.length && out.length < 64; i += 1) {
      if (!terms[i]!.startsWith(prefix)) break;
      out.push(terms[i]!);
    }

    return out.length > 0 ? out : [prefix];
  }
}

// ─── Query parsing ──────────────────────────────────────────────────────────

interface ParsedQuery {
  terms: string[];
  /** Lowercased `"quoted"` phrases, which must appear verbatim. */
  phrases: string[];
  /** True when the query ends inside or just after a quote — no prefix match. */
  quotedLast: boolean;
}

export function parseQuery(query: string): ParsedQuery {
  const phrases: string[] = [];
  const rest = query.replace(/"([^"]*)"?/g, (_, phrase: string) => {
    const cleaned = phrase.trim().toLowerCase();
    if (cleaned) phrases.push(cleaned);
    return " ";
  });

  return {
    terms: tokenize(rest).filter((term) => !STOPWORDS.has(term)),
    phrases,
    quotedLast: /"\s*$/.test(query.trim()),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function repeat(tokens: string[], times: number): string[] {
  const out: string[] = [];
  for (let n = 0; n < times; n += 1) out.push(...tokens);
  return out;
}

/** `projects/q3-roadmap.md` → `projects q3 roadmap`, so the path is searchable. */
function pathWords(path: string): string {
  return path.replace(/\.mdx?$/i, "").replace(/[/\-_]+/g, " ");
}

/**
 * Cuts the most informative line out of a note.
 *
 * "Most informative" is the line covering the most distinct query terms, not
 * the first line containing any of them — a note whose opening paragraph
 * mentions one word and whose fifth paragraph is about all of them should show
 * the fifth.
 */
export function bestSnippet(text: string, terms: string[], width = 180): SearchSnippet | null {
  if (terms.length === 0 || !text) return null;

  const folded = text.toLowerCase();
  let best: { offset: number; covered: number } | null = null;

  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;

      const covered = terms.filter((other) =>
        folded.slice(Math.max(0, at - width / 2), at + width).includes(other),
      ).length;

      if (!best || covered > best.covered) best = { offset: at, covered };
      if (covered === terms.length) break;
      from = at + term.length;
    }
  }

  if (!best) return null;

  // Snap to word boundaries so a snippet never starts mid-word.
  let start = Math.max(0, best.offset - Math.floor(width / 3));
  if (start > 0) {
    const space = folded.indexOf(" ", start);
    if (space !== -1 && space - start < 24) start = space + 1;
  }

  let end = Math.min(text.length, start + width);
  if (end < text.length) {
    const space = folded.lastIndexOf(" ", end);
    if (space > start) end = space;
  }

  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const snippetText = `${prefix}${slice}${suffix}`;

  return { text: snippetText, ranges: highlightRanges(snippetText, terms) };
}

/** Where each term occurs in a snippet, merged so ranges never overlap. */
export function highlightRanges(text: string, terms: string[]): [number, number][] {
  const folded = text.toLowerCase();
  const found: [number, number][] = [];

  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      found.push([at, at + term.length]);
      from = at + term.length;
    }
  }

  found.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range] as [number, number]);
  }

  return merged;
}
