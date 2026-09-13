"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { emptyCanvas, parseCanvas, serializeCanvas, type Canvas } from "@forkleaf/markdown-engine";
import { CanvasBoard, type CanvasNoteChoice } from "../canvas/CanvasBoard";

/**
 * A canvas drawn in the note, where it was inserted.
 *
 * A board used to be a file of its own, opened in a window over the note, and
 * nothing of it was left on the page once the window closed — you drew a
 * diagram and then could not see it where you were writing. Now it is a block:
 * cards, notes and arrows in the middle of the text, edited in place.
 *
 * Stored as a ```canvas fenced block holding JSON Canvas 1.0 — the format
 * Obsidian's `.canvas` files use — so the board is plain text in the note,
 * copied out it opens in Obsidian, and on github.com it is readable JSON.
 */

export interface CanvasBridge {
  /** Notes that can be placed on a board. */
  loadNotes?: () => Promise<readonly CanvasNoteChoice[]>;
  openNote?: (path: string) => void;
}

export interface CanvasBlockOptions {
  /** Read through a ref, so a bridge that arrives later still reaches the editor. */
  bridge: () => CanvasBridge | undefined;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    canvasBlock: {
      /** Inserts a board, empty or holding `canvas`. */
      insertCanvas: (canvas?: Canvas) => ReturnType;
    };
  }
}

const SAVE_DELAY = 400;

function CanvasNodeView({ node, updateAttributes, editor, extension, selected }: NodeViewProps) {
  const json = (node.attrs.json as string) ?? "";
  const bridge = (extension.options as CanvasBlockOptions).bridge();
  const parsed = useMemo(() => parseCanvas(json), [json]);

  const [tall, setTall] = useState(false);
  const [notes, setNotes] = useState<readonly CanvasNoteChoice[]>([]);
  /**
   * Remounts the board when the block's text changes from outside — undo, a
   * sync, an edit in the source view — and not when the change is the board's
   * own, which would throw away the selection with every card moved.
   */
  const [generation, setGeneration] = useState(0);
  const written = useRef(json);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    if (json !== written.current) {
      written.current = json;
      setGeneration((count) => count + 1);
    }
  }, [json]);

  useEffect(() => {
    let live = true;
    void bridge?.loadNotes?.().then((list) => {
      if (live) setNotes(list);
    });
    return () => {
      live = false;
    };
    // Once per board; the list of notes does not need to follow every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );

  const onChange = (canvas: Canvas) => {
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      pending.current = null;
      const text = serializeCanvas(canvas).replace(/\n$/, "");
      written.current = text;
      updateAttributes({ json: text });
    }, SAVE_DELAY);
  };

  const count = parsed.canvas.nodes.length;

  return (
    <NodeViewWrapper className="fl-canvas-node my-5" data-type="canvas" contentEditable={false}>
      <div
        className={`rounded-xl border bg-[var(--fl-surface)] p-2 transition-colors ${
          selected ? "border-[var(--fl-accent)]" : "border-[var(--fl-border)]"
        }`}
      >
        <div
          className="mb-2 flex cursor-grab items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--fl-muted)]"
          data-drag-handle
          draggable="true"
          title="Drag to move the canvas in the note"
        >
          <span aria-hidden="true">⠿</span>
          <span>Canvas</span>
          <span className="normal-case tracking-normal">
            · {count} {count === 1 ? "item" : "items"}
          </span>
        </div>
        {parsed.problem ? (
          <div role="alert" className="px-1 pb-1 text-[13px] leading-relaxed">
            <p className="text-[var(--fl-danger)]">{parsed.problem}</p>
            <p className="mt-1 text-[var(--fl-muted)]">
              Nothing has been changed. Open the Source view to see what the block holds.
            </p>
          </div>
        ) : (
          <CanvasBoard
            key={generation}
            initial={parsed.canvas}
            onChange={onChange}
            notes={notes}
            {...(bridge?.openNote ? { onOpenNote: bridge.openNote } : {})}
            wheel="page"
            readOnly={!editor.isEditable}
            viewportClassName={tall ? "h-[75vh] min-h-[420px]" : "h-[380px]"}
            status={
              <button
                type="button"
                onClick={() => setTall((value) => !value)}
                className="mr-1 rounded-lg border border-[var(--fl-border)] px-2.5 py-1 text-[12.5px] text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
              >
                {tall ? "Smaller" : "Taller"}
              </button>
            }
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** A fence longer than any run of backticks inside, so card text cannot close it. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

export const CanvasBlock = Node.create<CanvasBlockOptions>({
  name: "canvasBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { bridge: () => undefined };
  },

  addAttributes() {
    return {
      json: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-json") ?? "",
        renderHTML: (attributes) => ({ "data-json": attributes.json as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="canvas"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "canvas" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CanvasNodeView, {
      // Every press, drag and key inside the board is the board's. Only the
      // strip along the top moves the block, the way a diagram's frame does.
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.("[data-drag-handle]")) return false;
        return Boolean(target?.closest?.("[data-canvas-board]"));
      },
    });
  },

  addCommands() {
    return {
      insertCanvas:
        (canvas = emptyCanvas()) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { json: serializeCanvas(canvas).replace(/\n$/, "") },
          }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { json?: string } }) {
          const json = node.attrs.json?.trim() || serializeCanvas(emptyCanvas()).trim();
          const fence = fenceFor(json);
          state.write(`${fence}canvas\n`);
          state.text(json, false);
          state.ensureNewLine();
          state.write(fence);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            for (const code of Array.from(
              element.querySelectorAll<HTMLElement>("pre > code.language-canvas"),
            )) {
              const pre = code.parentElement;
              if (!pre) continue;
              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "canvas");
              replacement.setAttribute("data-json", (code.textContent ?? "").replace(/\n$/, ""));
              pre.replaceWith(replacement);
            }
          },
        },
      },
    };
  },
});

/** The subset of prosemirror-markdown's serializer state that we use. */
interface SerializerState {
  write(text: string): void;
  text(text: string, escape?: boolean): void;
  ensureNewLine(): void;
  closeBlock(node: unknown): void;
}
