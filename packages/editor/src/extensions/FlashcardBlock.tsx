"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode, NodeType } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { parseCardLine } from "@forkleaf/markdown-engine";
import { caretBelow } from "../caret";

/**
 * A flashcard, drawn as a card where it was written.
 *
 * The note keeps the line `Question :: Answer` — the spelling Obsidian's
 * spaced-repetition plugin reads, and a readable line on github.com. Typing
 * that line used to leave exactly that text on screen, with nothing to say it
 * was a card or what to do with it. Here it becomes one: the question, a
 * button that turns it over, grades that schedule it, and fields to change it,
 * all in the note.
 *
 * Only a line of plain text becomes a card. A line with bold, a link or code
 * in it stays text — the card could not write that formatting back — and is
 * still a card in the review queue.
 */

export type FlashcardGrade = "again" | "hard" | "good" | "easy";

export interface FlashcardFace {
  question: string;
  answer: string;
  reversed: boolean;
}

/** What the app can tell a card about its schedule, and do when it is graded. */
export interface FlashcardBridge {
  /** "New card", "Due today", "Next review in 6 days" — or null to say nothing. */
  status: (card: FlashcardFace) => string | null;
  /** When each grade would bring the card back, e.g. `{ good: "6 days" }`. */
  preview?: (card: FlashcardFace) => Partial<Record<FlashcardGrade, string>>;
  grade: (card: FlashcardFace, grade: FlashcardGrade) => void;
  /** Called with a listener that is told whenever the schedule changes. */
  subscribe?: (listener: () => void) => () => void;
  /** A value that changes whenever the schedule does. */
  version?: () => number;
}

export interface FlashcardBlockOptions {
  /** Read through a ref, so a bridge that arrives later still reaches the editor. */
  bridge: () => FlashcardBridge | undefined;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    flashcardBlock: {
      /** Inserts a card with its fields open. */
      insertFlashcard: (card?: Partial<FlashcardFace>) => ReturnType;
    };
  }
}

const GRADES: { grade: FlashcardGrade; label: string }[] = [
  { grade: "again", label: "Forgot" },
  { grade: "hard", label: "Hard" },
  { grade: "good", label: "Good" },
  { grade: "easy", label: "Easy" },
];

const noop = () => () => undefined;
const zero = () => 0;

function FlashcardNodeView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
  selected,
  extension,
}: NodeViewProps) {
  const question = (node.attrs.question as string) ?? "";
  const answer = (node.attrs.answer as string) ?? "";
  const reversed = Boolean(node.attrs.reversed);
  const bridge = (extension.options as FlashcardBlockOptions).bridge();

  const [editing, setEditing] = useState(!question.trim() && !answer.trim());
  const [revealed, setRevealed] = useState(false);
  const [graded, setGraded] = useState<string | null>(null);
  const questionRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);

  // Re-read the card's status whenever the schedule changes.
  useSyncExternalStore(bridge?.subscribe ?? noop, bridge?.version ?? zero, zero);

  useEffect(() => {
    if (!editing) return;
    // After the editor has finished placing its own selection, or it takes the
    // focus straight back from the field.
    const timer = window.setTimeout(() => {
      (question.trim() ? answerRef.current : questionRef.current)?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
    // Only when the fields open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const face: FlashcardFace = { question, answer, reversed };
  const canEdit = editor.isEditable;

  const finish = () => {
    setEditing(false);
    const position = typeof getPos === "function" ? getPos() : undefined;
    if (!question.trim() && !answer.trim()) {
      deleteNode();
      editor.commands.focus();
      return;
    }
    if (typeof position === "number") {
      caretBelow(editor.view, position + node.nodeSize);
      editor.view.focus();
    }
  };

  const status = graded ?? bridge?.status(face) ?? null;
  const previews = revealed && bridge?.preview ? bridge.preview(face) : {};

  return (
    <NodeViewWrapper
      className="fl-flashcard-node my-3"
      data-type="flashcard"
      data-drag-handle
      contentEditable={false}
    >
      <div
        className={`rounded-xl border bg-[var(--fl-surface)] transition-colors ${
          selected || editing
            ? "border-[var(--fl-accent)]"
            : "border-[var(--fl-border)] hover:border-[var(--fl-border-strong)]"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--fl-muted)]">
          <CardsIcon />
          <span>{reversed ? "Flashcard · both ways" : "Flashcard"}</span>
          {status && !editing && (
            <span className="ml-auto normal-case tracking-normal" data-testid="flashcard-status">
              {status}
            </span>
          )}
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`${status ? "" : "ml-auto "}rounded px-1.5 py-0.5 normal-case tracking-normal hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]`}
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="grid gap-2 p-3">
            <label className="grid gap-1 text-[12px] text-[var(--fl-muted)]">
              Question
              <input
                ref={questionRef}
                value={question}
                aria-label="Question"
                placeholder="What do you want to remember?"
                onChange={(event) => updateAttributes({ question: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    answerRef.current?.focus();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    finish();
                  }
                }}
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2.5 py-1.5 text-[15px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />
            </label>
            <label className="grid gap-1 text-[12px] text-[var(--fl-muted)]">
              Answer
              <input
                ref={answerRef}
                value={answer}
                aria-label="Answer"
                placeholder="The answer"
                onChange={(event) => updateAttributes({ answer: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    event.preventDefault();
                    finish();
                  }
                }}
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2.5 py-1.5 text-[15px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--fl-muted)]">
                <input
                  type="checkbox"
                  checked={reversed}
                  onChange={(event) => updateAttributes({ reversed: event.target.checked })}
                />
                Also ask the answer, for the question
              </label>
              <button
                type="button"
                onClick={finish}
                className="ml-auto rounded-lg bg-[var(--fl-accent)] px-3 py-1 text-[13px] font-semibold text-[var(--fl-accent-contrast)] hover:bg-[var(--fl-accent-hover)]"
              >
                Done
              </button>
            </div>
            {question.trim() && !answer.trim() && (
              <p className="text-[12px] text-[var(--fl-muted)]">
                A card needs an answer too, or it stays a line of text.
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed((open) => !open)}
            aria-expanded={revealed}
            aria-label={revealed ? "Hide answer" : "Show answer"}
            className="block w-full px-4 py-3 text-left"
          >
            <span className="block text-[16px] font-medium leading-snug text-[var(--fl-text)]">
              {question || <span className="text-[var(--fl-muted)]">Empty question</span>}
            </span>
            {revealed ? (
              <span
                className="mt-2 block border-t border-dashed border-[var(--fl-border)] pt-2 text-[15px] leading-snug text-[var(--fl-text)]"
                data-testid="flashcard-answer"
              >
                {answer}
              </span>
            ) : (
              <span className="mt-1 block text-[12px] text-[var(--fl-muted)]">
                Think of the answer, then click to turn the card over
              </span>
            )}
          </button>
        )}

        {revealed && !editing && bridge && (
          <div className="grid grid-cols-4 gap-1.5 border-t border-[var(--fl-border)] p-2">
            {GRADES.map((entry) => (
              <button
                key={entry.grade}
                type="button"
                onClick={() => {
                  bridge.grade(face, entry.grade);
                  setRevealed(false);
                  setGraded(null);
                }}
                className="rounded-lg border border-[var(--fl-border)] px-1 py-1 text-[12.5px] font-medium text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
              >
                {entry.label}
                {previews[entry.grade] && (
                  <span className="block text-[10.5px] font-normal text-[var(--fl-muted)]">
                    {previews[entry.grade]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function CardsIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2.5" y="4.5" width="9" height="9" rx="1.5" />
      <path d="M5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v7" />
    </svg>
  );
}

const CARD_TYPE = "flashcard";

/**
 * Splits a top-level paragraph into cards and the text around them.
 *
 * With line breaks on, lines written one under another are one paragraph with
 * `<br>`s between them, so a list of cards arrives as a single `<p>`. Each line
 * is looked at on its own; the ones that are cards become cards, and the rest
 * are put back together as paragraphs. `data-joined-*` records that a card
 * sat on the line directly next to its neighbour, so writing the note back
 * keeps it there instead of adding a blank line.
 */
function splitParagraph(paragraph: HTMLElement): void {
  const doc = paragraph.ownerDocument;
  const lines: ChildNode[][] = [[]];
  for (const child of Array.from(paragraph.childNodes)) {
    if (child.nodeName === "BR") lines.push([]);
    else lines[lines.length - 1]!.push(child);
  }

  const parsed = lines.map((nodes) => {
    const plain = nodes.every((child) => child.nodeType === 3);
    const text = nodes
      .map((child) => child.textContent ?? "")
      .join("")
      .replace(/^\n+|\n+$/g, "");
    return { nodes, card: plain && !text.includes("\n") ? parseCardLine(text) : null };
  });
  if (!parsed.some((line) => line.card)) return;

  const replacements: HTMLElement[] = [];
  let run: ChildNode[][] = [];
  const flush = () => {
    if (run.length === 0) return;
    const p = doc.createElement("p");
    run.forEach((nodes, index) => {
      if (index > 0) p.appendChild(doc.createElement("br"));
      for (const child of nodes) p.appendChild(child);
    });
    replacements.push(p);
    run = [];
  };

  parsed.forEach((line, index) => {
    if (!line.card) {
      run.push(line.nodes);
      return;
    }
    flush();
    const card = doc.createElement("div");
    card.setAttribute("data-type", CARD_TYPE);
    card.setAttribute("data-question", line.card.question);
    card.setAttribute("data-answer", line.card.answer);
    if (line.card.reversed) card.setAttribute("data-reversed", "true");
    if (index > 0) card.setAttribute("data-joined-above", "true");
    if (index < parsed.length - 1) card.setAttribute("data-joined-below", "true");
    replacements.push(card);
  });
  flush();

  paragraph.replaceWith(...replacements);
}

/**
 * Enter at the end of a `Question :: Answer` line makes it a card, there and then.
 *
 * Reading cards only when a note was loaded meant the line you had just typed
 * stayed text until you closed the note and came back — nothing said it had
 * worked. The line is only taken when the caret is at its end, it is plain
 * text, and it reads as a card; otherwise Enter does what it always does.
 */
function lineToCard(editor: Editor, type: NodeType): boolean {
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty || !editor.isEditable) return false;

  const $caret = selection.$from;
  const paragraph = $caret.parent;
  if (paragraph.type.name !== "paragraph" || $caret.depth !== 1) return false;

  const children: { node: ProseMirrorNode; offset: number }[] = [];
  paragraph.forEach((node, offset) => children.push({ node, offset }));
  const caret = $caret.parentOffset;

  let start = 0;
  children.forEach((child, index) => {
    if (child.node.type.name === "hardBreak" && child.offset < caret) start = index + 1;
  });
  let end = children.length;
  for (let index = start; index < children.length; index += 1) {
    if (children[index]!.node.type.name === "hardBreak") {
      end = index;
      break;
    }
  }
  const lineEnd = end < children.length ? children[end]!.offset : paragraph.content.size;
  if (caret !== lineEnd) return false;

  const line = children.slice(start, end);
  if (line.length === 0 || !line.every((child) => child.node.isText && !child.node.marks.length)) {
    return false;
  }
  const card = parseCardLine(line.map((child) => child.node.text ?? "").join(""));
  if (!card) return false;

  const head = children.slice(0, Math.max(0, start - 1)).map((child) => child.node);
  const tail = children.slice(end + 1).map((child) => child.node);
  const index = $caret.index(0);
  const previous = index > 0 ? state.doc.child(index - 1) : null;

  const nodes: ProseMirrorNode[] = [];
  if (head.length > 0) nodes.push(paragraph.type.create(paragraph.attrs, head));
  nodes.push(
    type.create({
      ...card,
      joinedAbove: head.length > 0 || previous?.type === type,
      joinedBelow: tail.length > 0,
    }),
  );
  const below = paragraph.type.create(paragraph.attrs, tail);
  nodes.push(below);

  const from = $caret.before();
  const tr = state.tr.replaceWith(from, $caret.after(), nodes);
  const belowStart = from + nodes.slice(0, -1).reduce((size, node) => size + node.nodeSize, 0) + 1;
  tr.setSelection(TextSelection.create(tr.doc, belowStart)).scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

export const FlashcardBlock = Node.create<FlashcardBlockOptions>({
  name: CARD_TYPE,
  // Before Enter-makes-a-line-break, so a finished card line is taken first.
  priority: 110,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { bridge: () => undefined };
  },

  addAttributes() {
    return {
      question: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-question") ?? "",
        renderHTML: (attributes) => ({ "data-question": attributes.question as string }),
      },
      answer: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-answer") ?? "",
        renderHTML: (attributes) => ({ "data-answer": attributes.answer as string }),
      },
      reversed: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-reversed") === "true",
        renderHTML: (attributes) => (attributes.reversed ? { "data-reversed": "true" } : {}),
      },
      joinedAbove: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-joined-above") === "true",
        renderHTML: () => ({}),
      },
      joinedBelow: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-joined-below") === "true",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${CARD_TYPE}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": CARD_TYPE })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlashcardNodeView);
  },

  addKeyboardShortcuts() {
    return { Enter: () => lineToCard(this.editor, this.type) };
  },

  addCommands() {
    return {
      insertFlashcard:
        (card = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              question: card.question ?? "",
              answer: card.answer ?? "",
              reversed: card.reversed ?? false,
            },
          }),
    };
  },

  /**
   * Markdown bridge.
   *
   * Out: `Question :: Answer` (or `:::`), escaped like any other paragraph. A
   * card that was on the line next to a paragraph or another card stays on
   * that line, so opening a note and changing nothing changes nothing on disk.
   * In: every line of plain text in a top-level paragraph that reads as a card.
   */
  addStorage() {
    return {
      markdown: {
        serialize(
          state: SerializerState,
          node: CardNode,
          parent: { childCount: number; child: (index: number) => CardNode },
          index: number,
        ) {
          const question = (node.attrs.question ?? "").replace(/\s*\n\s*/g, " ").trim();
          const answer = (node.attrs.answer ?? "").replace(/\s*\n\s*/g, " ").trim();
          const previous = index > 0 ? parent.child(index - 1) : null;
          const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
          const joins = (other: CardNode | null) =>
            other !== null && (other.type.name === "paragraph" || other.type.name === CARD_TYPE);

          if (node.attrs.joinedAbove && joins(previous) && state.closed) {
            state.closed = null;
            state.ensureNewLine();
          }
          if (!question && !answer) {
            state.closeBlock(node);
            return;
          }
          const separator = node.attrs.reversed ? " ::: " : " :: ";
          state.write(`${state.esc(question, true)}${separator}${state.esc(answer)}`);

          const nextJoinsBack =
            next !== null && next.type.name === CARD_TYPE && Boolean(next.attrs.joinedAbove);
          if ((node.attrs.joinedBelow && joins(next)) || nextJoinsBack) state.ensureNewLine();
          else state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const paragraph of Array.from(element.children)) {
              if (paragraph.tagName === "P") splitParagraph(paragraph as HTMLElement);
            }
          },
        },
      },
    };
  },
});

interface CardNode {
  type: { name: string };
  attrs: {
    question?: string;
    answer?: string;
    reversed?: boolean;
    joinedAbove?: boolean;
    joinedBelow?: boolean;
  };
}

/** The subset of prosemirror-markdown's serializer state that we use. */
interface SerializerState {
  closed: unknown;
  write(text: string): void;
  esc(text: string, startOfLine?: boolean): string;
  ensureNewLine(): void;
  closeBlock(node: unknown): void;
}
