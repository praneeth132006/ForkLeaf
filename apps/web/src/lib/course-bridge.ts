"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CourseBridge } from "@forkleaf/editor";
import { orderLessons, quizFrom, type LessonSource } from "@/lib/course";
import { dateStamp } from "@/lib/templates";

/**
 * What a course block in a note reads: the folders there are, and a folder's
 * notes as lessons in order with a quiz drawn from their flashcards.
 */

export interface CourseStore {
  folders: () => readonly string[];
  allNotes: () => Promise<readonly LessonSource[]>;
  openNote: (path: string) => void;
  /** The folder of the note being edited, or null at the top of the notebook. */
  currentFolder: () => string | null;
}

/** True for a note that is part of the course for `folder`, subfolders included. */
export function inCourse(path: string, folder: string): boolean {
  if (/\.highlights\.md$/i.test(path)) return false;
  return folder === "" ? !path.includes("/") : path.startsWith(`${folder}/`);
}

export function useCourseBridge(store: CourseStore | null): CourseBridge | undefined {
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });
  const enabled = store !== null;

  return useMemo<CourseBridge | undefined>(() => {
    if (!enabled) return undefined;
    return {
      folders: async () => storeRef.current?.folders() ?? [],
      load: async (folder) => {
        const current = storeRef.current;
        if (!current) return { lessons: [], quiz: [] };
        const notes = (await current.allNotes()).filter((note) => inCourse(note.path, folder));
        const lessons = orderLessons(notes);
        const titles = new Map(lessons.map((lesson) => [lesson.path, lesson.title]));
        return {
          lessons: lessons.map((lesson) => ({
            path: lesson.path,
            title: lesson.title,
            cards: lesson.cards.length,
            buildsOn: lesson.buildsOn.map((path) => titles.get(path) ?? path),
          })),
          quiz: quizFrom(lessons, dateStamp(new Date())).map((card) => ({
            question: card.question,
            answer: card.answer,
            lesson: card.noteTitle,
          })),
        };
      },
      open: (path) => storeRef.current?.openNote(path),
      currentFolder: () => storeRef.current?.currentFolder() ?? null,
    };
  }, [enabled]);
}
