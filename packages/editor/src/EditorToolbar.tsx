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

export interface EditorToolbarProps {
  actions: InsertAction[];
  onRun: (id: string) => void;
  /** Inline formatting is only meaningful in the rich-text view. */
  format?: {
    isActive: (mark: string) => boolean;
    toggle: (mark: string) => void;
  };
  disabled?: boolean;
}

/**
 * The editor's insert bar.
 *
 * Exists because `/` is invisible. Someone who has never used a block editor
 * has no way to discover that a diagram is one keystroke away, and telling them
 * in placeholder text only helps while the document is empty.
 */
export function EditorToolbar({ actions, onRun, format, disabled = false }: EditorToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const primary = actions.filter((action) => action.primary);
  const rest = actions.filter((action) => !action.primary);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--fl-border)] px-1 py-1.5">
      {format && (
        <>
          <div className="flex items-center gap-0.5">
            {(
              [
                { mark: "bold", label: "Bold", glyph: "B", className: "font-bold" },
                { mark: "italic", label: "Italic", glyph: "I", className: "font-serif italic" },
                {
                  mark: "strike",
                  label: "Strikethrough",
                  glyph: "S",
                  className: "line-through",
                },
                { mark: "code", label: "Inline code", glyph: "<>", className: "font-mono text-xs" },
              ] as const
            ).map((item) => (
              <ToolbarButton
                key={item.mark}
                label={item.label}
                pressed={format.isActive(item.mark)}
                disabled={disabled}
                onClick={() => format.toggle(item.mark)}
              >
                <span className={item.className}>{item.glyph}</span>
              </ToolbarButton>
            ))}
          </div>
          <Divider />
        </>
      )}

      {primary.map((action) => (
        <ToolbarButton
          key={action.id}
          label={`${action.label} — ${action.hint}`}
          disabled={disabled}
          onClick={() => onRun(action.id)}
          wide
        >
          {action.icon}
          <span className="text-[13px] font-medium">{action.label}</span>
        </ToolbarButton>
      ))}

      {rest.length > 0 && (
        <div className="relative" ref={menuRef}>
          <ToolbarButton
            label="Insert a block"
            disabled={disabled}
            pressed={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            wide
          >
            <PlusIcon />
            <span className="text-[13px] font-medium">Insert</span>
          </ToolbarButton>

          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
            >
              {rest.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
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
      )}

      <span className="ml-auto hidden items-center gap-1.5 pr-1.5 text-[11.5px] text-[var(--fl-muted)] sm:flex">
        Press
        <kbd className="rounded border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-1.5 py-0.5 font-mono text-[11px]">
          /
        </kbd>
        anywhere for these
      </span>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
  pressed = false,
  disabled = false,
  wide = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      // Keeps the caret where it is: a toolbar that steals focus inserts the
      // block in the wrong place.
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

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--fl-border)]" />;
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}
