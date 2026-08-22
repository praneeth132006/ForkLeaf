"use client";

import type { ReactNode } from "react";
import { directCount, folderTrail, subfolders, type IndexEntry } from "@/lib/library";

/**
 * Folder and tag navigation for the note index.
 *
 * The dashboard used to render one chip per folder in the repository and one
 * per tag, all at once, in a single wrapped row. On a notebook of a dozen notes
 * that reads as a friendly set of shortcuts. On a real repository — 155 notes
 * across a hundred nested folders — it became a screenful of near-identical
 * pills above the list, so finding a folder in the filter was harder than
 * finding the note in the list underneath it.
 *
 * So the folders are browsed one level at a time: a breadcrumb of where you
 * are, and chips for the folders directly inside it. The number of choices on
 * screen stays roughly constant no matter how large the repository grows, and
 * the path back out is always visible.
 */

export function FolderNav({
  entries,
  folder,
  onFolder,
  tags,
  tag,
  onTag,
  showAllTags,
  onToggleTags,
}: {
  entries: IndexEntry[];
  folder: string | null;
  onFolder: (next: string | null) => void;
  tags: { tag: string; count: number }[];
  tag: string | null;
  onTag: (next: string | null) => void;
  showAllTags: boolean;
  onToggleTags: () => void;
}) {
  const children = subfolders(entries, folder);
  const trail = folderTrail(folder);
  const here = directCount(entries, folder);

  const visibleTags = showAllTags ? tags : tags.slice(0, 8);
  const hiddenTags = tags.length - visibleTags.length;

  // A flat notebook with no tags has nothing to navigate; a breadcrumb reading
  // "All notes" and nothing else is furniture, not navigation.
  if (folder === null && children.length === 0 && tags.length === 0) return null;

  return (
    <div className="mb-4 space-y-2.5">
      {/* ── Where you are ──────────────────────────────────────────────── */}
      <nav aria-label="Folder" className="flex flex-wrap items-center gap-1 text-[13px]">
        <Crumb active={folder === null} onClick={() => onFolder(null)}>
          All notes
        </Crumb>

        {trail.map((step, index) => (
          <span key={step.path} className="flex items-center gap-1">
            <span aria-hidden className="text-[var(--fl-muted)]">
              /
            </span>
            <Crumb active={index === trail.length - 1} onClick={() => onFolder(step.path)}>
              {step.name}
            </Crumb>
          </span>
        ))}
      </nav>

      {/* ── Where you can go ───────────────────────────────────────────── */}
      {children.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {children.map((child) => (
            <Chip key={child.path} onClick={() => onFolder(child.path)}>
              <span className="text-[var(--fl-muted)]" aria-hidden>
                ▸
              </span>{" "}
              {child.name}
              <Count>{child.count}</Count>
            </Chip>
          ))}

          {/* Only worth saying when some notes are in this folder and some are
              further down; otherwise the counts already tell the story. */}
          {here > 0 && (
            <span className="ml-1 text-[12px] text-[var(--fl-muted)]">
              {here} note{here === 1 ? "" : "s"} directly here
            </span>
          )}
        </div>
      )}

      {/* ── Tags ───────────────────────────────────────────────────────── */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleTags.map((item) => (
            <Chip
              key={item.tag}
              active={tag === item.tag}
              onClick={() => onTag(tag === item.tag ? null : item.tag)}
            >
              #{item.tag}
              <Count>{item.count}</Count>
            </Chip>
          ))}

          {(hiddenTags > 0 || showAllTags) && (
            <button
              type="button"
              onClick={onToggleTags}
              className="rounded-full px-2 py-1 text-[12.5px] text-[var(--fl-muted)] underline-offset-2 transition hover:text-[var(--fl-text)] hover:underline"
            >
              {showAllTags ? "Fewer tags" : `${hiddenTags} more tag${hiddenTags === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Crumb({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded px-1.5 py-0.5 transition ${
        active
          ? "font-medium text-[var(--fl-text)]"
          : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] transition ${
        active
          ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]"
          : "border-[var(--fl-border)] text-[var(--fl-muted)] hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: ReactNode }) {
  return <span className="tabular-nums text-[11px] opacity-70">{children}</span>;
}
