"use client";

import Link from "next/link";
import type { IndexEntry } from "@/lib/library";

/**
 * The indexed list of notes.
 *
 * Every row is a real index entry — title from the frontmatter or the first
 * heading, the tags, the word count, when it was last touched — rather than the
 * filename the sidebar shows. Rows that have not been read yet say so instead
 * of reporting zero words as if that were a fact.
 */
export function NoteList({
  entries,
  editorHref,
  emptyMessage,
}: {
  entries: IndexEntry[];
  editorHref: (entry: IndexEntry) => string;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--fl-border)] px-6 py-12 text-center text-sm text-[var(--fl-muted)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--fl-border)] overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)]">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Link
            href={editorHref(entry)}
            className="group flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--fl-elevated)] sm:px-5"
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[15px] font-medium text-[var(--fl-text)]">
                  {entry.title}
                </span>
                {entry.dirty && (
                  <span
                    title="Edited here, not pushed to GitHub yet"
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--fl-warn)]/12 px-2 py-0.5 text-[11px] font-medium text-[var(--fl-warn)]"
                  >
                    unpushed
                  </span>
                )}
                {entry.diagrams > 0 && (
                  <span className="rounded-full bg-[var(--fl-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--fl-accent)]">
                    {entry.diagrams} diagram{entry.diagrams === 1 ? "" : "s"}
                  </span>
                )}
              </span>

              {entry.excerpt && (
                <span className="mt-0.5 block truncate text-[13px] text-[var(--fl-muted)]">
                  {entry.excerpt}
                </span>
              )}

              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--fl-muted)]">
                <span className="font-mono text-[11.5px]">{entry.path}</span>
                {entry.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="text-[var(--fl-accent)]">
                    #{tag}
                  </span>
                ))}
              </span>
            </span>

            <span className="hidden shrink-0 flex-col items-end gap-0.5 text-[12px] text-[var(--fl-muted)] sm:flex">
              <span>
                {entry.indexed ? `${entry.words.toLocaleString()} words` : "not read yet"}
              </span>
              <span>{formatWhen(entry.updatedAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "3 minutes ago" up to a week, then a plain date. */
export function formatWhen(iso: string | null): string {
  if (!iso) return "—";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
