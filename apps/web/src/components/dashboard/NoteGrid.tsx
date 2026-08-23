"use client";

import Link from "next/link";
import type { IndexEntry } from "@/lib/library";
import { Snippet, formatWhen } from "./NoteList";
import type { SearchSnippet } from "@forkleaf/store";

/**
 * The note index as cards.
 *
 * The same entries as the list, given room to show the excerpt. Useful when
 * the titles in a repository are near-identical — a folder of dated meeting
 * notes, say — and the first line of prose is what actually tells them apart.
 */
export function NoteGrid({
  entries,
  editorHref,
  emptyMessage,
  snippets,
}: {
  entries: IndexEntry[];
  editorHref: (entry: IndexEntry) => string;
  emptyMessage: string;
  /** The matching line per note id, when a full-text search produced one. */
  snippets?: Map<string, SearchSnippet>;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--fl-border)] px-6 py-12 text-center text-sm text-[var(--fl-muted)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <Link
          key={entry.id}
          href={editorHref(entry)}
          className="flex flex-col rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4 transition hover:border-[var(--fl-border-strong)] hover:shadow-[var(--fl-shadow)]"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[var(--fl-text)]">
              {entry.title}
            </span>
            {entry.dirty && (
              <span className="shrink-0 rounded-full bg-[var(--fl-warn)]/12 px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--fl-warn)]">
                unpushed
              </span>
            )}
          </span>

          {snippets?.get(entry.id) ? (
            <Snippet
              snippet={snippets.get(entry.id)!}
              className="mt-1 line-clamp-3 min-h-[3.4em] !text-[12.5px]"
            />
          ) : (
            <span className="mt-1 line-clamp-3 min-h-[3.4em] text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
              {entry.excerpt || (entry.indexed ? "No text yet." : "Not read yet.")}
            </span>
          )}

          <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--fl-muted)]">
            {entry.folder && <span className="font-mono">{entry.folder}/</span>}
            {entry.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[var(--fl-accent)]">
                #{tag}
              </span>
            ))}
          </span>

          <span className="mt-2 flex items-center justify-between border-t border-[var(--fl-border)] pt-2 text-[11.5px] text-[var(--fl-muted)]">
            <span>{entry.indexed ? `${entry.words.toLocaleString()} words` : "not read yet"}</span>
            <span>{formatWhen(entry.updatedAt)}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
