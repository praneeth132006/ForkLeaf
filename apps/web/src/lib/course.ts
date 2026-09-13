import {
  basename,
  extractWikilinks,
  resolveFromNote,
  resolveWikilink,
} from "@forkleaf/markdown-engine";
import { cardId, findCards, type Card } from "@/lib/flashcards";

/**
 * A folder of notes, as a course.
 *
 * The order comes from the notes themselves. A note that links to another
 * builds on it, so the one linked to is taught first; a folder with an index
 * (`index.md`, `README.md`, `Overview.md`) starts there, and the order its
 * links are written in is the order it asks for. Where links go round in a
 * circle, the note more of the others build on comes first. Each lesson
 * brings the flashcards written in it, and the quiz at the end is drawn from
 * all of them.
 *
 * Progress is kept by the course block in the note (see the editor's
 * `CourseBlock`), so it is plain text in the repository like everything else.
 */

export interface LessonSource {
  path: string;
  title: string;
  content: string;
}

export interface Lesson {
  path: string;
  title: string;
  cards: Card[];
  /** Paths of the lessons in this course that this one links to. */
  buildsOn: string[];
  /** True for the folder's index, which opens the course. */
  intro: boolean;
}

const INTRO = /^(index|readme|overview|introduction|intro|start[ -_]here|contents)\.md$/i;
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+\.md)(?:#[^)]*)?\)/gi;

/** The notes a note links to, in the order the links are written. */
function linksIn(source: LessonSource, all: readonly LessonSource[]): string[] {
  const found: { at: number; path: string }[] = [];
  const paths = new Set(all.map((each) => each.path));

  for (const link of extractWikilinks(source.content)) {
    const match = resolveWikilink(link.target, all);
    if (match && match.path !== source.path) found.push({ at: link.start, path: match.path });
  }
  for (const match of source.content.matchAll(MARKDOWN_LINK)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(match[1]!)) continue;
    const path = resolveFromNote(source.path, decodeURI(match[1]!));
    if (paths.has(path) && path !== source.path) found.push({ at: match.index ?? 0, path });
  }

  const ordered: string[] = [];
  for (const entry of found.sort((a, b) => a.at - b.at)) {
    if (!ordered.includes(entry.path)) ordered.push(entry.path);
  }
  return ordered;
}

/** The lessons of a course, in the order to take them. */
export function orderLessons(sources: readonly LessonSource[]): Lesson[] {
  const notes = [...sources].sort((a, b) => a.path.localeCompare(b.path));
  const intro = notes.find((note) => INTRO.test(basename(note.path))) ?? null;
  const links = new Map(notes.map((note) => [note.path, linksIn(note, notes)]));

  // Where the index lists a note, when it does.
  const listed = new Map((intro ? links.get(intro.path)! : []).map((path, index) => [path, index]));
  const needs = new Map(
    notes.map((note) => [
      note.path,
      new Set(note === intro ? [] : links.get(note.path)!.filter((path) => path !== intro?.path)),
    ]),
  );
  const builtOnBy = new Map(notes.map((note) => [note.path, 0]));
  for (const [, wanted] of needs) {
    for (const path of wanted) builtOnBy.set(path, (builtOnBy.get(path) ?? 0) + 1);
  }

  const rank = (note: LessonSource) =>
    [
      note === intro ? -1 : 0,
      listed.get(note.path) ?? Number.MAX_SAFE_INTEGER,
      -(builtOnBy.get(note.path) ?? 0),
    ] as const;
  const before = (a: LessonSource, b: LessonSource) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
    return a.title.localeCompare(b.title);
  };

  const placed = new Set<string>();
  const order: LessonSource[] = [];
  let left = [...notes];
  while (left.length > 0) {
    const ready = left.filter((note) =>
      [...needs.get(note.path)!].every((path) => placed.has(path)),
    );
    // A circle of links: take the best-placed note and carry on.
    const next = (ready.length > 0 ? ready : left).sort(before)[0]!;
    order.push(next);
    placed.add(next.path);
    left = left.filter((note) => note !== next);
  }

  return order.map((note) => ({
    path: note.path,
    title: note.title,
    cards: findCards(note.path, note.title, note.content),
    buildsOn: [...needs.get(note.path)!],
    intro: note === intro,
  }));
}

/**
 * The end-of-course quiz: cards from every lesson, taken in turn so no single
 * lesson crowds the others out, shuffled by a seed so a retake on another day
 * asks a different set.
 */
export function quizFrom(lessons: readonly Lesson[], seed: string, limit = 10): Card[] {
  const shuffled = lessons.map((lesson) =>
    [...lesson.cards].sort(
      (a, b) => cardId(seed, a.id).localeCompare(cardId(seed, b.id)) || a.id.localeCompare(b.id),
    ),
  );
  const picked: Card[] = [];
  for (let round = 0; picked.length < limit; round += 1) {
    let added = false;
    for (const cards of shuffled) {
      const card = cards[round];
      if (!card) continue;
      picked.push(card);
      added = true;
      if (picked.length === limit) break;
    }
    if (!added) break;
  }
  return picked;
}
