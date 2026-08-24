"use client";

import { useCallback, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { DiagramStudio } from "../mermaid/DiagramStudio";
import { useDiagramSvg } from "../mermaid/useDiagramSvg";
import { useDiagramPopoutHost, DIAGRAM_POPOUT_PATH } from "../mermaid/popout";
import { Modal } from "../ui/Modal";

/**
 * A Mermaid diagram as a first-class block in the WYSIWYG editor.
 *
 * Stored as a normal ```mermaid fenced code block in the markdown, so a note
 * written here renders correctly on GitHub, in any other markdown editor, and
 * in the exported HTML — the diagram is never locked into this app.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaidBlock: {
      insertMermaidBlock: (code?: string) => ReturnType;
    };
  }
}

/** A short human label for the window list, so two open diagrams are tellable apart. */
function labelFor(code: string): string {
  const first = code
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!first) return "Diagram";
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

function MermaidNodeView({
  node,
  updateAttributes,
  editor,
  selected,
  deleteNode,
  extension,
}: NodeViewProps) {
  const code = (node.attrs.code as string) ?? "";

  // Open straight into the studio for a brand-new, empty diagram.
  const [editing, setEditing] = useState(code.trim() === "");

  const { svg, error } = useDiagramSvg(code);

  const applyCode = useCallback(
    (next: string) => updateAttributes({ code: next }),
    [updateAttributes],
  );

  /**
   * The same diagram, editable in a window of its own.
   *
   * Offered, never imposed: the modal remains what clicking a diagram does,
   * and this is a second door for the diagrams that have outgrown it. The note
   * stays the writer either way — the window posts edits back here, and they
   * land through `updateAttributes` exactly as the inline studio's do, so
   * autosave, undo and the dirty indicator are unaware anything unusual is
   * happening.
   */
  const popout = useDiagramPopoutHost({
    code,
    title: labelFor(code),
    onChange: applyCode,
    path: (extension.options as { popoutPath?: string }).popoutPath ?? DIAGRAM_POPOUT_PATH,
  });

  /**
   * Closing without drawing anything means no diagram.
   *
   * Leaving the empty block behind was the other half of the loop: the note
   * kept an "Empty diagram — click to edit" placeholder nobody asked for, and
   * the next rebuild reopened the picker over it. Cancel now means what cancel
   * means everywhere else — as if the block had never been inserted.
   */
  const close = useCallback(() => {
    setEditing(false);

    if (code.trim() === "") {
      deleteNode();
      editor.commands.focus();
      return;
    }

    editor.commands.focus();
  }, [editor, code, deleteNode]);

  /**
   * Handing the diagram to the window closes the dialog behind it.
   *
   * Two live editors on one diagram is the one arrangement that could lose
   * work — and even without that, a modal left open over the note is a modal
   * you have to dismiss before you can read the paragraph you popped the
   * diagram out to sit beside.
   */
  const popOut = useCallback(() => {
    popout.open();
    setEditing(false);
  }, [popout]);

  return (
    <NodeViewWrapper className="my-6" data-drag-handle>
      <figure
        className={`group relative cursor-pointer overflow-hidden rounded-xl border transition ${
          popout.active
            ? "border-[var(--fl-accent)] ring-1 ring-[var(--fl-accent)]/40"
            : selected
              ? "border-[var(--fl-accent)]"
              : "border-[var(--fl-border)] hover:border-[var(--fl-border-strong)]"
        }`}
        // While a window has the diagram, clicking brings that window forward
        // rather than opening a second editor behind it.
        onClick={() => (popout.active ? popout.focus() : setEditing(true))}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          if (popout.active) popout.focus();
          else setEditing(true);
        }}
        tabIndex={0}
        role="button"
        aria-label={popout.active ? "Diagram open in another tab" : "Edit diagram"}
      >
        <div className="flex min-h-[140px] items-center justify-center bg-[var(--fl-surface)] p-6">
          {svg ? (
            <div
              className="max-w-full [&_svg]:h-auto [&_svg]:max-w-full"
              // Sanitised by the diagram renderer.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : error ? (
            <div className="text-center">
              <p className="text-sm text-[var(--fl-danger)]">{error.message}</p>
              <p className="mt-1 text-xs text-[var(--fl-muted)]">Click to fix it</p>
            </div>
          ) : (
            <p className="text-sm italic text-[var(--fl-muted)]">Empty diagram — click to edit</p>
          )}
        </div>

        {popout.active ? (
          // Not a hover affordance: while another window owns the diagram,
          // saying so is the most useful thing this block can do, and the way
          // back has to be visible without hunting for it.
          <figcaption className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-[var(--fl-accent)] bg-[var(--fl-bg)] px-2 py-1 text-xs font-medium text-[var(--fl-text)] shadow-sm">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]" />
            Editing in another tab
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                popout.bringBack();
                setEditing(true);
              }}
              className="rounded px-1 py-0.5 text-[var(--fl-muted)] underline-offset-2 transition-colors hover:text-[var(--fl-text)] hover:underline"
            >
              Edit here
            </button>
          </figcaption>
        ) : (
          <figcaption className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-[var(--fl-border)] bg-[var(--fl-bg)] p-1 text-xs font-medium text-[var(--fl-text)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100">
            <span className="px-1.5 py-0.5 text-[var(--fl-muted)]">Click to edit</span>
            {popout.supported && (
              <button
                type="button"
                onClick={(event) => {
                  // The figure itself opens the modal; this is the other choice.
                  event.stopPropagation();
                  popOut();
                }}
                title="Open this diagram in its own tab"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--fl-elevated)]"
              >
                <PopoutIcon />
                Open in tab
              </button>
            )}
          </figcaption>
        )}
      </figure>

      {/* The studio is a mode, not part of the document flow — opening it inline
          used to push the surrounding paragraphs hundreds of pixels down the
          page and hand the reader a full-height gallery with no obvious exit. */}
      {editing && !popout.active && (
        <Modal
          title="Diagram"
          subtitle="Saved into the note as a ```mermaid block, so it also renders on GitHub"
          onClose={close}
          // Windowed rather than the whole viewport — taking over the screen to
          // edit one diagram loses the note you are writing it for — but wide,
          // because a canvas and a preview side by side need the room.
          widthClassName="max-w-[92rem]"
          actions={
            <>
              {popout.supported && (
                <button
                  type="button"
                  onClick={popOut}
                  title="Move this diagram into its own tab. Edits keep saving into the note."
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--fl-border)] px-3 py-1.5 text-[13px] font-medium text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)]"
                >
                  <PopoutIcon />
                  Open in tab
                </button>
              )}

              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-lg bg-[var(--fl-accent)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
              >
                Done
              </button>
            </>
          }
        >
          <DiagramStudio code={code} onChange={applyCode} />
        </Modal>
      )}
    </NodeViewWrapper>
  );
}

/** Arrow leaving a box: the same glyph every app uses for "opens elsewhere". */
function PopoutIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3h4v4" />
      <path d="M13 3 8 8" />
      <path d="M12.5 9.5V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V5A1.5 1.5 0 0 1 4 3.5h2.5" />
    </svg>
  );
}

export interface MermaidBlockOptions {
  /**
   * Route the "Open in tab" window loads.
   *
   * An option rather than a constant so the editor package stays independent
   * of how the app around it is mounted.
   */
  popoutPath: string;
}

export const MermaidBlock = Node.create<MermaidBlockOptions>({
  name: "mermaidBlock",
  group: "block",
  // Atomic: the diagram is edited through its own UI, not by ProseMirror.
  atom: true,
  draggable: true,

  addOptions() {
    return { popoutPath: DIAGRAM_POPOUT_PATH };
  },

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-code") ?? "",
        renderHTML: (attributes) => ({ "data-code": attributes.code as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "mermaid" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },

  addCommands() {
    return {
      insertMermaidBlock:
        (code = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { code } }),
    };
  },

  /**
   * Markdown bridge — the reason a diagram written here still renders on
   * github.com, in Obsidian, or in any other markdown tool.
   *
   * On the way out the node becomes a ```mermaid fence. On the way in, every
   * such fence becomes a diagram node again. Without the parse half, reopening
   * a note would downgrade its diagrams to plain code blocks.
   */
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerLike, node: { attrs: { code?: string } }) {
          state.write("```mermaid\n");
          // `text(…, false)` writes the body verbatim across newlines; `write`
          // would re-apply the block prefix and mangle multi-line source.
          state.text(node.attrs.code ?? "", false);
          state.ensureNewLine();
          state.write("```");
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            const fences = element.querySelectorAll<HTMLElement>("pre > code.language-mermaid");

            for (const code of Array.from(fences)) {
              const pre = code.parentElement;
              if (!pre) continue;

              const replacement = element.ownerDocument.createElement("div");
              replacement.setAttribute("data-type", "mermaid");
              // textContent is already decoded, and setAttribute escapes it
              // again on the way in — no manual entity handling needed.
              replacement.setAttribute("data-code", (code.textContent ?? "").replace(/\n$/, ""));
              pre.replaceWith(replacement);
            }
          },
        },
      },
    };
  },
});

/** The subset of prosemirror-markdown's serializer state that we use. */
interface MarkdownSerializerLike {
  write(text: string): void;
  text(text: string, escape?: boolean): void;
  ensureNewLine(): void;
  closeBlock(node: unknown): void;
}
