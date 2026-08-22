"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { allFolderPaths, buildNoteTree, type IndexEntry, type NoteFolder } from "@/lib/library";
import { formatWhen } from "./NoteList";

/**
 * The note index as the repository is actually laid out.
 *
 * The flat list answers "what did I touch last"; this answers "what is in
 * here". For a documentation repository — where the folder names carry as much
 * meaning as the filenames — the flat list was the only view available, and it
 * turned a structured tree of 155 notes into 155 indistinguishable rows.
 */
export function NoteTree({
  entries,
  editorHref,
  emptyMessage,
  /** Set while a search is running: every branch opens so matches are visible. */
  expandAll = false,
}: {
  entries: IndexEntry[];
  editorHref: (entry: IndexEntry) => string;
  emptyMessage: string;
  expandAll?: boolean;
}) {
  const root = useMemo(() => buildNoteTree(entries), [entries]);

  // Top-level folders start open, deeper ones closed: enough to show the shape
  // of the repository without unrolling a hundred rows on arrival.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const openByDefault = useMemo(() => {
    if (expandAll) return new Set(allFolderPaths(root));
    return new Set(root.folders.map((folder) => folder.path));
  }, [root, expandAll]);

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--fl-border)] px-6 py-12 text-center text-sm text-[var(--fl-muted)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] py-1">
      <Branch
        node={root}
        depth={0}
        collapsed={collapsed}
        openByDefault={openByDefault}
        onToggle={toggle}
        editorHref={editorHref}
      />
    </div>
  );
}

function Branch({
  node,
  depth,
  collapsed,
  openByDefault,
  onToggle,
  editorHref,
}: {
  node: NoteFolder;
  depth: number;
  collapsed: Set<string>;
  openByDefault: Set<string>;
  onToggle: (path: string) => void;
  editorHref: (entry: IndexEntry) => string;
}) {
  return (
    <ul className={depth === 0 ? "" : "border-l border-[var(--fl-border)]"}>
      {node.folders.map((folder) => {
        // The set holds what the reader has *changed*, so a folder open by
        // default is closed once its path is in there, and vice versa.
        const flipped = collapsed.has(folder.path);
        const open = openByDefault.has(folder.path) ? !flipped : flipped;

        return (
          <li key={folder.path}>
            <button
              type="button"
              onClick={() => onToggle(folder.path)}
              aria-expanded={open}
              // The visible label is the folder's own name, which on its own
              // does not say what the button does.
              aria-label={`${open ? "Collapse" : "Expand"} ${folder.path}`}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--fl-elevated)]"
              style={{ paddingLeft: `${12 + depth * 14}px` }}
            >
              <span
                aria-hidden
                className={`text-[10px] text-[var(--fl-muted)] transition-transform ${
                  open ? "rotate-90" : ""
                }`}
              >
                ▶
              </span>
              <FolderGlyph open={open} />
              <span className="truncate text-[13.5px] font-medium text-[var(--fl-text)]">
                {folder.name}
              </span>
              <span className="tabular-nums text-[11.5px] text-[var(--fl-muted)]">
                {folder.count}
              </span>
            </button>

            {open && (
              <Branch
                node={folder}
                depth={depth + 1}
                collapsed={collapsed}
                openByDefault={openByDefault}
                onToggle={onToggle}
                editorHref={editorHref}
              />
            )}
          </li>
        );
      })}

      {node.notes.map((entry) => (
        <li key={entry.id}>
          <Link
            href={editorHref(entry)}
            className="flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-[var(--fl-elevated)]"
            style={{ paddingLeft: `${26 + depth * 14}px` }}
          >
            <NoteGlyph />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--fl-text)]">
              {entry.title}
            </span>

            {entry.dirty && (
              <span
                title="Edited here, not pushed to GitHub yet"
                className="shrink-0 rounded-full bg-[var(--fl-warn)]/12 px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--fl-warn)]"
              >
                unpushed
              </span>
            )}
            {entry.diagrams > 0 && (
              <span className="shrink-0 rounded-full bg-[var(--fl-accent-soft)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--fl-accent)]">
                {entry.diagrams} ◇
              </span>
            )}

            <span className="hidden shrink-0 text-[11.5px] text-[var(--fl-muted)] sm:inline">
              {entry.indexed ? `${entry.words.toLocaleString()} words` : "not read yet"}
            </span>
            <span className="hidden w-24 shrink-0 text-right text-[11.5px] text-[var(--fl-muted)] md:inline">
              {formatWhen(entry.updatedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FolderGlyph({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[var(--fl-muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      {open ? (
        <path d="M1.75 12.75V4.25a1 1 0 0 1 1-1h3l1.5 1.5h5a1 1 0 0 1 1 1v1.5M1.75 12.75h11l1.5-5.5h-11z" />
      ) : (
        <path d="M1.75 4.25a1 1 0 0 1 1-1h3l1.5 1.5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1z" />
      )}
    </svg>
  );
}

function NoteGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[var(--fl-muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <path d="M3.75 1.75h5l3.5 3.5v9h-8.5zM8.75 1.75v3.5h3.5M5.5 8.5h5M5.5 11h3" />
    </svg>
  );
}
