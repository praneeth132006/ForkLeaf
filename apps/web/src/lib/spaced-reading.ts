"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReadingChoice, ReadingBridge, ReadingPassage } from "@forkleaf/editor";
import {
  SCHEDULE_PATH,
  cardId,
  formatSchedule,
  parseSchedule,
  review,
  type CardState,
  type Schedule,
} from "@/lib/flashcards";
import { gap } from "@/lib/inline-flashcards";
import { plainText } from "@/lib/mind";
import { parseHighlights } from "@/lib/pdf-highlights";
import { dateStamp } from "@/lib/templates";

/**
 * Spaced reading: the passages you marked come back, a few a day.
 *
 * Highlighting a paper or saving a quote is the easy half; the passage is then
 * never seen again. So every highlight in a PDF's `.highlights.md`, every quote
 * saved from the web, and every `==highlight==` on a saved page is a passage,
 * and passages share the flashcard schedule in `reviews/flashcards.md` —
 * one file, one history, synced like everything else. Nothing is asked of a
 * passage; you reread it and say whether to see it again soon, later, or never.
 */

export interface PassageSource {
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

/** Retired passages are due on a day that never comes. */
export const RETIRED = "9999-12-31";
const HIGHLIGHTS_FILE = /\.highlights\.md$/i;
const MARK = /==(?=\S)(.+?)(?<=\S)==/g;
const MIN_WORDS = 4;
export const DAILY_PASSAGES = 5;

export const passageId = (path: string, text: string) => cardId(path, `reading:${text}`);

/** The passages one note holds, if it is a highlights file or a saved page or quote. */
export function passagesIn(source: PassageSource): ReadingPassage[] {
  const found: ReadingPassage[] = [];
  const seen = new Set<string>();
  const add = (raw: string, where: string | null, title: string) => {
    const text = plainText(raw).trim();
    if (text.split(/\s+/).length < MIN_WORDS) return;
    const id = passageId(source.path, text);
    if (seen.has(id)) return;
    seen.add(id);
    found.push({ id, text, source: title, path: source.path, where, isNew: true });
  };

  if (HIGHLIGHTS_FILE.test(source.path)) {
    const title = source.title.replace(/^Highlights\s+[—-]\s+/, "");
    for (const highlight of parseHighlights(source.content)) {
      add(highlight.text, `p. ${highlight.citation.page}`, title);
    }
    return found;
  }

  const site = typeof source.frontmatter.site === "string" ? source.frontmatter.site : null;
  if (source.frontmatter.type === "quote") {
    const quoted = source.content
      .split("\n")
      .filter((line) => line.startsWith(">"))
      .map((line) => line.replace(/^>\s?/, ""))
      .join(" ");
    if (quoted.trim()) add(quoted, site, source.title);
    return found;
  }

  if (source.frontmatter.type === "page" || typeof source.frontmatter.url === "string") {
    for (const match of source.content.matchAll(MARK)) add(match[1]!, site, source.title);
  }
  return found;
}

/** How a choice moves a passage on the schedule. */
export function choose(
  state: CardState | undefined,
  choice: ReadingChoice,
  today: string,
): CardState {
  if (choice === "done") {
    return { due: RETIRED, interval: 0, ease: state?.ease ?? 2.5, reps: (state?.reps ?? 0) + 1 };
  }
  return review(state, choice === "soon" ? "hard" : "easy", today);
}

/** What a choice says afterwards. */
export function chosenLabel(state: CardState): string {
  if (state.due === RETIRED) return "Won't come back";
  return state.interval === 1 ? "Back tomorrow" : `Back in ${gap(state.interval)}`;
}

/**
 * Today's passages: the most overdue first, then ones never seen, a few a day.
 *
 * A reading list that grows without end is a reading list nobody opens, so the
 * day is capped; what does not fit waits for tomorrow.
 */
export function dueReading(
  passages: readonly ReadingPassage[],
  schedule: Schedule,
  today: string,
  limit = DAILY_PASSAGES,
): ReadingPassage[] {
  const due = passages
    .filter((passage) => {
      const state = schedule.get(passage.id);
      return state !== undefined && state.due <= today;
    })
    .sort((a, b) => schedule.get(a.id)!.due.localeCompare(schedule.get(b.id)!.due))
    .map((passage) => ({ ...passage, isNew: false }));
  const fresh = passages.filter((passage) => !schedule.has(passage.id));
  return [...due, ...fresh].slice(0, limit);
}

export interface ReadingStore {
  allNotes: () => Promise<readonly PassageSource[]>;
  readNote: (path: string) => Promise<string | null>;
  upsertNote: (path: string, change: (content: string) => string) => Promise<string | null>;
  openNote: (path: string) => void;
}

/** The bridge a reading block in a note talks to. */
export function useSpacedReading(store: ReadingStore | null): ReadingBridge | undefined {
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });
  const enabled = store !== null;

  return useMemo<ReadingBridge | undefined>(() => {
    if (!enabled) return undefined;
    const today = () => dateStamp(new Date());
    return {
      load: async () => {
        const current = storeRef.current;
        if (!current) return [];
        const [notes, text] = await Promise.all([
          current.allNotes(),
          current.readNote(SCHEDULE_PATH),
        ]);
        return dueReading(notes.flatMap(passagesIn), parseSchedule(text), today());
      },
      choose: async (passage, choice) => {
        const current = storeRef.current;
        if (!current) throw new Error("There is no notebook open.");
        let next: CardState | null = null;
        const written = await current.upsertNote(SCHEDULE_PATH, (content) => {
          const schedule = parseSchedule(content);
          next = choose(schedule.get(passage.id), choice, today());
          return formatSchedule(schedule.set(passage.id, next));
        });
        if (written === null || next === null) throw new Error("That could not be saved.");
        return chosenLabel(next);
      },
      open: (path) => storeRef.current?.openNote(path),
    };
  }, [enabled]);
}
