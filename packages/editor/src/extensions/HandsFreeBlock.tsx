"use client";

import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { commandOf, judgeAnswer, speakable, type Verdict } from "../hands-free";
import type { FlashcardBridge, FlashcardFace, FlashcardGrade } from "./FlashcardBlock";

/**
 * Hands-free review: the note's cards read aloud and answered by voice.
 *
 * For studying while walking, cooking or driving: press Start once, then
 * nothing needs looking at. Each question is spoken, the answer is listened
 * for and judged, the right answer is said when it was missed, and the card is
 * graded on its schedule. "Repeat", "skip", "I don't know" and "stop" work at
 * any question. Cards due today and new ones go first.
 *
 * Stored as an empty ```hands-free fence. Nothing that is said is kept.
 */

/** Speaking and listening, as the block needs them. */
export interface SpeechKit {
  speak: (text: string) => Promise<void>;
  /** What was said next, or "" when nothing was. */
  listen: () => Promise<string>;
  cancel: () => void;
}

export interface HandsFreeBlockOptions {
  /** Speech for the block; the browser's own when not given. */
  speech: () => SpeechKit | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    handsFreeBlock: {
      insertHandsFree: () => ReturnType;
    };
  }
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/** The browser's speech synthesis and recognition, or null when it has not got both. */
export function browserSpeech(): SpeechKit | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const Recognition = ((window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
    (new () => RecognitionLike) | undefined;
  if (typeof Recognition !== "function") return null;

  let current: RecognitionLike | null = null;
  const lang = navigator.language || "en-US";
  return {
    speak: (text) =>
      new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      }),
    listen: () =>
      new Promise((resolve, reject) => {
        const recognition = new Recognition();
        current = recognition;
        recognition.lang = lang;
        recognition.interimResults = false;
        recognition.continuous = false;
        let heard = "";
        recognition.onresult = (event) => {
          heard = Array.from(event.results)
            .map((result) => result[0]?.transcript ?? "")
            .join(" ")
            .trim();
        };
        recognition.onerror = (event) => {
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            reject(new Error("The microphone is not allowed for this site."));
          }
        };
        recognition.onend = () => {
          current = null;
          resolve(heard);
        };
        recognition.start();
      }),
    cancel: () => {
      window.speechSynthesis.cancel();
      current?.stop();
    },
  };
}

type Phase =
  | { kind: "idle" }
  | { kind: "running"; at: number; step: "asking" | "listening" | "answering"; heard: string }
  | { kind: "done"; right: number; asked: number };

const GRADE: Record<Verdict, FlashcardGrade> = { right: "good", close: "hard", wrong: "again" };
const MAX_SILENCES = 2;

function cardsOf(editor: Editor, bridge: FlashcardBridge | undefined): FlashcardFace[] {
  const faces: FlashcardFace[] = [];
  editor.state.doc.forEach((child) => {
    if (child.type.name !== "flashcard") return;
    const face = {
      question: String(child.attrs.question ?? ""),
      answer: String(child.attrs.answer ?? ""),
      reversed: Boolean(child.attrs.reversed),
    };
    if (face.question.trim() && face.answer.trim()) faces.push(face);
  });
  const waiting = (face: FlashcardFace) => {
    const status = bridge?.status(face) ?? "";
    return status === "Due today" || status === "New card" ? 0 : 1;
  };
  return faces
    .map((face, index) => ({ face, index }))
    .sort((a, b) => waiting(a.face) - waiting(b.face) || a.index - b.index)
    .map((entry) => entry.face);
}

function HandsFreeNodeView({ editor, extension, selected }: NodeViewProps) {
  const options = extension.options as HandsFreeBlockOptions;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [cards, setCards] = useState<FlashcardFace[]>([]);
  const cancelled = useRef(false);
  const kit = useRef<SpeechKit | null>(null);

  const flashcards = editor.extensionManager.extensions.find((each) => each.name === "flashcard")
    ?.options as { bridge?: () => FlashcardBridge | undefined } | undefined;
  const bridge = flashcards?.bridge?.();
  const available = options.speech();
  const count = cardsOf(editor, bridge).length;

  useEffect(
    () => () => {
      cancelled.current = true;
      kit.current?.cancel();
    },
    [],
  );

  const stop = () => {
    cancelled.current = true;
    kit.current?.cancel();
  };

  const start = async () => {
    const speech = options.speech();
    if (!speech) return;
    const deck = cardsOf(editor, bridge);
    if (deck.length === 0) return;
    kit.current = speech;
    cancelled.current = false;
    setProblem(null);
    setCards(deck);
    let right = 0;
    let asked = 0;
    let silences = 0;

    try {
      for (let at = 0; at < deck.length && !cancelled.current; at += 1) {
        const card = deck[at]!;
        let heard = "";
        let answered = false;
        let skipped = false;

        while (!answered && !cancelled.current) {
          setPhase({ kind: "running", at, step: "asking", heard: "" });
          await speech.speak(speakable(card.question));
          if (cancelled.current) break;
          setPhase({ kind: "running", at, step: "listening", heard: "" });
          heard = await speech.listen();
          if (cancelled.current) break;

          if (!heard.trim()) {
            silences += 1;
            if (silences > MAX_SILENCES) {
              await speech.speak("I haven't heard anything, so I'll stop here.");
              cancelled.current = true;
              break;
            }
            await speech.speak("I didn't catch that.");
            continue;
          }
          silences = 0;
          const command = commandOf(heard);
          if (command === "repeat") continue;
          if (command === "stop") {
            cancelled.current = true;
            break;
          }
          if (command === "skip") {
            skipped = true;
            answered = true;
            break;
          }
          answered = true;
          if (command === "dont-know") heard = "";
        }
        if (cancelled.current || skipped) continue;

        const verdict = heard ? judgeAnswer(card.answer, heard) : "wrong";
        asked += 1;
        if (verdict === "right") right += 1;
        setPhase({ kind: "running", at, step: "answering", heard });
        const answer = speakable(card.answer);
        await speech.speak(
          verdict === "right"
            ? "Right."
            : verdict === "close"
              ? `Nearly. The answer is ${answer}.`
              : `The answer is ${answer}.`,
        );
        bridge?.grade(card, GRADE[verdict]);
      }
      setPhase({ kind: "done", right, asked });
      if (asked > 0) await speech.speak(`Done. ${right} of ${asked} right.`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Listening stopped.");
      setPhase({ kind: "done", right, asked });
    }
  };

  const card = phase.kind === "running" ? cards[phase.at] : undefined;
  const button =
    "rounded-lg border border-[var(--fl-border)] px-3 py-1 text-[13px] font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50";

  return (
    <NodeViewWrapper
      className="fl-hands-free-node my-4"
      data-type="hands-free"
      contentEditable={false}
    >
      <div
        className={`rounded-xl border bg-[var(--fl-surface)] ${
          selected ? "border-[var(--fl-accent)]" : "border-[var(--fl-border)]"
        }`}
      >
        <div
          className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--fl-muted)]"
          data-drag-handle
        >
          <span>Hands-free review</span>
          <span className="normal-case tracking-normal">
            · {count} {count === 1 ? "card" : "cards"} in this note
          </span>
        </div>

        <div className="grid gap-2 p-3 text-[14px]">
          {!available ? (
            <p className="text-[var(--fl-muted)]">
              This browser cannot both speak and listen. Try Chrome, Edge or Safari.
            </p>
          ) : phase.kind === "running" && card ? (
            <>
              <p className="text-[12px] text-[var(--fl-muted)]" role="status">
                Card {phase.at + 1} of {cards.length} ·{" "}
                {phase.step === "asking"
                  ? "Reading the question…"
                  : phase.step === "listening"
                    ? "Listening…"
                    : `Heard “${phase.heard || "I don't know"}”`}
              </p>
              <p className="text-[16px] font-medium text-[var(--fl-text)]">{card.question}</p>
              {phase.step === "answering" && (
                <p className="text-[var(--fl-text)]" data-testid="hands-free-answer">
                  {card.answer}
                </p>
              )}
              <p className="text-[12px] text-[var(--fl-muted)]">
                Say the answer, or “repeat”, “skip”, “I don&rsquo;t know” or “stop”.
              </p>
              <button type="button" onClick={stop} className={`${button} justify-self-start`}>
                Stop
              </button>
            </>
          ) : (
            <>
              {phase.kind === "done" && (
                <p className="font-medium text-[var(--fl-text)]" role="status">
                  Done: {phase.right} of {phase.asked} right.
                </p>
              )}
              <p className="leading-relaxed text-[var(--fl-muted)]">
                Every card in this note is read aloud; answer out loud and each is graded on its
                schedule. Your browser may send what you say to its speech service to be
                transcribed.
              </p>
              <button
                type="button"
                disabled={count === 0}
                onClick={() => void start()}
                className={`${button} justify-self-start`}
              >
                {phase.kind === "done" ? "Start again" : "Start"}
              </button>
              {count === 0 && (
                <p className="text-[12.5px] text-[var(--fl-muted)]">
                  Add <code>Question :: Answer</code> cards to this note first.
                </p>
              )}
            </>
          )}
          {problem && (
            <p role="alert" className="text-[12.5px] text-[var(--fl-danger)]">
              {problem}
            </p>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const HandsFreeBlock = Node.create<HandsFreeBlockOptions>({
  name: "handsFreeBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { speech: browserSpeech };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="hands-free"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "hands-free" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HandsFreeNodeView);
  },

  addCommands() {
    return {
      insertHandsFree:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: unknown) {
          state.write("```hands-free\n```");
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const code of Array.from(
              element.querySelectorAll<HTMLElement>("pre > code.language-hands-free"),
            )) {
              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "hands-free");
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
  closeBlock(node: unknown): void;
}
