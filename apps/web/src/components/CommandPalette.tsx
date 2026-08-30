"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Note, PdfTextEntry, TreeNode, Workspace } from "@forkleaf/types";
import { entryFromNote, entryFromPath, queryIndex } from "@/lib/library";
import { searchDocuments } from "@/lib/pdf-index";

/**
 * ⌘K — go anywhere, do anything.
 *
 * Every editor people actually live in has one, and its absence was the single
 * biggest thing separating this from them: the only way to reach a note was to
 * find it by eye in a sidebar of filenames, and the only way to reach the rest
 * of the app was to know a URL. One keystroke now covers both, and it searches
 * on titles rather than filenames because that is what people remember.
 *
 * Notes and commands share one list on purpose. Splitting them would mean
 * deciding, before you type, which of the two you wanted — which is the
 * decision the palette exists to remove.
 */

export interface Command {
  id: string;
  label: string;
  /** Groups the list and gives each row its context line. */
  group: string;
  hint?: string;
  /** Extra words to match on, for commands whose label is not what you'd type. */
  keywords?: string;
  run: () => void | Promise<void>;
}

export interface CommandPaletteProps {
  onClose: () => void;
  /** The repository tree, so every note is reachable — not just the open ones. */
  tree: TreeNode[];
  /** Open notes, which have real titles because their content is loaded. */
  openNotes: Note[];
  workspace: Workspace | null;
  onOpenNote: (path: string) => void;
  /**
   * The documents whose text this notebook has kept, for searching inside.
   *
   * A PDF's text is extracted the first time it is read and stored beside the
   * notebook, so ⌘K can look inside the papers as well as at the notes. Empty
   * until something has been read, which is honest: a document nobody has
   * opened has not been read by anybody, this app included.
   */
  documents?: readonly PdfTextEntry[];
  /** Opens a document at the page a phrase was found on. */
  onOpenDocument?: (pdfPath: string, page: number) => void;
  /**
   * The notes around the one being written, by path, with their distance.
   *
   * What makes a search know where it is being made from: "setup" typed while
   * writing about a project finds that project's setup rather than the other
   * five. Absent when no note is open, which is when there is nowhere to be
   * near.
   */
  nearby?: ReadonlyMap<string, number>;
  commands: Command[];
}

export function CommandPalette({
  onClose,
  tree,
  openNotes,
  workspace,
  onOpenNote,
  documents = [],
  onOpenDocument,
  nearby,
  commands,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Notes as index entries: the loaded ones carry their real title and tags,
  // the rest fall back to the filename until they are opened.
  const noteEntries = useMemo(() => {
    if (!workspace) return [];

    const loaded = new Map(openNotes.map((note) => [note.path, note] as const));
    const paths = filePaths(tree);
    const seen = new Set(paths);

    const entries = paths.map((path) => {
      const note = loaded.get(path);
      return note ? entryFromNote(workspace, note) : entryFromPath(workspace, path);
    });

    // Notes created here but not yet in the tree are still reachable.
    for (const note of openNotes) {
      if (!seen.has(note.path)) entries.push(entryFromNote(workspace, note));
    }

    return entries;
  }, [tree, openNotes, workspace]);

  const noteResults = useMemo(
    () =>
      queryIndex(noteEntries, { query, sort: "recent", ...(nearby ? { nearby } : {}) }).slice(0, 8),
    [noteEntries, query, nearby],
  );

  /**
   * What the papers say, not only what the notes about them say.
   *
   * Only once something has been typed: an empty query would otherwise list
   * the first few pages of every document that has ever been opened, above the
   * commands, for no reason.
   */
  const documentResults = useMemo(
    () => (onOpenDocument ? searchDocuments(documents, query) : []),
    [documents, query, onOpenDocument],
  );

  const commandResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;

    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.keywords ?? ""}`.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  // One flat list, because that is what the arrow keys move through.
  const rows = useMemo(
    () => [
      ...noteResults.map((entry) => ({ kind: "note" as const, entry })),
      ...documentResults.map((hit) => ({ kind: "document" as const, hit })),
      ...commandResults.map((command) => ({ kind: "command" as const, command })),
    ],
    [noteResults, documentResults, commandResults],
  );

  // Clamped rather than reset: typing narrows the list, and snapping the
  // selection back to the top on every keystroke fights the user's aim.
  const selected = Math.min(active, Math.max(0, rows.length - 1));

  const choose = useCallback(
    async (index: number) => {
      const row = rows[index];
      if (!row) return;

      onClose();
      if (row.kind === "note") {
        onOpenNote(row.entry.path);
      } else if (row.kind === "document") {
        onOpenDocument?.(row.hit.path, row.hit.page);
      } else {
        await row.command.run();
      }
    },
    [rows, onClose, onOpenNote, onOpenDocument],
  );

  // Keep the highlighted row in view when it moves past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => (rows.length === 0 ? 0 : (index + 1) % rows.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => (rows.length === 0 ? 0 : (index - 1 + rows.length) % rows.length));
        break;
      case "Enter":
        event.preventDefault();
        void choose(selected);
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] shadow-[var(--fl-shadow-lg)]"
      >
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="command-palette-list"
          aria-activedescendant={rows[selected] ? `palette-row-${selected}` : undefined}
          placeholder={
            documents.length > 0
              ? "Search notes and documents, or type a command…"
              : "Search notes, or type a command…"
          }
          aria-label="Search notes, documents and commands"
          className="w-full border-b border-[var(--fl-border)] bg-transparent px-4 py-3.5 text-[15px] text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-muted)]"
        />

        <ul
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          className="max-h-[52vh] overflow-y-auto p-1.5"
        >
          {rows.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-[var(--fl-muted)]">
              Nothing matches “{query}”.
            </li>
          )}

          {rows.map((row, index) => {
            const isActive = index === selected;
            const previous = rows[index - 1];
            const group = groupOf(row);
            const previousGroup = previous == null ? null : groupOf(previous);

            return (
              <li key={keyOf(row, index)}>
                {group !== previousGroup && (
                  <p className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[var(--fl-muted)]">
                    {group}
                  </p>
                )}

                <button
                  type="button"
                  id={`palette-row-${index}`}
                  role="option"
                  aria-selected={isActive}
                  data-active={isActive}
                  onMouseMove={() => setActive(index)}
                  onClick={() => void choose(index)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isActive ? "bg-[var(--fl-accent-soft)]" : "hover:bg-[var(--fl-elevated)]"
                  }`}
                >
                  <Glyph kind={row.kind} />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-[var(--fl-text)]">
                      {row.kind === "note"
                        ? row.entry.title
                        : row.kind === "document"
                          ? `${filename(row.hit.path)} · p. ${row.hit.page}`
                          : row.command.label}
                    </span>
                    <span className="block truncate text-[11.5px] text-[var(--fl-muted)]">
                      {row.kind === "note"
                        ? row.entry.path
                        : row.kind === "document"
                          ? // The sentence it was found in, not the path: the
                            // path is in the line above and the words are what
                            // tell you whether this is the passage you meant.
                            row.hit.snippet
                          : (row.command.hint ?? "")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center gap-4 border-t border-[var(--fl-border)] px-3.5 py-2 text-[11px] text-[var(--fl-muted)]">
          <Key>↑↓</Key> to move
          <Key>↵</Key> to open
          <Key>esc</Key> to close
        </footer>
      </div>
    </div>
  );
}

type Row =
  | { kind: "note"; entry: { id: string; path: string; title: string } }
  | { kind: "document"; hit: { path: string; page: number; snippet: string } }
  | { kind: "command"; command: Command };

function groupOf(row: Row): string {
  if (row.kind === "note") return "Notes";
  if (row.kind === "document") return "Documents";
  return row.command.group;
}

function keyOf(row: Row, index: number): string {
  if (row.kind === "note") return row.entry.id;
  if (row.kind === "document") return `${row.hit.path}:${row.hit.page}:${index}`;
  return row.command.id;
}

const filename = (path: string) => path.split("/").pop() ?? path;

function Key({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-1.5 py-0.5 font-sans text-[10.5px]">
        {children}
      </kbd>
    </span>
  );
}

function Glyph({ kind }: { kind: "note" | "document" | "command" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-[var(--fl-muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "note" ? (
        <>
          <path d="M3.25 2.75h6l3.5 3.5v7a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z" />
          <path d="M9 2.75v3.5h3.5" />
        </>
      ) : kind === "document" ? (
        // A page with lines of type on it: a document, as against a note,
        // which is the same outline with a folded corner.
        <>
          <rect x="2.75" y="2.75" width="10.5" height="10.5" rx="1.25" />
          <path d="M5.25 6h5.5M5.25 8.5h5.5M5.25 11h3" />
        </>
      ) : (
        <path d="M5.5 6 3 8l2.5 2M10.5 6 13 8l-2.5 2M9.25 4l-2.5 8" />
      )}
    </svg>
  );
}

/** Every file path in a tree, depth first. */
function filePaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.kind === "file") paths.push(node.path);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return paths;
}
