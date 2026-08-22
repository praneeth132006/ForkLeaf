"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
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
import { CodeBlock } from "./extensions/CodeBlock";
import { ResolvedImage } from "./extensions/ResolvedImage";
import { imagesFrom, type ImageBridge } from "./images";
import { MermaidBlock } from "./extensions/MermaidBlock";
import { readSlashState } from "./extensions/SlashCommands";
import { filterInsertActions, type ActionContext, type InsertDefinition } from "./insert-actions";

export interface WysiwygEditorProps {
  /** Markdown body, excluding frontmatter. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Hands the Tiptap instance up so a shared toolbar can drive it. */
  onReady?: (editor: Editor | null) => void;
  /** Where pasted and dropped images go, and how stored ones are displayed. */
  images?: ImageBridge;
  /** Called while an image is being stored, so the app can say something. */
  onImageStatus?: (status: { busy: boolean; error: string | null }) => void;
  /**
   * What the app can do for the `/` menu that a markdown command cannot.
   *
   * `/image` has to open the same picker the toolbar's Image button does, or
   * the two routes to the same feature behave differently.
   */
  slashActions?: ActionContext;
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
  onReady,
  images,
  onImageStatus,
  slashActions,
}: WysiwygEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Read through refs rather than captured in the extension list: the editor
  // is built once, and an image bridge that arrives a render later (the
  // workspace resolves asynchronously) has to reach the already-built editor.
  const imagesRef = useRef<ImageBridge | undefined>(images);
  imagesRef.current = images;
  const onImageStatusRef = useRef(onImageStatus);
  onImageStatusRef.current = onImageStatus;

  // Guards the value-sync effect: without it, our own serialised output feeds
  // straight back in and resets the cursor to the top on every keystroke.
  const applyingExternal = useRef(false);

  /**
   * Every markdown string this editor has handed upwards.
   *
   * The parent stores the value and passes it back, so a render or two later
   * our own edit arrives as a `value` prop. If more was typed in the meantime
   * that prop is already stale, and applying it silently threw the newer
   * keystrokes away — which is what made blocks disappear and characters land
   * in the paragraph above the one being typed in.
   *
   * Recognising the echo is the whole fix: anything in here came from us and
   * must never be written back over a document that has since moved on.
   */
  const emitted = useRef<string[]>([]);

  const remember = useCallback((markdown: string) => {
    emitted.current.push(markdown);
    // Only the recent past matters; an unbounded list would grow for as long
    // as the note stays open.
    if (emitted.current.length > 60) emitted.current.shift();
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        // Replaced below by the highlighting one, which also carries the
        // language picker. Two extensions cannot both own the `codeBlock` node.
        codeBlock: false,
        link: false,
      }),
      Placeholder.configure({ placeholder }),
      Highlight,
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      // `allowBase64` is on because a workspace with no repository behind it
      // has nowhere to commit a file to, and inlining the image is the only
      // way "paste a screenshot" can work there at all.
      ResolvedImage.configure({
        inline: false,
        allowBase64: true,
        resolveSrc: (src: string) => imagesRef.current?.resolve?.(src) ?? src,
        HTMLAttributes: { loading: "lazy" },
      }),
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
      CodeBlock,
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

  /**
   * Stores dropped or pasted images and puts them in the document.
   *
   * Uploading takes a round trip to GitHub, so the images are inserted when
   * they land rather than optimistically: a placeholder that later fails would
   * leave a broken node in a file that autosaves. The status callback is what
   * tells the reader something is happening in the meantime.
   */
  const insertImages = useCallback(async (view: EditorView, files: File[], at?: number) => {
    const bridge = imagesRef.current;
    if (!bridge?.upload || files.length === 0) return;

    onImageStatusRef.current?.({ busy: true, error: null });

    let position = at;
    try {
      for (const file of files) {
        const src = await bridge.upload(file);
        if (!src) continue;

        const node = view.state.schema.nodes.image?.create({ src, alt: file.name });
        if (!node) continue;

        const tr = view.state.tr;
        // A drop knows where it landed; a paste goes wherever the caret is.
        const target = position ?? tr.selection.to;
        tr.insert(target, node);
        view.dispatch(tr);
        // Anything after the first lands below the one before it.
        position = target + node.nodeSize;
      }
      onImageStatusRef.current?.({ busy: false, error: null });
    } catch (error) {
      onImageStatusRef.current?.({
        busy: false,
        error: error instanceof Error ? error.message : "That image could not be added.",
      });
    }
  }, []);

  const editor = useEditor({
    extensions,
    content: value,
    autofocus: autoFocus,
    // Required in Next.js: rendering the editor during SSR causes a hydration
    // mismatch because ProseMirror generates DOM the server cannot produce.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "fl-prose focus:outline-none min-h-[50vh]",
        "aria-label": "Note content",
      },
      handlePaste: (view, event) => {
        const files = imagesFrom(event.clipboardData);
        if (files.length === 0 || !imagesRef.current?.upload) return false;

        // Claim the event: letting ProseMirror also handle it pastes the
        // clipboard's HTML fallback, which for a screenshot is an <img> with a
        // blob: URL that stops working the moment the page reloads.
        event.preventDefault();
        void insertImages(view, files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        // A node being dragged within the document is not an upload.
        if (moved) return false;

        const files = imagesFrom((event as DragEvent).dataTransfer);
        if (files.length === 0 || !imagesRef.current?.upload) return false;

        event.preventDefault();
        const at = view.posAtCoords({
          left: (event as DragEvent).clientX,
          top: (event as DragEvent).clientY,
        })?.pos;
        void insertImages(view, files, at);
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (applyingExternal.current) return;

      const markdown = markdownOf(instance);
      remember(markdown);
      onChangeRef.current(markdown);
    },
  });

  // Hand the instance to the parent once it exists, and take it back on
  // unmount so a toolbar never holds a destroyed editor.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    onReadyRef.current?.(editor ?? null);
    return () => onReadyRef.current?.(null);
  }, [editor]);

  // Pull external changes in (switching notes, resolving a conflict) without
  // disturbing the caret during normal typing.
  useEffect(() => {
    if (!editor) return;

    const current = markdownOf(editor);
    if (current === value) return;

    // A value we produced ourselves, arriving late. The document is already
    // at least as new as this, so rebuilding it from the prop would undo work.
    if (emitted.current.includes(value)) return;

    applyingExternal.current = true;
    editor.commands.setContent(value, { emitUpdate: false });
    applyingExternal.current = false;
    // The history above describes a document that no longer exists.
    emitted.current = [];
  }, [value, editor]);

  if (!editor) {
    return <div className={className} aria-busy="true" />;
  }

  return (
    <div className={className}>
      <SlashMenu editor={editor} actions={slashActions ?? {}} />

      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        // Only for real text selections. Without this the formatting toolbar
        // also pops up over a selected diagram or image, where none of the
        // buttons do anything.
        shouldShow={({ editor: instance, from, to }) =>
          from !== to && !instance.state.selection.empty && !instance.isActive("mermaidBlock")
        }
        className="flex items-center gap-0.5 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-inverse-bg)] p-1 shadow-lg"
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
          ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
          : "text-[var(--fl-elevated)] hover:bg-white/10"
      } ${className ?? ""}`}
    >
      {glyph}
    </button>
  );
}

// ─── Slash menu ─────────────────────────────────────────────────────────────

function SlashMenu({ editor, actions }: { editor: Editor; actions: ActionContext }) {
  const [state, setState] = useState({ active: false, query: "", from: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const commands = useMemo(() => filterInsertActions(state.query, "rich"), [state.query]);

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
    (command: InsertDefinition) => {
      // Remove the "/query" text before running, so the command applies to a
      // clean block.
      editor
        .chain()
        .focus()
        .deleteRange({ from: state.from, to: state.from + state.query.length + 1 })
        .run();

      // Images and links defer to the app, which is the only thing that knows
      // where a file would be stored.
      if (command.id === "image" && actions.requestImage) actions.requestImage();
      else if (command.id === "link" && actions.requestLink) actions.requestLink();
      else command.rich(editor);

      setState({ active: false, query: "", from: 0 });
    },
    [editor, state, actions],
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
      className="absolute z-50 max-h-80 w-72 overflow-y-auto rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
      style={{ top: position.top, left: position.left }}
    >
      {commands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          // Prevent the editor losing focus before the click registers.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(command)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
            index === selectedIndex ? "bg-[var(--fl-elevated)]" : ""
          }`}
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--fl-border)] bg-[var(--fl-bg)] text-[var(--fl-muted)]"
          >
            {command.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-[var(--fl-text)]">
              {command.label}
            </span>
            <span className="block truncate text-[11.5px] text-[var(--fl-muted)]">
              {command.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
