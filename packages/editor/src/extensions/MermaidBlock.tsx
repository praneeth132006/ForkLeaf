"use client";

import { useCallback, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { DiagramStudio } from "../mermaid/DiagramStudio";
import { useDiagramSvg } from "../mermaid/useDiagramSvg";
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

function MermaidNodeView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const code = (node.attrs.code as string) ?? "";
  // Open straight into the editor for a brand-new, empty diagram.
  const [editing, setEditing] = useState(code.trim() === "");
  const { svg, error } = useDiagramSvg(code);

  const close = useCallback(() => {
    setEditing(false);
    editor.commands.focus();
  }, [editor]);

  return (
    <NodeViewWrapper className="my-6" data-drag-handle>
      <figure
        className={`group relative cursor-pointer overflow-hidden rounded-xl border transition ${
          selected
            ? "border-[var(--fl-accent)]"
            : "border-[var(--fl-border)] hover:border-[var(--fl-border-strong)]"
        }`}
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") setEditing(true);
        }}
        tabIndex={0}
        role="button"
        aria-label="Edit diagram"
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

        <figcaption className="pointer-events-none absolute right-2 top-2 rounded-md border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1 text-xs font-medium text-[var(--fl-text)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100">
          Click to edit diagram
        </figcaption>
      </figure>

      {/* The studio is a mode, not part of the document flow — opening it inline
          used to push the surrounding paragraphs hundreds of pixels down the
          page and hand the reader a full-height gallery with no obvious exit. */}
      {editing && (
        <Modal
          title="Diagram"
          subtitle="Saved into the note as a ```mermaid block, so it also renders on GitHub"
          onClose={close}
          // Windowed rather than the whole viewport — taking over the screen to
          // edit one diagram loses the note you are writing it for — but wide,
          // because a canvas and a preview side by side need the room.
          widthClassName="max-w-[92rem]"
          actions={
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded-lg bg-[var(--fl-accent)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--fl-accent-contrast)] transition-colors hover:bg-[var(--fl-accent-hover)]"
            >
              Done
            </button>
          }
        >
          <DiagramStudio code={code} onChange={(next) => updateAttributes({ code: next })} />
        </Modal>
      )}
    </NodeViewWrapper>
  );
}

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  // Atomic: the diagram is edited through its own UI, not by ProseMirror.
  atom: true,
  draggable: true,

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
