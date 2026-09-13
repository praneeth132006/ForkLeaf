"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FlashcardBridge, FlashcardFace, FlashcardGrade } from "@forkleaf/editor";
import {
  SCHEDULE_PATH,
  cardId,
  formatSchedule,
  parseSchedule,
  readable,
  review,
  type CardState,
  type Schedule,
} from "@/lib/flashcards";
import { dateStamp } from "@/lib/templates";

/**
 * Flashcards studied where they are written.
 *
 * A card in the note says whether it is new, due, or when it is next shown,
 * and is graded right there. The grade goes into the same schedule file the
 * review session uses, so a card graded in the note is not asked again in the
 * session the same day, and the other way round.
 */

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const gap = (days: number) =>
  days < 30
    ? plural(days, "day")
    : days < 365
      ? plural(Math.round(days / 30), "month")
      : plural(Math.round(days / 365), "year");

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = to.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** What a card in the note says about itself. */
export function cardStatus(state: CardState | undefined, today: string): string {
  if (!state) return "New card";
  if (state.due <= today) return "Due today";
  const days = daysBetween(today, state.due);
  return days === 1 ? "Next review tomorrow" : `Next review in ${gap(days)}`;
}

/** When each grade would bring the card back. */
export function gradePreview(
  state: CardState | undefined,
  today: string,
): Record<FlashcardGrade, string> {
  const when = (grade: FlashcardGrade) => {
    const days = review(state, grade, today).interval;
    return days === 1 ? "tomorrow" : `in ${gap(days)}`;
  };
  return { again: when("again"), hard: when("hard"), good: when("good"), easy: when("easy") };
}

/** The schedule id of the card a note's `Question :: Answer` line makes. */
export const faceId = (path: string, face: FlashcardFace) => cardId(path, readable(face.question));

export interface ScheduleStore {
  readNote: (path: string) => Promise<string | null>;
  upsertNote: (path: string, change: (content: string) => string) => Promise<string | null>;
}

/**
 * The bridge the editor's cards talk to, for the note at `path`.
 *
 * Grades are written by re-reading the schedule file and changing one row, so
 * a grade from another tab or device since this note opened is never lost.
 */
export function useInlineFlashcards(
  path: string | null,
  store: ScheduleStore,
  onProblem?: (message: string) => void,
): FlashcardBridge | undefined {
  const schedule = useRef<Schedule>(new Map());
  const version = useRef(0);
  const listeners = useRef(new Set<() => void>());
  const storeRef = useRef(store);
  const problemRef = useRef(onProblem);
  useEffect(() => {
    storeRef.current = store;
    problemRef.current = onProblem;
  });

  const notify = () => {
    version.current += 1;
    for (const listener of listeners.current) listener();
  };

  useEffect(() => {
    if (!path) return;
    let live = true;
    storeRef.current.readNote(SCHEDULE_PATH).then(
      (content) => {
        if (!live) return;
        schedule.current = parseSchedule(content);
        notify();
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [path]);

  return useMemo<FlashcardBridge | undefined>(() => {
    if (!path) return undefined;
    const today = () => dateStamp(new Date());
    return {
      status: (face) => cardStatus(schedule.current.get(faceId(path, face)), today()),
      preview: (face) => gradePreview(schedule.current.get(faceId(path, face)), today()),
      grade: (face, grade) => {
        const id = faceId(path, face);
        const next = review(schedule.current.get(id), grade, today());
        schedule.current = new Map(schedule.current).set(id, next);
        notify();
        void storeRef.current
          .upsertNote(SCHEDULE_PATH, (content) =>
            formatSchedule(parseSchedule(content).set(id, next)),
          )
          .then(
            (written) => {
              if (written === null) problemRef.current?.("The grade could not be saved.");
            },
            () => problemRef.current?.("The grade could not be saved."),
          );
      },
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      version: () => version.current,
    };
  }, [path]);
}
