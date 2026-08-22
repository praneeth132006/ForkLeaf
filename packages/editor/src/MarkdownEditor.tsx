"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorViewMode } from "@forkleaf/types";
import { WysiwygEditor } from "./WysiwygEditor";
import { SourceEditor, type CursorPosition, type SourceEditorHandle } from "./SourceEditor";
import { Preview } from "./Preview";
import {
  EditorToolbar,
  type BlockStyle,
  type FormatMark,
  type TableCommands,
  type ToolbarSurface,
} from "./EditorToolbar";
import { insertActionsFor, runRichAction, runSourceAction } from "./insert-actions";
import { ImageDialog } from "./ui/ImageDialog";
import { LinkDialog } from "./ui/LinkDialog";
import type { ImageBridge } from "./images";

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  mode: EditorViewMode;
  onModeChange?: (mode: EditorViewMode) => void;
  /** Omit to follow the app's current theme. */
  theme?: "light" | "dark";
  placeholder?: string;
  className?: string;
  /** Hides the built-in mode switcher when the app renders its own. */
  hideModeSwitcher?: boolean;
  /** Hides the insert toolbar, for embedded or read-mostly surfaces. */
  hideToolbar?: boolean;
  /**
   * Reports the caret's line and column, for a status bar.
   *
   * Only the markdown source surface has a meaningful line and column — in
   * rich text the document is a node tree and "line 12" would be a fiction —
   * so this stays silent in wysiwyg mode rather than inventing a number.
   */
  onCursorChange?: (position: CursorPosition | null) => void;
  /** Where images pasted, dropped or picked in this note are stored. */
  images?: ImageBridge;
  /** Shown under "Add an image" — usually where the file will be committed. */
  imageDestination?: string;
}

const MODES: { value: EditorViewMode; label: string; hint: string }[] = [
  { value: "wysiwyg", label: "Rich text", hint: "Format as you type" },
  { value: "split", label: "Split", hint: "Markdown source beside a live preview" },
  { value: "source", label: "Source", hint: "Raw markdown only" },
];

/**
 * The note editor, in whichever mode the user prefers for this document.
 *
 * The three modes are views over the same markdown string, so switching never
 * transforms or reformats the file — which matters when the file is a real
 * commit in the user's own repository.
 *
 * The formatting bar sits above all three and dispatches to whichever surface
 * is live, so "make this bold" or "insert a diagram" is the same button
 * whether you are in rich text or staring at raw markdown.
 */
export function MarkdownEditor({
  value,
  onChange,
  mode,
  onModeChange,
  theme,
  placeholder,
  className,
  hideModeSwitcher = false,
  hideToolbar = false,
  onCursorChange,
  images,
  imageDestination,
}: MarkdownEditorProps) {
  // Split view: the divider position, as a percentage of the container width.
  const [splitRatio, setSplitRatio] = useState(50);
  const [dragging, setDragging] = useState(false);

  // The live surfaces, so the toolbar can act on whichever one is mounted.
  const [tiptap, setTiptap] = useState<Editor | null>(null);
  const sourceHandle = useRef<SourceEditorHandle | null>(null);
  // Re-render when the rich editor's marks change, so the B/I/S buttons show
  // the state of the text under the caret rather than a stale one.
  /**
   * Bumped whenever the rich editor's toolbar-visible state changes.
   *
   * The value is used, not just the setter: it is a dependency of the memo
   * that builds the toolbar's surface below. Discarding it meant the memo had
   * nothing that changed when the caret moved, so it kept handing back the
   * surface built at mount — the block dropdown was stuck on whatever the
   * caret started in (a new note starts on its `#` title, hence a permanent
   * "Heading 1"), and choosing that same entry fired no change event, so the
   * dropdown appeared to do nothing at all.
   */
  const [richTick, forceRender] = useState(0);
  // Where the caret is in the source surface. Held here as well as reported
  // upwards because the toolbar's paragraph-style dropdown reads the line the
  // caret is on, and has to be redrawn when it moves.
  const [sourceCursor, setSourceCursor] = useState<CursorPosition | null>(null);

  const [imageOpen, setImageOpen] = useState(false);
  const [linkRequest, setLinkRequest] = useState<{ text: string; url: string } | null>(null);
  const [imageStatus, setImageStatus] = useState<{ busy: boolean; error: string | null } | null>(
    null,
  );

  const handleTiptapReady = useCallback((editor: Editor | null) => {
    setTiptap(editor);
  }, []);

  const isRich = mode === "wysiwyg";

  // Rich text has no source surface to report from, so the status bar is told
  // to drop the reading rather than keep showing where the caret used to be.
  useEffect(() => {
    if (isRich) {
      onCursorChange?.(null);
      setSourceCursor(null);
    }
  }, [isRich, onCursorChange]);

  const handleCursor = useCallback(
    (position: CursorPosition) => {
      setSourceCursor(position);
      onCursorChange?.(position);
    },
    [onCursorChange],
  );

  // Keep the toolbar's active states honest.
  //
  // Subscribing here rather than in the ready callback means the listeners are
  // removed again when the editor goes away; registering them inside a callback
  // the child may call more than once leaked a listener each time.
  //
  // Re-rendering on every transaction also fed back on itself: a render can
  // dispatch a transaction of its own, which re-rendered, which dispatched —
  // React eventually gave up with "Maximum update depth exceeded". So compare
  // the state the toolbar actually shows and only re-render when it differs,
  // which is both loop-free and far less work while typing.
  useEffect(() => {
    if (!tiptap) return;

    let previous = signatureOf(tiptap);

    const check = () => {
      const next = signatureOf(tiptap);
      if (next === previous) return;
      previous = next;
      forceRender((n) => n + 1);
    };

    tiptap.on("selectionUpdate", check);
    tiptap.on("transaction", check);

    return () => {
      tiptap.off("selectionUpdate", check);
      tiptap.off("transaction", check);
    };
  }, [tiptap]);

  const handleDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;

    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const ratio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      // Clamped so neither pane can be dragged shut.
      setSplitRatio(Math.min(80, Math.max(20, ratio)));
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // ── Images ──────────────────────────────────────────────────────────────

  const canUpload = Boolean(images?.upload);

  /** Puts an already-stored image into whichever surface is live. */
  const insertImageSrc = useCallback(
    (src: string, alt: string) => {
      if (isRich) {
        if (tiptap) tiptap.chain().focus().setImage({ src, alt }).run();
      } else {
        sourceHandle.current?.insertAtCursor(`![${alt}](${src})`);
      }
    },
    [isRich, tiptap],
  );

  const uploadAndInsert = useCallback(
    async (file: File, alt: string) => {
      if (!images?.upload) throw new Error("There is nowhere to store this image yet.");
      const src = await images.upload(file);
      insertImageSrc(src, alt || file.name.replace(/\.[^.]+$/, ""));
    },
    [images, insertImageSrc],
  );

  /** Paste and drop in the raw-markdown surface. */
  const handleSourceImages = useCallback(
    (files: File[], insert: (markdown: string) => void) => {
      if (!images?.upload) return;

      setImageStatus({ busy: true, error: null });
      void (async () => {
        try {
          for (const file of files) {
            const src = await images.upload!(file);
            insert(`![${file.name.replace(/\.[^.]+$/, "")}](${src})\n`);
          }
          setImageStatus({ busy: false, error: null });
        } catch (error) {
          setImageStatus({
            busy: false,
            error: error instanceof Error ? error.message : "That image could not be added.",
          });
        }
      })();
    },
    [images],
  );

  // ── Running an action ───────────────────────────────────────────────────

  const actionContext = useMemo(
    () => ({
      requestImage: () => setImageOpen(true),
      requestLink: () => {
        if (isRich && tiptap) {
          const { from, to } = tiptap.state.selection;
          setLinkRequest({
            text: tiptap.state.doc.textBetween(from, to, " "),
            url: (tiptap.getAttributes("link").href as string) ?? "",
          });
        } else {
          setLinkRequest({ text: sourceHandle.current?.selection() ?? "", url: "" });
        }
      },
    }),
    [isRich, tiptap],
  );

  const runAction = useCallback(
    (id: string) => {
      if (isRich) {
        if (tiptap) runRichAction(tiptap, id, actionContext);
      } else {
        runSourceAction(sourceHandle.current, id, actionContext);
      }
    },
    [isRich, tiptap, actionContext],
  );

  const applyLink = useCallback(
    (url: string, text: string) => {
      const label = text || url;

      if (isRich && tiptap) {
        // Replacing the text as well as the mark means editing a link's label
        // in the dialog actually changes the document, rather than silently
        // only changing where it points.
        tiptap
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: label,
            marks: [{ type: "link", attrs: { href: url } }],
          })
          .run();
        return;
      }

      sourceHandle.current?.insertAtCursor(`[${label}](${url})`);
    },
    [isRich, tiptap],
  );

  // ── The surface the toolbar drives ──────────────────────────────────────

  const surface = useMemo<ToolbarSurface | undefined>(() => {
    if (isRich) {
      if (!tiptap) return undefined;
      return richSurface(tiptap);
    }
    // Reading the handle needs a re-render trigger, which the cursor provides.
    return sourceSurface(sourceHandle, sourceCursor);
  }, [isRich, tiptap, sourceCursor, richTick]);

  // Rich text and raw Markdown can hold different things, so the toolbar shows
  // only what the surface underneath it can actually apply.
  const actions = useMemo(() => insertActionsFor(isRich ? "rich" : "source"), [isRich]);

  const resolveImageSrc = images?.resolve;

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      {!hideModeSwitcher && onModeChange && (
        <div className="mb-3 flex justify-end">
          <div
            role="tablist"
            aria-label="Editor mode"
            className="flex shrink-0 rounded-lg border border-[var(--fl-border)] p-0.5"
          >
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={mode === option.value}
                title={option.hint}
                onClick={() => onModeChange(option.value)}
                className={`rounded-[6px] px-3 py-1 text-[13px] font-medium transition-colors ${
                  mode === option.value
                    ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                    : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hideToolbar && (
        <EditorToolbar
          actions={actions}
          onRun={runAction}
          disabled={isRich && !tiptap}
          status={imageStatus}
          onDismissStatus={() => setImageStatus(null)}
          {...(surface ? { surface } : {})}
        />
      )}

      {mode === "wysiwyg" && (
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <WysiwygEditor
            value={value}
            onChange={onChange}
            onReady={handleTiptapReady}
            onImageStatus={setImageStatus}
            slashActions={actionContext}
            {...(images ? { images } : {})}
            {...(placeholder ? { placeholder } : {})}
            // A wide bottom pad so the last paragraph can be scrolled to the
            // middle of the screen instead of being pinned to the bottom edge.
            className="relative mx-auto w-full max-w-[46rem] px-6 py-10 pb-[40vh]"
          />
        </div>
      )}

      {mode === "source" && (
        <div className="mx-auto min-h-0 w-full max-w-[46rem] flex-1 overflow-hidden px-2">
          <SourceEditor
            value={value}
            onChange={onChange}
            handleRef={sourceHandle}
            onCursorChange={handleCursor}
            slashActions={actionContext}
            {...(canUpload ? { onImageFiles: handleSourceImages } : {})}
            {...(placeholder ? { placeholder } : {})}
            showLineNumbers
          />
        </div>
      )}

      {mode === "split" && (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div
            className="flex min-w-0 flex-col overflow-hidden"
            style={{ width: `${splitRatio}%` }}
          >
            <PaneLabel>Source</PaneLabel>
            <SourceEditor
              value={value}
              onChange={onChange}
              handleRef={sourceHandle}
              onCursorChange={handleCursor}
              slashActions={actionContext}
              {...(canUpload ? { onImageFiles: handleSourceImages } : {})}
              {...(placeholder ? { placeholder } : {})}
              showLineNumbers
              className="min-h-0 w-full flex-1 overflow-hidden"
            />
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            tabIndex={0}
            onPointerDown={handleDrag}
            onKeyDown={(event) => {
              // Keyboard resizing, so the divider is not mouse-only.
              if (event.key === "ArrowLeft") setSplitRatio((r) => Math.max(20, r - 5));
              if (event.key === "ArrowRight") setSplitRatio((r) => Math.min(80, r + 5));
            }}
            // A 1px line is a dexterity test, so the hit area is 9px wide with
            // the visible rule drawn inside it.
            className={`group relative w-[9px] shrink-0 cursor-col-resize focus:outline-none`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
                dragging
                  ? "bg-[var(--fl-accent)]"
                  : "bg-[var(--fl-border)] group-hover:bg-[var(--fl-accent)] group-focus:bg-[var(--fl-accent)]"
              }`}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--fl-surface)]">
            <PaneLabel>Preview</PaneLabel>
            <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-16">
              <Preview
                markdown={value}
                {...(theme ? { theme } : {})}
                {...(resolveImageSrc ? { resolveImageSrc } : {})}
                className="mx-auto max-w-2xl"
              />
            </div>
          </div>
        </div>
      )}

      {imageOpen && (
        <ImageDialog
          canUpload={canUpload}
          embedsInNote={images?.storesLocally === true}
          onUpload={uploadAndInsert}
          onUrl={insertImageSrc}
          onClose={() => setImageOpen(false)}
          {...(imageDestination ? { destination: imageDestination } : {})}
        />
      )}

      {linkRequest && (
        <LinkDialog
          initialText={linkRequest.text}
          initialUrl={linkRequest.url}
          onSubmit={applyLink}
          {...(isRich && tiptap?.isActive("link")
            ? { onRemove: () => tiptap.chain().focus().unsetLink().run() }
            : {})}
          onClose={() => setLinkRequest(null)}
        />
      )}
    </div>
  );
}

// ─── Surfaces ───────────────────────────────────────────────────────────────

/** The toolbar's view of the rich-text editor. */
function richSurface(editor: Editor): ToolbarSurface {
  const table: TableCommands | null = editor.isActive("table")
    ? {
        addRowBefore: () => editor.chain().focus().addRowBefore().run(),
        addRowAfter: () => editor.chain().focus().addRowAfter().run(),
        deleteRow: () => editor.chain().focus().deleteRow().run(),
        addColumnBefore: () => editor.chain().focus().addColumnBefore().run(),
        addColumnAfter: () => editor.chain().focus().addColumnAfter().run(),
        deleteColumn: () => editor.chain().focus().deleteColumn().run(),
        toggleHeaderRow: () => editor.chain().focus().toggleHeaderRow().run(),
        mergeOrSplit: () => editor.chain().focus().mergeOrSplit().run(),
        deleteTable: () => editor.chain().focus().deleteTable().run(),
      }
    : null;

  return {
    kind: "rich",
    isMarkActive: (mark) => editor.isActive(mark),
    toggleMark: (mark) => {
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
    },
    blockStyle: richBlockStyle(editor),
    setBlockStyle: (style) => {
      const chain = editor.chain().focus();
      if (style === "paragraph") {
        // Blockquote and code block are wrappers rather than node types, so
        // "Normal text" has to lift out of them as well.
        if (editor.isActive("blockquote")) chain.lift("blockquote");
        if (editor.isActive("codeBlock")) chain.setParagraph().run();
        else chain.setParagraph().run();
        return;
      }
      if (style === "quote") return chain.toggleBlockquote().run();
      if (style === "code") return chain.toggleCodeBlock().run();

      const level = Number(style.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      chain.setHeading({ level }).run();
    },
    isListActive: (kind) =>
      editor.isActive(
        kind === "bullet" ? "bulletList" : kind === "ordered" ? "orderedList" : "taskList",
      ),
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run(),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    // In a list this nests; elsewhere ProseMirror has nothing to indent, which
    // is also true of markdown outside a list.
    indent: () => {
      if (!editor.chain().focus().sinkListItem("taskItem").run()) {
        editor.chain().focus().sinkListItem("listItem").run();
      }
    },
    outdent: () => {
      if (!editor.chain().focus().liftListItem("taskItem").run()) {
        editor.chain().focus().liftListItem("listItem").run();
      }
    },
    clearFormatting: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    table,
  };
}

function richBlockStyle(editor: Editor): BlockStyle {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive("heading", { level })) return `h${level}` as BlockStyle;
  }
  if (editor.isActive("codeBlock")) return "code";
  if (editor.isActive("blockquote")) return "quote";
  return "paragraph";
}

/**
 * The toolbar's view of the raw-markdown editor.
 *
 * Everything here works on text, because that is all raw markdown is. The
 * important part is that the *same* buttons do the *same* thing: selecting a
 * word and pressing Bold wraps it in `**`, and the paragraph dropdown reads
 * the line the caret is on rather than being permanently blank.
 */
function sourceSurface(
  handleRef: React.RefObject<SourceEditorHandle | null>,
  _cursor: CursorPosition | null,
): ToolbarSurface {
  const handle = () => handleRef.current;
  const line = handle()?.currentLine() ?? "";
  const selection = handle()?.selection() ?? "";

  const wrappedIn = (marker: string) =>
    selection.length > marker.length * 2 &&
    selection.startsWith(marker) &&
    selection.endsWith(marker);

  return {
    kind: "source",
    isMarkActive: (mark) => {
      switch (mark) {
        case "bold":
          return wrappedIn("**");
        case "italic":
          return wrappedIn("_");
        case "strike":
          return wrappedIn("~~");
        case "code":
          return wrappedIn("`");
        case "highlight":
          return wrappedIn("==");
      }
    },
    toggleMark: (mark: FormatMark) => {
      const markers: Record<FormatMark, string> = {
        bold: "**",
        italic: "_",
        strike: "~~",
        code: "`",
        highlight: "==",
      };
      handle()?.wrapSelection(markers[mark]);
    },
    blockStyle: sourceBlockStyle(line),
    setBlockStyle: (style) => {
      const target = handle();
      if (!target) return;

      const HEADING = /^#{1,6} /;
      const ANY_BLOCK = /^(#{1,6} |> )/;

      if (style === "paragraph") return target.toggleLinePrefix("", ANY_BLOCK);
      if (style === "quote") return target.toggleLinePrefix("> ");
      if (style === "code") return target.insertAtCursor("```\n\n```\n", 4);

      const level = Number(style.slice(1));
      target.toggleLinePrefix(`${"#".repeat(level)} `, HEADING);
    },
    isListActive: (kind) => {
      if (kind === "task") return /^\s*- \[[ xX]\] /.test(line);
      if (kind === "ordered") return /^\s*\d+\. /.test(line);
      return /^\s*[-*+] (?!\[[ xX]\])/.test(line);
    },
    undo: () => handle()?.undo(),
    redo: () => handle()?.redo(),
    canUndo: handle()?.canUndo() ?? false,
    canRedo: handle()?.canRedo() ?? false,
    indent: () => handle()?.indent(1),
    outdent: () => handle()?.indent(-1),
    clearFormatting: () => {
      const target = handle();
      if (!target) return;
      // Take the block marker off and unwrap the common inline markers around
      // the selection — the markdown equivalent of "back to plain text".
      target.toggleLinePrefix("", /^(#{1,6} |> |- \[[ xX]\] |[-*+] |\d+\. )/);
    },
    // Markdown tables are text, so there is no cell to stand in and no
    // structure to act on. The dedicated row-and-column controls stay in rich
    // text rather than appearing here and doing nothing.
    table: null,
  };
}

function sourceBlockStyle(line: string): BlockStyle {
  const heading = /^(#{1,6}) /.exec(line);
  if (heading) return `h${heading[1]!.length}` as BlockStyle;
  if (/^> /.test(line)) return "quote";
  if (/^```/.test(line)) return "code";
  return "paragraph";
}

/**
 * The toolbar state, in a form cheap to compare.
 *
 * Every value the bar renders has to be in here, or the button will keep
 * showing the state of wherever the caret used to be.
 */
function signatureOf(editor: Editor): string {
  const marks = ["bold", "italic", "strike", "code", "highlight"]
    .map((mark) => (editor.isActive(mark) ? "1" : "0"))
    .join("");
  const lists = ["bulletList", "orderedList", "taskList"]
    .map((list) => (editor.isActive(list) ? "1" : "0"))
    .join("");

  return [
    marks,
    lists,
    richBlockStyle(editor),
    editor.isActive("table") ? "t" : "-",
    editor.can().undo() ? "u" : "-",
    editor.can().redo() ? "r" : "-",
  ].join("|");
}

/**
 * The small caption above each split pane.
 *
 * Two undifferentiated columns of text is a puzzle for anyone who has not used
 * a split editor before; naming them costs one line each.
 */
function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="shrink-0 px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
      {children}
    </p>
  );
}
