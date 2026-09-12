"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  countByKind,
  filterMind,
  mindItems,
  type MindFilter,
  type MindItem,
  type MindSource,
} from "@/lib/mind";

/**
 * Everything saved from outside, laid out as what it is.
 *
 * Quotes read as quotes, pictures show the picture, links show where they
 * go — newest first, with a search that looks inside all of them. Pictures
 * come through ForkLeaf's own image proxy, so opening this does not tell every
 * site in the inbox that somebody looked.
 */

export interface MindDialogProps {
  onClose: () => void;
  loadNotes: () => Promise<MindSource[]>;
  onOpenNote: (path: string) => void;
  onCopyBookmarklet: () => void;
}

type Load =
  { kind: "reading" } | { kind: "done"; items: MindItem[] } | { kind: "error"; message: string };

const FILTERS: { value: MindFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "quote", label: "Quotes" },
  { value: "link", label: "Links" },
  { value: "page", label: "Notes" },
  { value: "image", label: "Images" },
];

export const proxiedImage = (url: string) => `/api/link-image?url=${encodeURIComponent(url)}`;

export function MindDialog({ onClose, loadNotes, onOpenNote, onCopyBookmarklet }: MindDialogProps) {
  const [load, setLoad] = useState<Load>({ kind: "reading" });
  const [filter, setFilter] = useState<MindFilter>("all");
  const [query, setQuery] = useState("");
  const [brokenImages, setBrokenImages] = useState<ReadonlySet<string>>(new Set());

  const loadRef = useRef(loadNotes);
  useEffect(() => {
    loadRef.current = loadNotes;
  }, [loadNotes]);

  useEffect(() => {
    let live = true;
    loadRef.current().then(
      (notes) => live && setLoad({ kind: "done", items: mindItems(notes) }),
      (error: unknown) =>
        live &&
        setLoad({
          kind: "error",
          message: error instanceof Error ? error.message : "Your inbox could not be read.",
        }),
    );
    return () => {
      live = false;
    };
  }, []);

  const items = useMemo(() => (load.kind === "done" ? load.items : []), [load]);
  const counts = useMemo(() => countByKind(items), [items]);
  const shown = useMemo(() => filterMind(items, filter, query), [items, filter, query]);

  return (
    <Dialog
      title="Everything you saved"
      subtitle="Pages, quotes, links and pictures kept in inbox/, newest first"
      onClose={onClose}
      wide
      steady
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
        {load.kind === "reading" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Reading your inbox…
          </p>
        )}
        {load.kind === "error" && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {load.message}
          </p>
        )}

        {load.kind === "done" && items.length === 0 && (
          <div className="max-w-xl leading-relaxed text-[var(--fl-muted)]">
            <p className="text-[var(--fl-text)]">Nothing saved yet.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>On a phone, install ForkLeaf and use Share → ForkLeaf.</li>
              <li>In a browser, use the Save to ForkLeaf extension or bookmarklet.</li>
              <li>Everything lands in inbox/ as an ordinary note, and shows up here.</li>
            </ul>
            <button
              type="button"
              onClick={onCopyBookmarklet}
              className="fl-btn fl-btn-primary mt-3"
            >
              Copy the bookmarklet
            </button>
          </div>
        )}

        {load.kind === "done" && items.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Kind" className="flex flex-wrap gap-1">
                {FILTERS.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    aria-pressed={filter === entry.value}
                    onClick={() => setFilter(entry.value)}
                    className={`rounded-full border px-2.5 py-0.5 text-[12px] ${
                      filter === entry.value
                        ? "border-transparent bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                        : "border-[var(--fl-border)] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                    }`}
                  >
                    {entry.label} <span className="opacity-70">{counts[entry.value]}</span>
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search what you saved"
                aria-label="Search what you saved"
                className="ml-auto w-56 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1 text-[12.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />
            </div>

            {shown.length === 0 && (
              <p className="text-[var(--fl-muted)]">Nothing saved matches that.</p>
            )}

            <ul className="min-h-0 flex-1 columns-[14rem] gap-3 overflow-y-auto">
              {shown.map((item) => (
                <li
                  key={item.path}
                  className="mb-3 break-inside-avoid rounded-xl border border-[var(--fl-border)] bg-[var(--fl-elevated)]"
                >
                  <button
                    type="button"
                    onClick={() => onOpenNote(item.path)}
                    aria-label={`Open ${item.title}`}
                    className="block w-full overflow-hidden rounded-t-xl text-left"
                  >
                    {item.image && !brokenImages.has(item.image) && (
                      // eslint-disable-next-line @next/next/no-img-element -- proxied, arbitrary size
                      <img
                        src={proxiedImage(item.image)}
                        alt=""
                        loading="lazy"
                        onError={() =>
                          setBrokenImages((current) => new Set(current).add(item.image!))
                        }
                        className="block max-h-64 w-full object-cover"
                      />
                    )}
                    <span className="block p-3">
                      {item.kind === "quote" && item.excerpt ? (
                        <span className="block border-l-2 border-[var(--fl-accent)] pl-2.5 font-serif text-[14px] italic leading-snug text-[var(--fl-text)]">
                          {item.excerpt}
                        </span>
                      ) : (
                        item.excerpt &&
                        item.excerpt !== item.title && (
                          <span className="block text-[12.5px] leading-snug text-[var(--fl-muted)]">
                            {item.excerpt}
                          </span>
                        )
                      )}
                      <span className="mt-2 block text-[13px] font-medium leading-snug text-[var(--fl-text)]">
                        {item.title}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2 px-3 pb-2.5 text-[11px] text-[var(--fl-muted)]">
                    <span className="min-w-0 flex-1 truncate">
                      {[item.site, item.saved].filter(Boolean).join(" · ")}
                    </span>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                      >
                        Original
                      </a>
                    )}
                  </div>
                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-3 pb-2.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-[var(--fl-surface)] px-1.5 py-0.5 text-[10.5px] text-[var(--fl-muted)]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}
