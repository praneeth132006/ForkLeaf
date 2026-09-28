"use client";

import { useEffect, useRef, useState } from "react";
import { deriveTitle } from "@forkleaf/markdown-engine";
import {
  SCHEDULE_PATH,
  findCards,
  parseSchedule,
  studyCount,
  wantsClozes,
  type Card,
} from "@/lib/flashcards";
import { isMarkdown } from "@/lib/library";
import { dateStamp } from "@/lib/templates";

/**
 * How many cards are waiting today, for the status bar.
 *
 * Flashcards used to be something you had to remember existed: the only way in
 * was a command. A count where you already look — "12 cards due" — is the
 * reminder spaced repetition depends on, and one click on it starts studying.
 *
 * Counted after the notebook has been still for a moment, so typing in a note
 * never waits on reading every other one.
 */

export interface DueSource {
  allNotes: () => Promise<
    readonly { path: string; content: string; frontmatter: Record<string, unknown> }[]
  >;
  readNote: (path: string) => Promise<string | null>;
}

/** Every card in a set of notes, skipping the schedule file and anything that is not markdown. */
export function cardsInNotes(
  notes: readonly { path: string; content: string; frontmatter: Record<string, unknown> }[],
  skip: (path: string) => boolean = () => false,
): Card[] {
  return notes
    .filter((entry) => isMarkdown(entry.path) && entry.path !== SCHEDULE_PATH && !skip(entry.path))
    .flatMap((entry) =>
      findCards(
        entry.path,
        deriveTitle(entry.content, entry.frontmatter.title, entry.path),
        entry.content,
        { clozes: wantsClozes(entry.frontmatter, entry.content) },
      ),
    );
}

const SETTLE_MS = 1500;

/**
 * The number of cards a study session would show right now, or null before
 * it is known. `refresh` lists what changes when the answer might have: the
 * file tree, a dialog closing, the note being switched.
 */
export function useDueCount(
  source: DueSource | null,
  refresh: readonly unknown[],
  skip?: (path: string) => boolean,
): number | null {
  const [count, setCount] = useState<number | null>(null);
  const sourceRef = useRef(source);
  const skipRef = useRef(skip);
  useEffect(() => {
    sourceRef.current = source;
    skipRef.current = skip;
  });
  const enabled = source !== null;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const timer = window.setTimeout(() => {
      const current = sourceRef.current;
      if (!current) return;
      Promise.all([current.allNotes(), current.readNote(SCHEDULE_PATH)]).then(
        ([notes, schedule]) => {
          if (!live) return;
          const cards = cardsInNotes(notes, skipRef.current);
          setCount(studyCount(cards, parseSchedule(schedule), dateStamp(new Date())));
        },
        () => undefined,
      );
    }, SETTLE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // The caller's list is the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...refresh]);

  return enabled ? count : null;
}
