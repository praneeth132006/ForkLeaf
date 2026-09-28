/**
 * A receipt for every time a note left this browser for a model.
 *
 * The assistant, and the cards it writes, send notes straight from this page
 * to the provider the reader chose. That is the private way to do it — nothing
 * passes through ForkLeaf — and it also means nobody but this page can say
 * what was sent. So this page keeps the record: when, to which provider and
 * model, which note, how much of it, and what was asked.
 *
 * Kept on this device, in localStorage, the last few hundred sends. It is an
 * audit of *this browser's* sends, which is exactly what it can vouch for;
 * syncing it would put a commit in the repository every time a question was
 * asked. The question is kept short and the note's text is never kept at all —
 * a log of what was sent should not become a second copy of it.
 */

export const RECEIPTS_KEY = "forkleaf:ai-receipts";
const LIMIT = 500;
const QUESTION_PREVIEW = 120;

export interface Receipt {
  /** ISO timestamp of the send. */
  at: string;
  /** "Claude", "OpenAI", "Gemini", or the host of a compatible server. */
  provider: string;
  model: string;
  /** The host the request went to — the fact that matters most. */
  host: string;
  /** What asked: "Assistant", "Flashcards", … */
  purpose: string;
  /** The note that went with it, or null when none did. */
  note: { title: string; path: string | null; characters: number } | null;
  /** The start of what was asked. */
  question: string;
}

export function parseReceipts(raw: string | null): Receipt[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is Receipt =>
        entry !== null &&
        typeof entry === "object" &&
        typeof (entry as Receipt).at === "string" &&
        typeof (entry as Receipt).host === "string",
    );
  } catch {
    return [];
  }
}

/** The list with one more receipt, newest first, trimmed to the limit. */
export function withReceipt(receipts: readonly Receipt[], receipt: Receipt): Receipt[] {
  return [receipt, ...receipts].slice(0, LIMIT);
}

export function shortQuestion(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > QUESTION_PREVIEW ? `${flat.slice(0, QUESTION_PREVIEW - 1)}…` : flat;
}

export function readReceipts(): Receipt[] {
  try {
    return parseReceipts(window.localStorage.getItem(RECEIPTS_KEY));
  } catch {
    return [];
  }
}

export function recordReceipt(receipt: Receipt): void {
  try {
    const next = withReceipt(readReceipts(), receipt);
    window.localStorage.setItem(RECEIPTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(RECEIPTS_KEY));
  } catch {
    // Storage full or blocked: the send still happens, unrecorded — and the
    // receipts view says receipts are kept only where storage allows.
  }
}

export function clearReceipts(): void {
  try {
    window.localStorage.removeItem(RECEIPTS_KEY);
    window.dispatchEvent(new CustomEvent(RECEIPTS_KEY));
  } catch {
    // Nothing to clear.
  }
}

/** Receipts grouped by day, newest day first, for reading. */
export function byDay(receipts: readonly Receipt[]): { day: string; receipts: Receipt[] }[] {
  const days = new Map<string, Receipt[]>();
  for (const receipt of receipts) {
    const day = receipt.at.slice(0, 10);
    const list = days.get(day) ?? [];
    list.push(receipt);
    days.set(day, list);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({ day, receipts: list }));
}

/** How many times each note has been sent, most first. */
export function notesSent(receipts: readonly Receipt[]): { title: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const receipt of receipts) {
    if (!receipt.note) continue;
    const key = receipt.note.path ?? receipt.note.title;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}
