import { plainText } from "@/lib/mind";

/**
 * The auto-glossary: every term the notebook defines, and where.
 *
 * A definition is written the way people already write them:
 *
 * - `**Idempotent** means running it twice changes nothing.` — a bold term at
 *   the start of a sentence, followed by "is", "are", "means", "refers to",
 *   "describes", "stands for", or a colon or dash.
 * - Under a heading called Glossary, Definitions, Terms or Vocabulary, any
 *   `- Term: definition` or `- Term — definition` line.
 *
 * Wherever the term then appears, in any note, it can be hovered for its
 * definition. Nothing has to be registered or kept in sync: the notes are the
 * glossary.
 */

export interface GlossarySource {
  path: string;
  title: string;
  content: string;
}

export interface GlossaryEntry {
  /** As written in the definition. */
  term: string;
  /** Lower case, or exact for an acronym — what is matched against. */
  key: string;
  definition: string;
  path: string;
  title: string;
  /** 1-based line of the definition. */
  line: number;
}

const BOLD_DEFINITION =
  /^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*|__)([^*_\n]{2,60}?)(?:\*\*|__)\s*(?:(:|—|–|-)\s*|\(([^)]{1,40})\)\s*(?:is|are|means)\s+|((?:is|are|was|were)(?: an?| the)?|means|refers to|describes|stands for|denotes)\s+)(.+)$/i;
const GLOSSARY_HEADING =
  /^\s*#{1,6}\s+(?:glossary|definitions?|terms|vocabulary|key terms|jargon)\b/i;
const LIST_DEFINITION =
  /^\s*[-*+]\s+(?:\*\*|__)?([^:*_—–\n]{2,60}?)(?:\*\*|__)?\s*(?::|—|–| - )\s*(.+)$/;
const ANY_HEADING = /^\s*#{1,6}\s+/;
const MAX_DEFINITION = 240;

/** True for a term that must match exactly: an acronym, so "IT" does not match "it". */
function exact(term: string): boolean {
  const letters = term.replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters.length <= 6 && letters === letters.toUpperCase();
}

export function keyOf(term: string): string {
  const clean = term.trim().replace(/\s+/g, " ");
  return exact(clean) ? clean : clean.toLowerCase();
}

function firstSentence(text: string): string {
  const plain = plainText(text).replace(/\s+/g, " ").trim();
  const sentence = /^(.+?[.!?])(\s|$)/u.exec(plain)?.[1] ?? plain;
  return sentence.length > MAX_DEFINITION
    ? `${sentence.slice(0, MAX_DEFINITION - 1).trimEnd()}…`
    : sentence;
}

/** Capitalises the first letter, for a definition that began mid-sentence. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Every definition in one note. */
export function definitionsIn(source: GlossarySource): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  let fence = false;
  let inGlossary = false;

  source.content.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    if (ANY_HEADING.test(line)) {
      inGlossary = GLOSSARY_HEADING.test(line);
      return;
    }

    const bold = BOLD_DEFINITION.exec(line);
    if (bold) {
      const written = bold[1]!.trim();
      // "An event loop is…" defines "event loop": the article is grammar.
      const term = written.replace(/^(?:a|an|the)\s+/i, "");
      const verb = bold[4];
      const rest = bold[5]!.trim();
      // "X is …" keeps its verb, so the card reads as a sentence; "X: …" does not need one.
      const definition = verb ? `${written} ${verb.toLowerCase()} ${rest}` : sentenceCase(rest);
      if (rest.length >= 3) {
        entries.push({
          term,
          key: keyOf(term),
          definition: firstSentence(definition),
          path: source.path,
          title: source.title,
          line: index + 1,
        });
      }
      return;
    }

    if (inGlossary) {
      const item = LIST_DEFINITION.exec(line);
      if (item) {
        const term = plainText(item[1]!).trim();
        const rest = item[2]!.trim();
        if (term && rest.length >= 3) {
          entries.push({
            term,
            key: keyOf(term),
            definition: firstSentence(sentenceCase(rest)),
            path: source.path,
            title: source.title,
            line: index + 1,
          });
        }
      }
    }
  });

  return entries;
}

export interface Glossary {
  /** One entry per term; the first definition found wins, the rest are kept. */
  entries: Map<string, GlossaryEntry[]>;
  /** Finds glossary terms in a run of text. */
  match: (text: string) => Array<{ from: number; to: number; key: string }>;
}

/** Builds the glossary from the whole notebook. */
export function buildGlossary(sources: readonly GlossarySource[]): Glossary {
  return glossaryFrom(sources.map((source) => definitionsIn(source)));
}

/**
 * Builds the glossary from definitions already read, note by note.
 *
 * For the editor, which reads every note once and then only the note being
 * typed in again — re-reading the whole notebook on every keystroke would be
 * the slow way to notice one new definition.
 */
export function glossaryFrom(perNote: Iterable<readonly GlossaryEntry[]>): Glossary {
  const entries = new Map<string, GlossaryEntry[]>();
  for (const list of perNote) {
    for (const entry of list) {
      const existing = entries.get(entry.key);
      if (existing) existing.push(entry);
      else entries.set(entry.key, [entry]);
    }
  }
  return { entries, match: matcher([...entries.keys()]) };
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Plural and possessive forms count as the term: APIs, API's, idempotents. */
const SUFFIX = "(?:'s|’s|s|es)?";

function matcher(keys: readonly string[]): Glossary["match"] {
  if (keys.length === 0) return () => [];
  // Longest first, so "event loop" wins over "event".
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  const loose = sorted.filter((key) => key === key.toLowerCase());
  const strict = sorted.filter((key) => key !== key.toLowerCase());
  const pattern = (list: string[], flags: string) =>
    list.length === 0
      ? null
      : new RegExp(
          `(?<![\\p{L}\\p{N}_])(${list.map((key) => escape(key).replace(/ /g, "\\s+")).join("|")})${SUFFIX}(?![\\p{L}\\p{N}_])`,
          flags,
        );
  const patterns = [pattern(strict, "gu"), pattern(loose, "giu")].filter(
    (value): value is RegExp => value !== null,
  );

  return (text) => {
    const found: Array<{ from: number; to: number; key: string }> = [];
    for (const regex of patterns) {
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        const from = match.index!;
        const to = from + match[0].length;
        if (found.some((other) => from < other.to && to > other.from)) continue;
        found.push({ from, to, key: keyOf(match[1]!) });
      }
    }
    return found.sort((a, b) => a.from - b.from);
  };
}
