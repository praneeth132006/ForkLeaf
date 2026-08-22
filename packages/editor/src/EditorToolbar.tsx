"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * One block-insertion action, expressed twice.
 *
 * Rich text and raw markdown are genuinely different insertion mechanisms —
 * one runs a ProseMirror command, the other splices a string — so each action
 * carries both. Keeping them in a single list is what stops the two views
 * offering different menus, which is exactly the inconsistency that made `/`
 * feel broken in Split view.
 */
export interface InsertAction {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** Shown directly in the bar rather than inside the "Insert" menu. */
  primary?: boolean;
}

/** Inline marks the bar can toggle. Every one of them is plain markdown. */
export type FormatMark = "bold" | "italic" | "strike" | "code" | "highlight";

/** The paragraph-level shapes a block can take. */
export type BlockStyle = "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "quote" | "code";

/** Operations on the table around the caret. Rich text only — see below. */
export interface TableCommands {
  addRowBefore: () => void;
  addRowAfter: () => void;
  deleteRow: () => void;
  addColumnBefore: () => void;
  addColumnAfter: () => void;
  deleteColumn: () => void;
  toggleHeaderRow: () => void;
  mergeOrSplit: () => void;
  deleteTable: () => void;
}

/**
 * Everything the bar needs to know about the surface underneath it.
 *
 * Both editing surfaces implement this, which is what lets one toolbar drive
 * rich text and raw markdown without the two drifting apart.
 */
export interface ToolbarSurface {
  kind: "rich" | "source";
  /** Marks under the caret, so the buttons show state rather than guessing. */
  isMarkActive: (mark: FormatMark) => boolean;
  toggleMark: (mark: FormatMark) => void;
  /** The block the caret is in. `null` where the surface cannot tell. */
  blockStyle: BlockStyle | null;
  setBlockStyle: (style: BlockStyle) => void;
  isListActive: (kind: "bullet" | "ordered" | "task") => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  indent: () => void;
  outdent: () => void;
  clearFormatting: () => void;
  /** Present only when the caret is inside a table. */
  table: TableCommands | null;
}

export interface EditorToolbarProps {
  actions: InsertAction[];
  onRun: (id: string) => void;
  surface?: ToolbarSurface;
  disabled?: boolean;
  /** Progress of an image upload, shown at the end of the bar. */
  status?: { busy: boolean; error: string | null } | null;
  onDismissStatus?: () => void;
}

const BLOCK_STYLES: { value: BlockStyle; label: string }[] = [
  { value: "paragraph", label: "Normal text" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
  { value: "h5", label: "Heading 5" },
  { value: "h6", label: "Heading 6" },
  { value: "quote", label: "Quote" },
  { value: "code", label: "Code block" },
];

const MARKS: { mark: FormatMark; label: string; hint: string; render: React.ReactNode }[] = [
  { mark: "bold", label: "Bold", hint: "⌘B", render: <span className="font-bold">B</span> },
  {
    mark: "italic",
    label: "Italic",
    hint: "⌘I",
    render: <span className="font-serif italic">I</span>,
  },
  {
    mark: "strike",
    label: "Strikethrough",
    hint: "⌘⇧X",
    render: <span className="line-through">S</span>,
  },
  {
    mark: "code",
    label: "Inline code",
    hint: "⌘E",
    render: <span className="font-mono text-[11px]">{"</>"}</span>,
  },
  {
    mark: "highlight",
    label: "Highlight",
    hint: "==text==",
    render: <span className="rounded-sm bg-[var(--fl-warn)]/40 px-0.5">H</span>,
  },
];

/**
 * The editor's formatting bar.
 *
 * Deliberately a full ribbon rather than a couple of buttons and an "Insert"
 * menu. Someone arriving from Word does not know that `/` exists, does not
 * know that `**` means bold, and — reasonably — expects the things they can do
 * to a document to be visible. Everything here is plain Markdown: there are no
 * fonts, no colours and no alignment, because none of those survive being
 * written to a `.md` file, and offering a control that silently does nothing
 * to the saved document would be worse than not offering it.
 */
export function EditorToolbar({
  actions,
  onRun,
  surface,
  disabled = false,
  status,
  onDismissStatus,
}: EditorToolbarProps) {
  const inTable = surface?.table != null;

  // Actions with their own button in the bar; the rest live under "More".
  const INLINE_IDS = new Set([
    "bullet",
    "ordered",
    "task",
    "link",
    "image",
    "table",
    "divider",
    "diagram",
    "code",
  ]);
  const overflow = actions.filter(
    (action) => !INLINE_IDS.has(action.id) && !BLOCK_ACTION_IDS.has(action.id),
  );

  const has = (id: string) => actions.some((action) => action.id === id);

  return (
    <div className="shrink-0 border-b border-[var(--fl-border)]">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1.5">
        {/* ── History ─────────────────────────────────────────────────── */}
        {surface && (
          <>
            <Button
              label="Undo"
              hint="⌘Z"
              disabled={disabled || !surface.canUndo}
              onClick={surface.undo}
            >
              <Glyph d="M3 8h7.5a3 3 0 1 1 0 6H7M3 8l3-3M3 8l3 3" />
            </Button>
            <Button
              label="Redo"
              hint="⌘⇧Z"
              disabled={disabled || !surface.canRedo}
              onClick={surface.redo}
            >
              <Glyph d="M13 8H5.5a3 3 0 1 0 0 6H9M13 8l-3-3M13 8l-3 3" />
            </Button>
            <Divider />
          </>
        )}

        {/* ── Block style ─────────────────────────────────────────────── */}
        {surface && (
          <>
            <label className="sr-only" htmlFor="fl-block-style">
              Paragraph style
            </label>
            <select
              id="fl-block-style"
              value={surface.blockStyle ?? "paragraph"}
              disabled={disabled}
              onMouseDown={(event) => event.stopPropagation()}
              onChange={(event) => surface.setBlockStyle(event.target.value as BlockStyle)}
              title="Paragraph style"
              className="h-8 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 text-[12.5px] text-[var(--fl-text)] transition-colors hover:border-[var(--fl-border-strong)] disabled:opacity-40"
            >
              {BLOCK_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Divider />
          </>
        )}

        {/* ── Inline marks ────────────────────────────────────────────── */}
        {surface &&
          MARKS.map((item) => (
            <Button
              key={item.mark}
              label={item.label}
              hint={item.hint}
              pressed={surface.isMarkActive(item.mark)}
              disabled={disabled}
              onClick={() => surface.toggleMark(item.mark)}
            >
              {item.render}
            </Button>
          ))}

        {surface && (
          <Button
            label="Clear formatting"
            hint="Back to plain text"
            disabled={disabled}
            onClick={surface.clearFormatting}
          >
            <Glyph d="M6 3h7M9.5 3 7 13M4 13h5M11.5 10.5l3 3M14.5 10.5l-3 3" />
          </Button>
        )}

        <Divider />

        {/* ── Lists ───────────────────────────────────────────────────── */}
        {has("bullet") && (
          <Button
            label="Bulleted list"
            pressed={surface?.isListActive("bullet") ?? false}
            disabled={disabled}
            onClick={() => onRun("bullet")}
          >
            <Glyph d="M3.25 4h.01M3.25 8h.01M3.25 12h.01M6.5 4h6.5M6.5 8h6.5M6.5 12h6.5" />
          </Button>
        )}
        {has("ordered") && (
          <Button
            label="Numbered list"
            pressed={surface?.isListActive("ordered") ?? false}
            disabled={disabled}
            onClick={() => onRun("ordered")}
          >
            <Text>1.</Text>
          </Button>
        )}
        {has("task") && (
          <Button
            label="To-do list"
            pressed={surface?.isListActive("task") ?? false}
            disabled={disabled}
            onClick={() => onRun("task")}
          >
            <Glyph d="M2.5 4.5h4v4h-4zM3.5 6.5l1 1 2-2.5M9 6.5h5M2.5 11.5h4M9 11.5h5" />
          </Button>
        )}

        {surface && (
          <>
            <Button label="Decrease indent" disabled={disabled} onClick={surface.outdent}>
              <Glyph d="M7 4h7M7 8h7M7 12h7M4.5 6 2.5 8l2 2" />
            </Button>
            <Button label="Increase indent" hint="Tab" disabled={disabled} onClick={surface.indent}>
              <Glyph d="M7 4h7M7 8h7M7 12h7M2.5 6l2 2-2 2" />
            </Button>
          </>
        )}

        <Divider />

        {/* ── Insert ──────────────────────────────────────────────────── */}
        {has("link") && (
          <Button
            label="Link"
            hint="⌘K in the document"
            disabled={disabled}
            onClick={() => onRun("link")}
          >
            <Glyph d="M6.5 9.5 9.5 6.5M6 4.5 7.5 3a2.8 2.8 0 0 1 4 4l-1.5 1.5M10 11.5 8.5 13a2.8 2.8 0 0 1-4-4L6 7.5" />
          </Button>
        )}
        {has("image") && (
          <Button
            label="Image"
            hint="Upload, or paste one straight into the note"
            disabled={disabled}
            onClick={() => onRun("image")}
          >
            <Glyph d="M2.5 3.5h11v9h-11zM2.5 10l3-3 3 3 2-2 2.5 2.5M10 6h.01" />
          </Button>
        )}
        {has("table") && (
          <Button
            label="Table"
            pressed={inTable}
            disabled={disabled}
            onClick={() => onRun("table")}
          >
            <Glyph d="M2.5 3.5h11v9h-11zM2.5 6.5h11M6 6.5v6M10 6.5v6" />
          </Button>
        )}
        {has("code") && (
          <Button label="Code block" disabled={disabled} onClick={() => onRun("code")}>
            <Text>{"</>"}</Text>
          </Button>
        )}
        {has("divider") && (
          <Button label="Divider" disabled={disabled} onClick={() => onRun("divider")}>
            <Glyph d="M2.5 8h11" />
          </Button>
        )}
        {has("diagram") && (
          <Button
            label="Diagram"
            hint="Flowchart, sequence, ERD, Gantt and more"
            disabled={disabled}
            onClick={() => onRun("diagram")}
            wide
          >
            <Glyph d="M3 3h4v4H3zM9 9h4v4H9zM5 7v2h4M11 3h2M11 5h2" />
            <span className="text-[12.5px] font-medium">Diagram</span>
          </Button>
        )}

        {overflow.length > 0 && (
          <OverflowMenu actions={overflow} onRun={onRun} disabled={disabled} />
        )}

        {/* ── Status and hint ─────────────────────────────────────────── */}
        <div className="ml-auto flex items-center gap-2 pl-2">
          {status?.busy && (
            <span className="text-[12px] text-[var(--fl-muted)]" role="status">
              Adding image…
            </span>
          )}
          <span className="hidden items-center gap-1.5 text-[11.5px] text-[var(--fl-muted)] xl:flex">
            Press
            <kbd className="rounded border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-1.5 py-0.5 font-mono text-[11px]">
              /
            </kbd>
            for blocks
          </span>
        </div>
      </div>

      {/* ── Table row, only while the caret is in one ──────────────────── */}
      {surface?.table && (
        <div className="flex flex-wrap items-center gap-0.5 border-t border-[var(--fl-border)] bg-[var(--fl-surface)] px-1.5 py-1">
          <span className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--fl-muted)]">
            Table
          </span>
          <TableButton onClick={surface.table.addRowBefore}>Row above</TableButton>
          <TableButton onClick={surface.table.addRowAfter}>Row below</TableButton>
          <TableButton onClick={surface.table.deleteRow}>Delete row</TableButton>
          <Divider />
          <TableButton onClick={surface.table.addColumnBefore}>Column left</TableButton>
          <TableButton onClick={surface.table.addColumnAfter}>Column right</TableButton>
          <TableButton onClick={surface.table.deleteColumn}>Delete column</TableButton>
          <Divider />
          <TableButton onClick={surface.table.toggleHeaderRow}>Header row</TableButton>
          <TableButton onClick={surface.table.mergeOrSplit}>Merge / split</TableButton>
          <TableButton onClick={surface.table.deleteTable} destructive>
            Delete table
          </TableButton>
        </div>
      )}

      {/* ── Whatever just went wrong ───────────────────────────────────── */}
      {status?.error && (
        <div
          role="alert"
          className="flex items-center gap-2 border-t border-[var(--fl-danger)]/30 bg-[var(--fl-danger)]/8 px-3 py-1.5 text-[12.5px] text-[var(--fl-danger)]"
        >
          <span className="flex-1">{status.error}</span>
          {onDismissStatus && (
            <button type="button" onClick={onDismissStatus} aria-label="Dismiss" className="px-1">
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Ids the paragraph-style dropdown owns, so they are not repeated as buttons. */
const BLOCK_ACTION_IDS = new Set([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "quote",
  "bold",
  "italic",
  "strike",
  "inline-code",
]);

// ─── Pieces ─────────────────────────────────────────────────────────────────

function OverflowMenu({
  actions,
  onRun,
  disabled,
}: {
  actions: InsertAction[];
  onRun: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        label="More blocks"
        pressed={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        wide
      >
        <Glyph d="M8 3.5v9M3.5 8h9" />
        <span className="text-[12.5px] font-medium">More</span>
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRun(action.id);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--fl-elevated)]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--fl-border)] bg-[var(--fl-bg)] text-[var(--fl-muted)]">
                {action.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-[var(--fl-text)]">
                  {action.label}
                </span>
                <span className="block truncate text-[11.5px] text-[var(--fl-muted)]">
                  {action.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Button({
  label,
  hint,
  onClick,
  children,
  pressed = false,
  disabled = false,
  wide = false,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={hint ? `${label} — ${hint}` : label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      // Keeps the caret where it is: a toolbar that steals focus applies the
      // command in the wrong place, or to nothing at all.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] disabled:pointer-events-none disabled:opacity-40 ${
        wide ? "px-2.5" : "w-8"
      } ${pressed ? "bg-[var(--fl-elevated)] text-[var(--fl-text)]" : ""}`}
    >
      {children}
    </button>
  );
}

function TableButton({
  onClick,
  children,
  destructive = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-[var(--fl-elevated)] ${
        destructive
          ? "text-[var(--fl-danger)]"
          : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--fl-border)]" />;
}

function Glyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function Text({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="text-[11px] font-semibold leading-none">
      {children}
    </span>
  );
}
