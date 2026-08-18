"use client";

import React from "react";
import type { Note } from "@forkleaf/types";
import { deriveTitle } from "@forkleaf/markdown-engine";

export interface EditorTabsProps {
  notes: Note[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

/**
 * The open notes, as a strip of tabs.
 *
 * The notebook has kept several notes loaded at once for a while — switching
 * between them is instant and neither loses its scroll position — but there was
 * nothing on screen saying so, which made the feature invisible: the only way
 * back to the note you were just in was to find it in the sidebar again.
 *
 * Closing a tab is not a destructive act and deliberately asks no questions.
 * The note is already saved locally and its changes stay queued for sync;
 * closing only takes it off the strip.
 */
export function EditorTabs({ notes, activePath, onSelect, onClose }: EditorTabsProps) {
  if (notes.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Open notes"
      className="flex h-9 shrink-0 items-stretch gap-px overflow-x-auto border-b border-[var(--fl-border)] bg-[var(--fl-bg)] px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {notes.map((note) => {
        const active = note.path === activePath;
        const label = deriveTitle(note.content, note.frontmatter.title, note.path);

        return (
          <div
            key={note.id}
            className={`group flex min-w-0 shrink-0 items-center self-center rounded-lg transition-colors ${
              active ? "bg-[var(--fl-elevated)]" : "hover:bg-[var(--fl-elevated)]/60"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={note.path}
              onClick={() => onSelect(note.path)}
              // Middle-click closes, as it does in every other tab strip.
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  onClose(note.path);
                }
              }}
              className={`flex max-w-[20ch] items-center gap-1.5 py-1 pl-2.5 pr-1 text-[12.5px] transition-colors ${
                active
                  ? "font-medium text-[var(--fl-text)]"
                  : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              }`}
            >
              <FileGlyph
                className={active ? "text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"}
              />
              <span className="truncate">{label}</span>
              {note.dirty && (
                <span
                  aria-label="Unpushed changes"
                  title="Saved on this device, not yet pushed"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-warn)]"
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => onClose(note.path)}
              aria-label={`Close ${label}`}
              title="Close"
              // Always reachable by keyboard and touch; only drawn on hover or
              // on the active tab, so a full strip is not a row of crosses.
              className={`mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-border)] hover:text-[var(--fl-text)] focus-visible:opacity-100 group-hover:opacity-100 ${
                active ? "opacity-100" : "opacity-0"
              }`}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FileGlyph({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M9 1.75H4.5A1.75 1.75 0 0 0 2.75 3.5v9c0 .97.78 1.75 1.75 1.75h7a1.75 1.75 0 0 0 1.75-1.75V6z" />
      <path d="M9 1.75V6h4.25" />
    </svg>
  );
}
