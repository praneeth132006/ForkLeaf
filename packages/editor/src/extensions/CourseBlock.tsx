"use client";

import { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

/**
 * A folder of notes as a course, in the note where the block was put.
 *
 * Lessons in the order the notes build on one another, each ticked off when
 * done, with how many flashcards it holds; the next lesson picked out; and a
 * quiz at the end drawn from every lesson's cards, answered right there.
 *
 * Stored as a ```course fence holding the folder and the lessons done, so the
 * progress is plain text in the note and syncs with it.
 */

export interface CourseLesson {
  path: string;
  title: string;
  /** Flashcards written in the lesson. */
  cards: number;
  /** Titles of the lessons it builds on. */
  buildsOn: string[];
}

export interface CourseQuestion {
  question: string;
  answer: string;
  /** The lesson it comes from. */
  lesson: string;
}

export interface CourseData {
  lessons: readonly CourseLesson[];
  quiz: readonly CourseQuestion[];
}

export interface CourseBridge {
  /** Folders that can be a course. */
  folders: () => Promise<readonly string[]>;
  load: (folder: string) => Promise<CourseData>;
  open: (path: string) => void;
  /** The folder of the note being edited, to offer first. */
  currentFolder?: () => string | null;
}

export interface CourseBlockOptions {
  bridge: () => CourseBridge | undefined;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    courseBlock: {
      insertCourse: (folder?: string) => ReturnType;
    };
  }
}

type Load =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: CourseData }
  | { kind: "error"; message: string };

type Quiz = { at: number; revealed: boolean; right: number } | null;

const button =
  "rounded-lg border border-[var(--fl-border)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50";

function CourseNodeView({ node, updateAttributes, extension, editor, selected }: NodeViewProps) {
  const folder = (node.attrs.folder as string) ?? "";
  const done = (node.attrs.done as string[]) ?? [];
  const bridge = (extension.options as CourseBlockOptions).bridge();
  const canEdit = editor.isEditable;

  const [folders, setFolders] = useState<readonly string[]>([]);
  const [load, setLoad] = useState<Load>({ kind: "idle" });
  const [quiz, setQuiz] = useState<Quiz>(null);

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge.folders().then((list) => {
      if (live) setFolders(list);
    });
    return () => {
      live = false;
    };
    // Once per block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(bridge)]);

  useEffect(() => {
    if (!bridge || !folder) return;
    let live = true;
    setLoad({ kind: "loading" });
    setQuiz(null);
    bridge.load(folder).then(
      (data) => {
        if (live) setLoad({ kind: "ready", data });
      },
      (error: unknown) => {
        if (live) {
          setLoad({
            kind: "error",
            message: error instanceof Error ? error.message : "The course could not be read.",
          });
        }
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, Boolean(bridge)]);

  const lessons = load.kind === "ready" ? load.data.lessons : [];
  const questions = load.kind === "ready" ? load.data.quiz : [];
  const finished = new Set(done);
  const count = lessons.filter((lesson) => finished.has(lesson.path)).length;
  const next = lessons.find((lesson) => !finished.has(lesson.path));
  const percent = lessons.length > 0 ? Math.round((100 * count) / lessons.length) : 0;

  const toggle = (path: string) => {
    if (!canEdit) return;
    updateAttributes({
      done: finished.has(path) ? done.filter((each) => each !== path) : [...done, path],
    });
  };

  const choose = (value: string) => {
    if (!canEdit) return;
    updateAttributes({ folder: value, done: value === folder ? done : [] });
  };

  const suggestion = bridge?.currentFolder?.() ?? null;
  const question = quiz ? questions[quiz.at] : undefined;

  return (
    <NodeViewWrapper className="fl-course-node my-5" data-type="course" contentEditable={false}>
      <div
        className={`rounded-xl border bg-[var(--fl-surface)] ${
          selected ? "border-[var(--fl-accent)]" : "border-[var(--fl-border)]"
        }`}
      >
        <div
          className="flex flex-wrap items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--fl-muted)]"
          data-drag-handle
        >
          <span>Course</span>
          {folder && <span className="normal-case tracking-normal">· {folder}</span>}
          {load.kind === "ready" && lessons.length > 0 && (
            <span className="normal-case tracking-normal" data-testid="course-progress">
              · {count} of {lessons.length} done
            </span>
          )}
          {canEdit && bridge && folders.length > 0 && (
            <select
              aria-label="Course folder"
              value={folder}
              onChange={(event) => choose(event.target.value)}
              className="ml-auto max-w-44 rounded border border-[var(--fl-border)] bg-[var(--fl-bg)] px-1.5 py-0.5 text-[12px] normal-case tracking-normal text-[var(--fl-text)]"
            >
              <option value="">Choose a folder…</option>
              {folders.map((each) => (
                <option key={each} value={each}>
                  {each}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid gap-3 p-3 text-[14px]">
          {!bridge && (
            <p className="text-[var(--fl-muted)]">
              A course needs a notebook to read lessons from.
            </p>
          )}

          {bridge && !folder && (
            <div className="grid gap-2">
              <p className="leading-relaxed text-[var(--fl-muted)]">
                Pick a folder. Its notes become lessons, ordered by how they link — a note comes
                after the notes it links to — with a quiz at the end from their flashcards.
              </p>
              {canEdit && suggestion && folders.includes(suggestion) && (
                <button
                  type="button"
                  onClick={() => choose(suggestion)}
                  className={`${button} justify-self-start`}
                >
                  Make a course of {suggestion}
                </button>
              )}
            </div>
          )}

          {load.kind === "loading" && (
            <p role="status" className="text-[var(--fl-muted)]">
              Reading the lessons…
            </p>
          )}
          {load.kind === "error" && <p className="text-[var(--fl-danger)]">{load.message}</p>}

          {load.kind === "ready" && lessons.length === 0 && (
            <p className="text-[var(--fl-muted)]">There are no notes in {folder} yet.</p>
          )}

          {load.kind === "ready" && lessons.length > 0 && (
            <>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-[var(--fl-elevated)]"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Course progress"
              >
                <div className="h-full bg-[var(--fl-accent)]" style={{ width: `${percent}%` }} />
              </div>

              {next ? (
                <p className="text-[13px] text-[var(--fl-muted)]">
                  Next:{" "}
                  <button
                    type="button"
                    onClick={() => bridge?.open(next.path)}
                    className="font-medium text-[var(--fl-accent)] underline-offset-2 hover:underline"
                  >
                    {next.title}
                  </button>
                </p>
              ) : (
                <p className="text-[13px] font-medium text-[var(--fl-text)]">
                  Every lesson is done{questions.length > 0 ? " — time for the quiz." : "."}
                </p>
              )}

              <ol className="grid gap-1">
                {lessons.map((lesson, index) => (
                  <li
                    key={lesson.path}
                    className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                      lesson === next ? "bg-[var(--fl-elevated)]" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={finished.has(lesson.path)}
                      disabled={!canEdit}
                      onChange={() => toggle(lesson.path)}
                      aria-label={`Done: ${lesson.title}`}
                      className="mt-1"
                    />
                    <span className="w-5 shrink-0 pt-px text-right text-[12px] text-[var(--fl-muted)]">
                      {index + 1}.
                    </span>
                    <span className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => bridge?.open(lesson.path)}
                        className={`text-left underline-offset-2 hover:underline ${
                          finished.has(lesson.path)
                            ? "text-[var(--fl-muted)] line-through"
                            : "text-[var(--fl-text)]"
                        }`}
                      >
                        {lesson.title}
                      </button>
                      {lesson.buildsOn.length > 0 && (
                        <span className="block text-[12px] text-[var(--fl-muted)]">
                          Builds on {lesson.buildsOn.join(", ")}
                        </span>
                      )}
                    </span>
                    {lesson.cards > 0 && (
                      <span className="shrink-0 rounded bg-[var(--fl-elevated)] px-1.5 py-0.5 text-[11.5px] text-[var(--fl-muted)]">
                        {lesson.cards} {lesson.cards === 1 ? "card" : "cards"}
                      </span>
                    )}
                  </li>
                ))}
              </ol>

              <div className="border-t border-[var(--fl-border)] pt-3">
                {questions.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--fl-muted)]">
                    Write <code>Question :: Answer</code> lines in the lessons and a quiz appears
                    here.
                  </p>
                ) : !quiz ? (
                  <button
                    type="button"
                    onClick={() => setQuiz({ at: 0, revealed: false, right: 0 })}
                    className={button}
                  >
                    Take the quiz · {questions.length}{" "}
                    {questions.length === 1 ? "question" : "questions"}
                  </button>
                ) : question ? (
                  <div className="grid gap-2" data-testid="course-quiz">
                    <p className="text-[12px] text-[var(--fl-muted)]">
                      Question {quiz.at + 1} of {questions.length} · {question.lesson}
                    </p>
                    <p className="text-[15px] font-medium text-[var(--fl-text)]">
                      {question.question}
                    </p>
                    {quiz.revealed ? (
                      <>
                        <p className="border-t border-dashed border-[var(--fl-border)] pt-2 text-[var(--fl-text)]">
                          {question.answer}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setQuiz({ at: quiz.at + 1, revealed: false, right: quiz.right + 1 })
                            }
                            className={button}
                          >
                            I knew it
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuiz({ ...quiz, at: quiz.at + 1, revealed: false })}
                            className={button}
                          >
                            I didn&rsquo;t
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setQuiz({ ...quiz, revealed: true })}
                        className={`${button} justify-self-start`}
                      >
                        Show answer
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2" role="status">
                    <p className="font-medium text-[var(--fl-text)]">
                      Quiz done: {quiz.right} of {questions.length} right.
                    </p>
                    <button
                      type="button"
                      onClick={() => setQuiz({ at: 0, revealed: false, right: 0 })}
                      className={button}
                    >
                      Take it again
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

/** The block's text: `folder:` and, once lessons are done, a `done:` list. */
function courseText(folder: string, done: readonly string[]): string {
  const lines = [`folder: ${folder}`];
  if (done.length > 0) lines.push("done:", ...done.map((path) => `- ${path}`));
  return lines.join("\n");
}

function readCourse(text: string): { folder: string; done: string[] } {
  let folder = "";
  const done: string[] = [];
  let inDone = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const field = /^(folder|done)\s*:\s*(.*)$/i.exec(line);
    if (field) {
      inDone = field[1]!.toLowerCase() === "done";
      if (!inDone)
        folder = field[2]!
          .trim()
          .replace(/^["']|["']$/g, "")
          .replace(/\/+$/, "");
      continue;
    }
    if (inDone && line.startsWith("- ")) {
      const path = line.slice(2).trim();
      if (path && !done.includes(path)) done.push(path);
    }
  }
  return { folder, done };
}

export const CourseBlock = Node.create<CourseBlockOptions>({
  name: "courseBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { bridge: () => undefined };
  },

  addAttributes() {
    return {
      folder: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-folder") ?? "",
        renderHTML: (attributes) => ({ "data-folder": attributes.folder as string }),
      },
      done: {
        default: [],
        parseHTML: (element) => {
          try {
            const value = JSON.parse(element.getAttribute("data-done") ?? "[]") as unknown;
            return Array.isArray(value) ? value.filter((each) => typeof each === "string") : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({ "data-done": JSON.stringify(attributes.done ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="course"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "course" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CourseNodeView);
  },

  addCommands() {
    return {
      insertCourse:
        (folder = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { folder, done: [] } }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { folder?: string; done?: string[] } }) {
          state.write("```course\n");
          state.text(courseText(node.attrs.folder ?? "", node.attrs.done ?? []), false);
          state.ensureNewLine();
          state.write("```");
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const code of Array.from(
              element.querySelectorAll<HTMLElement>("pre > code.language-course"),
            )) {
              const course = readCourse(code.textContent ?? "");
              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "course");
              replacement.setAttribute("data-folder", course.folder);
              replacement.setAttribute("data-done", JSON.stringify(course.done));
              code.parentElement?.replaceWith(replacement);
            }
          },
        },
      },
    };
  },
});

interface SerializerState {
  write(text: string): void;
  text(text: string, escape?: boolean): void;
  ensureNewLine(): void;
  closeBlock(node: unknown): void;
}
