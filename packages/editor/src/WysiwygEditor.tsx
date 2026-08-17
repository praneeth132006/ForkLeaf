"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import type { Editor } from "@tiptap/core";

/**
 * tiptap-markdown 0.9 targets Tiptap 2 and does not augment Tiptap 3's
 * `Storage` interface, so `editor.storage.markdown` is untyped. This reads it
 * through the package's own exported shape rather than sprinkling `any` around.
 */
function markdownOf(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
}
import { MermaidBlock } from "./extensions/MermaidBlock";
import { filterSlashCommands, readSlashState, type SlashCommand } from "./extensions/SlashCommands";

export interface WysiwygEditorProps {
  /** Markdown body, excluding frontmatter. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Notion-style editing surface.
 *
 * Markdown is the source of truth in both directions: Tiptap parses it on load
 * and serialises back on every change, so the file on GitHub stays plain
 * markdown that renders anywhere. Nothing is stored in a proprietary shape.
 */
export function WysiwygEditor({
  value,
  onChange,
  placeholder = "Type / for commands…",
  autoFocus = false,
  className,
}: WysiwygEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Guards the value-sync effect: without it, our own serialised output feeds
  // straight back in and resets the cursor to the top on every keystroke.
  const applyingExternal = useRef(false);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: { HTMLAttributes: { class: "mdn-code-block" } },
        link: false,
      }),
      Placeholder.configure({ placeholder }),
      Highlight,
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // Anything outside this list is dropped, which closes the
        // javascript:-URL XSS vector on pasted links.
        protocols: ["http", "https", "mailto"],
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      MermaidBlock,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
        breaks: false,
        linkify: true,
      }),
    ],
    [placeholder],
  );

  const editor = useEditor({
    extensions,
    content: value,
    autofocus: autoFocus,
    // Required in Next.js: rendering the editor during SSR causes a hydration
    // mismatch because ProseMirror generates DOM the server cannot produce.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "mdn-prose focus:outline-none min-h-[50vh]",
        "aria-label": "Note content",
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (applyingExternal.current) return;
      onChangeRef.current(markdownOf(instance));
    },
  });

  // Pull external changes in (switching notes, resolving a conflict) without
  // disturbing the caret during normal typing.
  useEffect(() => {
    if (!editor) return;

    const current = markdownOf(editor);
    if (current === value) return;

    applyingExternal.current = true;
    editor.commands.setContent(value, { emitUpdate: false });
    applyingExternal.current = false;
  }, [value, editor]);

  if (!editor) {
    return <div className={className} aria-busy="true" />;
  }

  return (
    <div className={className}>
      <SlashMenu editor={editor} />

      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        // Only for real text selections. Without this the formatting toolbar
        // also pops up over a selected diagram or image, where none of the
        // buttons do anything.
        shouldShow={({ editor: instance, from, to }) =>
          from !== to && !instance.state.selection.empty && !instance.isActive("mermaidBlock")
        }
        className="flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-basalt)] p-1 shadow-lg"
      >
        <FormatButton editor={editor} mark="bold" label="Bold" glyph="B" className="font-bold" />
        <FormatButton editor={editor} mark="italic" label="Italic" glyph="I" className="italic" />
        <FormatButton
          editor={editor}
          mark="strike"
          label="Strikethrough"
          glyph="S"
          className="line-through"
        />
        <FormatButton
          editor={editor}
          mark="code"
          label="Inline code"
          glyph="<>"
          className="font-mono text-xs"
        />
        <FormatButton editor={editor} mark="highlight" label="Highlight" glyph="H" />
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  );
}

// ─── Bubble menu button ─────────────────────────────────────────────────────

function FormatButton({
  editor,
  mark,
  label,
  glyph,
  className,
}: {
  editor: Editor;
  mark: "bold" | "italic" | "strike" | "code" | "highlight";
  label: string;
  glyph: string;
  className?: string;
}) {
  const active = editor.isActive(mark);

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => {
        const chain = editor.chain().focus();
        switch (mark) {
          case "bold":
            chain.toggleBold().run();
            break;
          case "italic":
            chain.toggleItalic().run();
            break;
          case "strike":
            chain.toggleStrike().run();
            break;
          case "code":
            chain.toggleCode().run();
            break;
          case "highlight":
            chain.toggleHighlight().run();
            break;
        }
      }}
      className={`h-7 min-w-7 rounded px-1.5 text-sm transition ${
        active
          ? "bg-[var(--color-signal-amber)] text-[var(--color-basalt)]"
          : "text-[var(--color-chalk)] hover:bg-white/10"
      } ${className ?? ""}`}
    >
      {glyph}
    </button>
  );
}

// ─── Slash menu ─────────────────────────────────────────────────────────────

function SlashMenu({ editor }: { editor: Editor }) {
  const [state, setState] = useState({ active: false, query: "", from: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const commands = useMemo(() => filterSlashCommands(state.query), [state.query]);

  // Track the slash state on every transaction.
  useEffect(() => {
    const update = () => {
      const next = readSlashState(editor);
      setState(next);

      if (next.active) {
        try {
          const coords = editor.view.coordsAtPos(next.from);
          const parent = editor.view.dom.getBoundingClientRect();
          setPosition({ top: coords.bottom - parent.top + 6, left: coords.left - parent.left });
        } catch {
          // Position can momentarily be out of range during a large edit.
        }
      }
    };

    editor.on("transaction", update);
    editor.on("focus", update);
    return () => {
      editor.off("transaction", update);
      editor.off("focus", update);
    };
  }, [editor]);

  // Reset the highlight whenever the result set changes.
  useEffect(() => setSelectedIndex(0), [state.query]);

  const run = useCallback(
    (command: SlashCommand) => {
      // Remove the "/query" text before running, so the command applies to a
      // clean block.
      editor
        .chain()
        .focus()
        .deleteRange({ from: state.from, to: state.from + state.query.length + 1 })
        .run();

      command.run(editor);
      setState({ active: false, query: "", from: 0 });
    },
    [editor, state],
  );

  // Keyboard navigation is bound at the document level and captured, so it wins
  // over ProseMirror's own arrow-key handling while the menu is open.
  useEffect(() => {
    if (!state.active || commands.length === 0) return;

    const handler = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((index) => (index + 1) % commands.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((index) => (index - 1 + commands.length) % commands.length);
          break;
        case "Enter": {
          event.preventDefault();
          const command = commands[selectedIndex];
          if (command) run(command);
          break;
        }
        case "Escape":
          event.preventDefault();
          setState({ active: false, query: "", from: 0 });
          break;
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [state.active, commands, selectedIndex, run]);

  if (!state.active || commands.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Insert block"
      className="absolute z-50 max-h-72 w-72 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      {commands.map((command, index) => (
        <button
          key={command.title}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          // Prevent the editor losing focus before the click registers.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(command)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition ${
            index === selectedIndex ? "bg-[var(--color-chalk)]" : ""
          }`}
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-paper)] font-mono text-xs text-[var(--color-ink)]"
          >
            {command.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
              {command.title}
            </span>
            <span className="block truncate text-xs text-[var(--color-mist)]">
              {command.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
