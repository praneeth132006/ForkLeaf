"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import type { Editor } from "@tiptap/core";

/**
 * A `[[wikilink]]` the markdown serialiser has escaped into `\[\[…\]\]`.
 *
 * prosemirror-markdown escapes every `[` it writes, which is correct for text
 * that might otherwise be read as a link and catastrophic for this one: a
 * wikilink typed in the rich editor was written to the file as `\[\[Roadmap\]\]`,
 * which is not a wikilink in Obsidian, on github.com, or on the next load of
 * ForkLeaf itself. The note looked right on screen and was wrong on disk.
 */
const ESCAPED_WIKILINK = /\\\[\\\[([^\n]*?)\\\]\\\]/g;

/**
 * A line break, as tiptap-markdown writes it: a backslash, then a newline.
 *
 * Valid CommonMark, and the wrong thing to put in somebody's notes. Because
 * the parser below runs with `breaks` on — a newline is a line break, the way
 * Obsidian and every other notes app treats it — a bare newline already round-
 * trips as a hard break and the escape buys nothing. Left in, every line of a
 * file grew a trailing backslash the moment the rich editor touched it: open a
 * note, type nothing, and the file on GitHub has changed because you looked
 * at it.
 *
 * Anchored to end-of-line so a backslash in the middle of a line — an escaped
 * character somebody meant — is untouched.
 */
const ESCAPED_LINE_BREAK = /\\\n/g;

/**
 * tiptap-markdown 0.9 targets Tiptap 2 and does not augment Tiptap 3's
 * `Storage` interface, so `editor.storage.markdown` is untyped. This reads it
 * through the package's own exported shape rather than sprinkling `any` around.
 *
 * Two repairs on the way out, both narrow: the wikilink escaping above, and
 * the line-break escaping below. Neither unescapes anything in general, so a
 * `\[` or a `\` somebody escaped on purpose survives.
 *
 * Exported for its tests. This is the only code in ForkLeaf that can silently
 * rewrite a user's file — it runs on every keystroke — so what it produces is
 * asserted byte for byte rather than inferred from what the screen looks like.
 */
export function markdownOf(editor: Editor): string {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown
    .getMarkdown()
    .replace(ESCAPED_WIKILINK, "[[$1]]")
    .replace(ESCAPED_LINE_BREAK, "\n");
}
import { CodeBlock } from "./extensions/CodeBlock";
import { ResolvedImage } from "./extensions/ResolvedImage";
import { YoutubeEmbed } from "./extensions/YoutubeEmbed";
import {
  ColouredHighlight,
  HIGHLIGHT_COLOURS,
  DEFAULT_HIGHLIGHT,
} from "./extensions/ColouredHighlight";
import { TextSelection } from "@tiptap/pm/state";
import { imagesFrom, type ImageBridge } from "./images";
import { MermaidBlock } from "./extensions/MermaidBlock";
import { Wikilink } from "./extensions/Wikilink";
import { EnterIsALineBreak } from "./extensions/EnterIsALineBreak";
import { ShortcutsAfterLineBreak } from "./extensions/ShortcutsAfterLineBreak";
import { SmartPaste } from "./extensions/SmartPaste";
import { LeaveInlineMark } from "./extensions/LeaveInlineMark";
import { RoomToWrite } from "./extensions/RoomToWrite";
import type { LinkBridge } from "./links";
import { readSlashState } from "./extensions/SlashCommands";
import { isolateCurrentLine } from "./isolate-line";
import { caretBelow } from "./caret";
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
  /** How `[[wikilinks]]` resolve, and what ⌘-clicking one does. */
  links?: LinkBridge;
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
  links,
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
  const linksRef = useRef<LinkBridge | undefined>(links);
  linksRef.current = links;

  /**
   * Images waiting to hear that the resolver knows something new.
   *
   * The bridge resolves a note-relative path against a store that fills up
   * while the note is open, so an image inserted before its bytes are
   * published there resolves to a placeholder. Each rendered image subscribes
   * and re-asks whenever a new bridge arrives, which is what a new entry in
   * that store looks like from in here.
   */
  const resolveListeners = useRef<Set<() => void>>(new Set());
  const subscribeToResolver = useCallback((listener: () => void) => {
    resolveListeners.current.add(listener);
    return () => {
      resolveListeners.current.delete(listener);
    };
  }, []);

  // Deliberately without a dependency list. What images need to hear about is
  // a change in what the resolver *answers*, and the bridge is a closure over
  // state held by the app — its identity says nothing reliable about that.
  // Re-asking is a lookup per image, and only touches the DOM when the answer
  // has actually changed.
  useEffect(() => {
    for (const listener of resolveListeners.current) listener();
  });

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
      ColouredHighlight.configure({ multicolor: true }),
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
        subscribe: subscribeToResolver,
        HTMLAttributes: { loading: "lazy" },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // Carried on the mark so a link survives into exported HTML pointing
        // outward rather than replacing the page it was exported from. In the
        // editor itself the click is handled below, since an editable document
        // does not follow hrefs.
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
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
      YoutubeEmbed,
      // Read through the ref, not captured: the extension list is built once,
      // and the bridge arrives a render later once the workspace resolves.
      Wikilink.configure({ bridge: () => linksRef.current }),
      // After the nodes it defers to, so their own Enter handling is already
      // registered when this decides whether to step aside.
      EnterIsALineBreak,
      // After it, because it exists to repair what that one changes: a line
      // that begins after a hard break rather than at the start of a block.
      ShortcutsAfterLineBreak,
      // Reshapes what the clipboard hands over — code into a code block, lines
      // into lines. Registered before the markdown extension because it
      // borrows that one's text parser and has to be able to stand aside for
      // it, not the other way round.
      SmartPaste,
      // Before the marks' own `exitable` handling, which only fires at the end
      // of a whole paragraph — which, with Enter making lines, is rarely where
      // anybody is standing.
      LeaveInlineMark,
      // Last of the keyboard extensions: its Enter and ↓ only do anything in
      // the places every other handler has already declined.
      RoomToWrite,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
        /**
         * A newline is a line break.
         *
         * CommonMark says a single newline inside a paragraph is a space,
         * which is right for prose meant to be typeset and wrong for a
         * notebook — and it made the two editing surfaces disagree about the
         * same file: four lines in the source view, one run-on paragraph in
         * rich text, with nothing to say which one the file really was.
         *
         * Matched by `remark-breaks` in the preview and the export, and by the
         * escape repair above on the way back out, so the round trip is exact
         * in both directions.
         */
        breaks: true,
        linkify: true,
      }),
    ],
    [placeholder, subscribeToResolver],
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

        /**
         * A paste replaces the selection, which is what puts the picture *in*
         * an empty paragraph rather than leaving a blank line above it. A drop
         * knows the position it landed on and inserts there.
         */
        if (position === undefined) tr.replaceSelectionWith(node, false);
        else tr.insert(position, node);
        view.dispatch(tr);

        /**
         * Where the image actually ended up, read off the document.
         *
         * Two more obvious answers are both wrong, and both were tried. Adding
         * the node's size to the insertion point assumes a plain insertion,
         * and inserting a block where the caret is inside a paragraph splits
         * that paragraph — so the sum came out two tokens short. Mapping the
         * caret position through the transaction is worse: when the caret is
         * at the *end* of a paragraph the image goes in after that block
         * entirely, the insertion is past the position being mapped, and the
         * mapping quite correctly returns the caret exactly where it was —
         * above the picture, which is where people found it.
         *
         * The src carries a random tail precisely so no two uploads collide,
         * which makes this lookup unambiguous.
         */
        let end: number | null = null;
        view.state.doc.descendants((child, pos) => {
          if (child.type.name === "image" && child.attrs.src === src) end = pos + child.nodeSize;
        });

        // Anything after the first lands below the one before it.
        position = end ?? position;
      }
      /**
       * The caret goes below the picture, on a line of its own.
       *
       * An image is a block, so after inserting one the selection sat on the
       * node itself: the next thing typed replaced the image that had just
       * been uploaded, and the way to avoid that was to know to click below it
       * first. Pasting a screenshot into a note is nearly always followed by
       * writing about the screenshot.
       */
      if (position !== undefined) caretBelow(view, position);

      // The upload stored the image locally and called setAssetUrls(), which
      // is a React state update. That update was processed while `await`
      // yielded — *before* the node was created and its view registered a
      // resolve listener. So the useEffect that normally notifies listeners
      // already ran against an empty set. Fire every listener now so the
      // freshly-registered paint() callbacks re-ask the resolver, which
      // already has the correct blob URL.
      for (const listener of resolveListeners.current) listener();
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
      /**
       * Clicking a link follows it, in a tab of its own.
       *
       * `openOnClick` is off, which used to mean a link in rich text did
       * nothing at all: a captured web source rendered its address and its
       * archived copy and neither could be opened, in the one view most people
       * write in. A link you cannot follow is not a link.
       *
       * The usual objection is that a plain click has to place the caret,
       * since this is text being written — so Alt-click still does, and the
       * hover card says so. Alt is the escape hatch here rather than the other
       * way round because following a link is what people do to a link a
       * hundred times for every time they edit its text, and the rare case is
       * the one that should take the modifier.
       *
       * A new tab, always: the alternative navigates away from a note that may
       * hold unsaved writing.
       */
      handleClick: (_view, _pos, event) => {
        // Alt is "put the caret in here", and every other modifier is the
        // browser's own — ⇧ extends a selection, and ⌘/Ctrl already mean "open
        // in a new tab" everywhere else, which is what this does anyway.
        if (event.altKey || event.shiftKey) return false;

        const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
        const href = anchor?.getAttribute("href") ?? "";
        if (!/^(https?:\/\/|mailto:)/i.test(href)) return false;

        event.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
        return true;
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

  /**
   * Puts the caret in the note's body rather than in its title.
   *
   * A note opens with the selection at position zero, which is inside the
   * leading `# Title` — so the formatting bar greeted every new note with
   * "Heading 1", and the first thing typed became part of the title. The body
   * is where writing actually starts, so that is where the caret goes.
   *
   * A brand-new note is *only* a title, with no body to put the caret in, so
   * one empty paragraph is added. It is added behind `applyingExternal`, which
   * is the same guard the external-value sync uses: an empty trailing
   * paragraph serialises back to no markdown at all, so reporting it as an
   * edit would mark a note dirty for a change that does not exist on disk.
   *
   * The selection is moved without taking focus. This runs on mount for every
   * note opened, and stealing focus from, say, the search box because a note
   * finished loading is its own kind of rude.
   */
  useEffect(() => {
    if (!editor) return;

    const first = editor.state.doc.firstChild;
    if (first?.type.name !== "heading") return;

    // Just past the title node. `+1` steps inside the block that follows it,
    // which is where its text begins.
    const body = first.nodeSize + 1;

    const paragraph = editor.state.schema.nodes.paragraph;
    const tr = editor.state.tr;

    if (body >= tr.doc.content.size) {
      if (!paragraph) return;
      tr.insert(tr.doc.content.size, paragraph.create());
    }

    // One transaction, so the caret is placed against the document that has
    // the paragraph in it. Moving it in a second dispatch put it at position
    // 16 of a fifteen-position document, which ProseMirror clamps back to the
    // end of the title — exactly the place this exists to avoid.
    tr.setSelection(TextSelection.near(tr.doc.resolve(body)));
    // Kept out of the undo stack: pressing undo on a note you have just opened
    // should do nothing, not delete a paragraph you never typed.
    tr.setMeta("addToHistory", false);

    applyingExternal.current = true;
    editor.view.dispatch(tr);
    applyingExternal.current = false;
    // Mount only. Re-running as the document changes would drag the caret back
    // to the top every time the note synced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

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
    if (sameMarkdown(current, value)) return;

    // A value we produced ourselves, arriving late. The document is already
    // at least as new as this, so rebuilding it from the prop would undo work.
    if (emitted.current.some((seen) => sameMarkdown(seen, value))) return;

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
        <HighlightPicker editor={editor} />
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * Whether two markdown strings are the same document.
 *
 * Trailing blank lines are not content. A note is stored as `# Title\n\n`,
 * while serialising the editor's document back to markdown yields
 * `# Title` — so a byte comparison said the prop and the editor disagreed,
 * every note rebuilt itself from the prop the moment it opened, and that
 * rebuild reset the caret to the end of the title and threw away the undo
 * history. It also fought the caret placement above, which is how it was
 * finally noticed.
 */
function sameMarkdown(a: string, b: string): boolean {
  return a.replace(/\s+$/, "") === b.replace(/\s+$/, "");
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
  /**
   * Read live, not at render time.
   *
   * The bubble's buttons used to compute this while `WysiwygEditor` rendered,
   * which happens when the note changes and almost never when the *selection*
   * does. So selecting a bold, highlighted phrase popped up a toolbar with
   * nothing pressed on it: the buttons were reporting the formatting of
   * wherever the caret had been at the last render. There was no way to tell
   * from the toolbar what was already applied to the words in front of you,
   * which is most of what a toolbar is for.
   */
  const active = useEditorState({
    editor,
    selector: ({ editor: instance }) => instance.isActive(mark),
  });

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
      /**
       * `--fl-inverse-text`, not `--fl-elevated`.
       *
       * The bubble sits on `--fl-inverse-bg`, and the inactive glyphs were
       * painted in `--fl-elevated` — a *surface* colour, near-black in the dark
       * theme. Bold, italic, strikethrough and the rest were black letters on a
       * black background: present, clickable, and invisible.
       */
      className={`h-7 min-w-7 rounded px-1.5 text-sm transition ${
        active
          ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
          : "text-[var(--fl-inverse-text)] hover:bg-[var(--fl-inverse-text)]/15"
      } ${className ?? ""}`}
    >
      {glyph}
    </button>
  );
}

// ─── Highlight colours ──────────────────────────────────────────────────────

/**
 * Highlight, in a choice of colours.
 *
 * The button itself does what it always did — toggle a plain highlight, the one
 * that stays `==text==` in the file. The swatches beside it are the rest of the
 * palette, and they are shown rather than hidden behind a menu: five colours
 * take less room than the dropdown that would hold them, and picking a colour
 * should not be two clicks deep.
 */
function HighlightPicker({ editor }: { editor: Editor }) {
  // Live, for the same reason as the buttons above: which colour is on has to
  // be read when the selection moves, not when the document does.
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      active: instance.isActive("highlight"),
      colour:
        HIGHLIGHT_COLOURS.find((candidate) =>
          instance.isActive("highlight", { color: candidate.name }),
        )?.name ?? null,
    }),
  });
  const active = state.active;

  return (
    <span className="flex items-center gap-0.5">
      <FormatButton editor={editor} mark="highlight" label="Highlight" glyph="H" />

      <span className="mx-0.5 h-4 w-px bg-[var(--fl-inverse-text)]/20" aria-hidden="true" />

      {HIGHLIGHT_COLOURS.filter((colour) => colour.name !== DEFAULT_HIGHLIGHT).map((colour) => {
        const on = active && state.colour === colour.name;

        return (
          <button
            key={colour.name}
            type="button"
            title={`${colour.label} highlight`}
            aria-label={`${colour.label} highlight`}
            aria-pressed={on}
            onClick={() => {
              const chain = editor.chain().focus();
              // Clicking the colour already on removes the highlight, which is
              // what a pressed button should do everywhere.
              if (on) chain.unsetHighlight().run();
              else chain.setHighlight({ color: colour.name }).run();
            }}
            className={`h-5 w-5 rounded-full border transition ${
              on
                ? "border-[var(--fl-inverse-text)] ring-2 ring-[var(--fl-inverse-text)]/40"
                : "border-[var(--fl-inverse-text)]/25 hover:border-[var(--fl-inverse-text)]/60"
            }`}
            style={{ backgroundColor: `var(--fl-hl-${colour.name})` }}
          />
        );
      })}
    </span>
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

      // Enter inserts a hard break here, so the paragraph the cursor is in is
      // usually several visible lines. A command that replaces the block has to
      // be handed the one line the writer typed the slash on, or it takes every
      // line above it with it.
      if (!command.inline) isolateCurrentLine(editor);

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
  //
  // The handler is registered once per open/close and reads the highlighted row
  // and the run function through refs. Listing them as effect dependencies
  // instead meant the listener was torn down and rebuilt on every arrow key and
  // — because `run` closes over a `state` that changes on every editor
  // transaction — left a window where Enter fired the command that *had* been
  // highlighted rather than the one that is.
  const liveRef = useRef({ commands, selectedIndex, run });
  liveRef.current = { commands, selectedIndex, run };

  useEffect(() => {
    if (!state.active) return;

    const handler = (event: KeyboardEvent) => {
      const { commands: list, selectedIndex: index, run: exec } = liveRef.current;
      if (list.length === 0) {
        // Nothing matches. Escape still has to close the menu, or the only way
        // out of an empty result set is to delete the query by hand.
        if (event.key === "Escape") {
          event.preventDefault();
          setState({ active: false, query: "", from: 0 });
        }
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setSelectedIndex((current) => (current + 1) % list.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          setSelectedIndex((current) => (current - 1 + list.length) % list.length);
          break;
        case "Enter":
        case "Tab": {
          event.preventDefault();
          const command = list[index];
          if (command) exec(command);
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
  }, [state.active]);

  if (!state.active) return null;

  // An empty result set gets a row saying so rather than the menu disappearing.
  // Vanishing is indistinguishable from the feature not existing, and it is the
  // state a mistyped query lands in most often.
  if (commands.length === 0) {
    return (
      <div
        className="absolute z-50 w-72 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2.5 shadow-[var(--fl-shadow-lg)]"
        style={{ top: position.top, left: position.left }}
      >
        <p className="text-[13px] text-[var(--fl-text)]">
          No blocks match &ldquo;{state.query}&rdquo;
        </p>
        <p className="mt-0.5 text-[11.5px] text-[var(--fl-muted)]">
          Try heading, list, table, code, diagram — or press Escape.
        </p>
      </div>
    );
  }

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
