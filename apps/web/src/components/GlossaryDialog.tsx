"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { GlossaryEntry } from "@/lib/glossary";

/**
 * Every term the notebook defines, A to Z.
 *
 * The same glossary the editor underlines terms from. Each definition opens
 * the note it is written in; a term defined in more than one note lists every
 * definition, because two notes disagreeing about what a word means is worth
 * seeing.
 */

export interface GlossaryDialogProps {
  onClose: () => void;
  entries: ReadonlyMap<string, readonly GlossaryEntry[]> | null;
  onOpen: (path: string, line: number) => void;
  underlining: boolean;
  onToggleUnderlining: () => void;
}

export function GlossaryDialog({
  onClose,
  entries,
  onOpen,
  underlining,
  onToggleUnderlining,
}: GlossaryDialogProps) {
  const [filter, setFilter] = useState("");

  const terms = useMemo(() => {
    if (!entries) return [];
    const wanted = filter.trim().toLowerCase();
    return [...entries.values()]
      .filter(
        (list) =>
          !wanted ||
          list[0]!.term.toLowerCase().includes(wanted) ||
          list.some((entry) => entry.definition.toLowerCase().includes(wanted)),
      )
      .sort((a, b) => a[0]!.term.localeCompare(b[0]!.term, undefined, { sensitivity: "base" }));
  }, [entries, filter]);

  return (
    <Dialog
      title="Glossary"
      subtitle="Every term your notes define, and where"
      onClose={onClose}
      wide
    >
      {!entries && (
        <p role="status" className="text-[13px] text-[var(--fl-muted)]">
          Reading your notes…
        </p>
      )}

      {entries && entries.size === 0 && (
        <div className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          <p className="text-[var(--fl-text)]">No terms defined yet.</p>
          <p className="mt-2 max-w-2xl">
            Write a definition the usual way —{" "}
            <code>**Idempotent** means running it twice changes nothing.</code> — or list{" "}
            <code>- Term: definition</code> lines under a heading called Glossary. The term is then
            underlined wherever it appears in any note, with the definition on hover.
          </p>
        </div>
      )}

      {entries && entries.size > 0 && (
        <div className="text-[13px] leading-relaxed">
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="glossary-filter"
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter terms"
              aria-label="Filter terms"
              className="fl-input min-w-0 flex-1"
              autoFocus
            />
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--fl-muted)]">
              <input
                type="checkbox"
                checked={underlining}
                onChange={onToggleUnderlining}
                className="accent-[var(--fl-accent)]"
              />
              Underline terms in notes
            </label>
          </div>

          <p className="mt-3 text-[var(--fl-muted)]">
            {terms.length} of {entries.size} term{entries.size === 1 ? "" : "s"}
          </p>

          <dl className="mt-2 divide-y divide-[var(--fl-border)]" data-testid="glossary-terms">
            {terms.map((list) => (
              <div key={list[0]!.key} className="py-2.5">
                <dt className="font-semibold text-[var(--fl-text)]">{list[0]!.term}</dt>
                {list.map((entry) => (
                  <dd key={`${entry.path}:${entry.line}`} className="mt-1">
                    <span className="text-[var(--fl-text)]">{entry.definition}</span>{" "}
                    <button
                      type="button"
                      onClick={() => onOpen(entry.path, entry.line)}
                      className="text-[12px] text-[var(--fl-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                    >
                      {entry.title}
                    </button>
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </div>
      )}
    </Dialog>
  );
}
