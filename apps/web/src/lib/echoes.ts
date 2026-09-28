/**
 * Echoes: a sentence you wrote a day, a week, a month and a year ago.
 *
 * Resurfacing tools bring back facts. This brings back your own thinking —
 * one line from what you wrote on each of those days — and asks one question
 * of it: is it still true? Reading what you believed a year ago next to what
 * you believe now is the fastest way to notice you have changed your mind.
 *
 * "Written on a day" is read from where the notebook already says so: a note
 * whose path carries the date — the daily note, `journal/2026-09-28.md`, and
 * every scheduled note named after its day. Nothing new has to be recorded.
 *
 * The sentence is chosen the same way all day, so reloading does not shuffle
 * it; tomorrow brings different ones.
 */

export const ECHO_SPANS = [
  { days: 1, label: "Yesterday" },
  { days: 7, label: "A week ago" },
  { days: 30, label: "A month ago" },
  { days: 365, label: "A year ago" },
] as const;

export interface EchoSource {
  id: string;
  path: string;
  title: string;
  text: string;
}

export interface Echo {
  label: string;
  day: string;
  source: EchoSource;
  sentence: string;
}

function shift(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/**
 * The sentences worth bringing back: prose, long enough to say something,
 * short enough to read at a glance. Headings, code, tables, cards, links on
 * their own and bare list stubs are not.
 */
export function sentencesIn(markdown: string): string[] {
  const out: string[] = [];
  let fence = false;
  for (const raw of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence || /^\s*(#|\||>|---|<)/.test(raw) || raw.includes("::")) continue;
    const line = raw
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
      .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/!?\[\[([^\]]+)\]\]/g, "$1")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~=]{1,2}/g, "")
      .trim();
    for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)) {
      const clean = sentence.trim();
      const words = clean.split(/\s+/).length;
      if (clean.length >= 30 && clean.length <= 240 && words >= 6) out.push(clean);
    }
  }
  return out;
}

/** Today's echoes, oldest span last. Only days with something written on them. */
export function echoes(sources: readonly EchoSource[], today: string): Echo[] {
  return ECHO_SPANS.flatMap((span) => {
    const day = shift(today, span.days);
    const candidates = sources
      .filter((source) => source.path.includes(day))
      .flatMap((source) => sentencesIn(source.text).map((sentence) => ({ source, sentence })));
    if (candidates.length === 0) return [];
    const pick = candidates[hash(`${today}:${day}`) % candidates.length]!;
    return [{ label: span.label, day, source: pick.source, sentence: pick.sentence }];
  });
}

// ── What was said about each echo ─────────────────────────────────────────

export const ECHO_ANSWERS_KEY = "forkleaf:echo-answers";
export type EchoAnswer = "true" | "changed" | "forgot";

/** Answers are keyed by the sentence and the day it was shown, and kept for a month. */
export function answerKey(echo: Echo, today: string): string {
  return `${today}:${hash(echo.sentence)}`;
}

export function parseAnswers(raw: string | null): Record<string, EchoAnswer> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, EchoAnswer] =>
          entry[1] === "true" || entry[1] === "changed" || entry[1] === "forgot",
      ),
    );
  } catch {
    return {};
  }
}

/** With one more answer, dropping any older than thirty days. */
export function withAnswer(
  answers: Record<string, EchoAnswer>,
  key: string,
  answer: EchoAnswer,
  today: string,
): Record<string, EchoAnswer> {
  const cutoff = shift(today, 30);
  const kept = Object.fromEntries(
    Object.entries(answers).filter(([stored]) => stored.slice(0, 10) >= cutoff),
  );
  return { ...kept, [key]: answer };
}
