"use client";

import { useCallback, useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

/**
 * Spaced reading, in the note: today's passages to reread, where the block was put.
 *
 * Highlights from PDFs and quotes saved from the web come back a few a day,
 * on the same schedule as flashcards. The block lists them; each is reread and
 * sent back soon, later, or never. Put it in today's note, or anywhere.
 *
 * Stored as an empty ```reading fence, so the note holds no copy of the
 * passages — they are always read fresh from where they were highlighted.
 */

export interface ReadingPassage {
  /** The id the passage has on the schedule. */
  id: string;
  text: string;
  /** The document or page it came from. */
  source: string;
  /** The note holding it, to open. */
  path: string;
  /** "p. 4", a site's name, or null. */
  where: string | null;
  isNew: boolean;
}

export type ReadingChoice = "soon" | "later" | "done";

export interface ReadingBridge {
  load: () => Promise<readonly ReadingPassage[]>;
  /** Schedules the passage and says when it comes back. */
  choose: (passage: ReadingPassage, choice: ReadingChoice) => Promise<string>;
  open: (path: string) => void;
}

export interface ReadingBlockOptions {
  bridge: () => ReadingBridge | undefined;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    readingBlock: {
      insertReading: () => ReturnType;
    };
  }
}

const CHOICES: { choice: ReadingChoice; label: string }[] = [
  { choice: "soon", label: "Again soon" },
  { choice: "later", label: "Later" },
  { choice: "done", label: "Done with it" },
];

type Load =
  | { kind: "loading" }
  | { kind: "ready"; passages: readonly ReadingPassage[] }
  | { kind: "error"; message: string }
  | { kind: "unavailable" };

function ReadingNodeView({ extension, selected }: NodeViewProps) {
  const bridge = (extension.options as ReadingBlockOptions).bridge();
  const [load, setLoad] = useState<Load>({ kind: bridge ? "loading" : "unavailable" });
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    setLoad({ kind: "loading" });
    bridge.load().then(
      (passages) => {
        if (live) setLoad({ kind: "ready", passages });
      },
      (error: unknown) => {
        if (live) {
          setLoad({
            kind: "error",
            message: error instanceof Error ? error.message : "Your highlights could not be read.",
          });
        }
      },
    );
    return () => {
      live = false;
    };
    // The bridge is read through a ref by the editor; loading again on every
    // render of the note would fetch the whole notebook per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloads, Boolean(bridge)]);

  const pick = useCallback(
    async (passage: ReadingPassage, choice: ReadingChoice) => {
      if (!bridge) return;
      setBusy(passage.id);
      try {
        const label = await bridge.choose(passage, choice);
        setChosen((current) => ({ ...current, [passage.id]: label }));
      } catch (error) {
        setChosen((current) => ({
          ...current,
          [passage.id]: error instanceof Error ? error.message : "That could not be saved.",
        }));
      } finally {
        setBusy(null);
      }
    },
    [bridge],
  );

  const passages = load.kind === "ready" ? load.passages : [];
  const left = passages.filter((passage) => !chosen[passage.id]).length;

  return (
    <NodeViewWrapper className="fl-reading-node my-4" data-type="reading" contentEditable={false}>
      <div
        className={`rounded-xl border bg-[var(--fl-surface)] ${
          selected ? "border-[var(--fl-accent)]" : "border-[var(--fl-border)]"
        }`}
      >
        <div
          className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--fl-muted)]"
          data-drag-handle
        >
          <span>Spaced reading</span>
          {load.kind === "ready" && passages.length > 0 && (
            <span className="normal-case tracking-normal" data-testid="reading-count">
              · {left === 0 ? "all read for today" : `${left} to reread today`}
            </span>
          )}
          {bridge && (
            <button
              type="button"
              onClick={() => {
                setChosen({});
                setReloads((count) => count + 1);
              }}
              className="ml-auto rounded px-1.5 py-0.5 normal-case tracking-normal hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
            >
              Refresh
            </button>
          )}
        </div>

        <div className="p-3 text-[14px]">
          {load.kind === "unavailable" && (
            <p className="text-[var(--fl-muted)]">Spaced reading needs a notebook to read from.</p>
          )}
          {load.kind === "loading" && (
            <p role="status" className="text-[var(--fl-muted)]">
              Finding today&rsquo;s passages…
            </p>
          )}
          {load.kind === "error" && <p className="text-[var(--fl-danger)]">{load.message}</p>}
          {load.kind === "ready" && passages.length === 0 && (
            <p className="leading-relaxed text-[var(--fl-muted)]">
              Nothing to reread today. Highlight passages in a PDF, or save quotes from the web, and
              they come back here a few at a time.
            </p>
          )}
          {load.kind === "ready" && passages.length > 0 && (
            <ol className="grid gap-3">
              {passages.map((passage) => (
                <li key={passage.id} className="grid gap-1.5">
                  <blockquote
                    className={`border-l-2 border-[var(--fl-accent)] pl-3 leading-relaxed text-[var(--fl-text)] ${
                      chosen[passage.id] ? "opacity-60" : ""
                    }`}
                  >
                    {passage.text}
                  </blockquote>
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--fl-muted)]">
                    <button
                      type="button"
                      onClick={() => bridge?.open(passage.path)}
                      className="underline-offset-2 hover:text-[var(--fl-text)] hover:underline"
                    >
                      {passage.source}
                      {passage.where ? ` · ${passage.where}` : ""}
                    </button>
                    {passage.isNew && (
                      <span className="rounded bg-[var(--fl-elevated)] px-1.5 py-0.5">
                        First time
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1.5">
                      {chosen[passage.id] ? (
                        <span data-testid="reading-chosen">{chosen[passage.id]}</span>
                      ) : (
                        CHOICES.map((entry) => (
                          <button
                            key={entry.choice}
                            type="button"
                            disabled={busy === passage.id}
                            onClick={() => void pick(passage, entry.choice)}
                            className="rounded-lg border border-[var(--fl-border)] px-2 py-0.5 text-[12px] font-medium text-[var(--fl-text)] hover:bg-[var(--fl-elevated)] disabled:opacity-50"
                          >
                            {entry.label}
                          </button>
                        ))
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const ReadingBlock = Node.create<ReadingBlockOptions>({
  name: "readingBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { bridge: () => undefined };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="reading"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "reading" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReadingNodeView);
  },

  addCommands() {
    return {
      insertReading:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: unknown) {
          state.write("```reading\n```");
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const code of Array.from(
              element.querySelectorAll<HTMLElement>("pre > code.language-reading"),
            )) {
              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "reading");
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
