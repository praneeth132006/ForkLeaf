"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { relativesOf, type LineageNote, type Relative } from "@/lib/lineage";

/**
 * This note's family: the notes it shares passages with, and the ones it is
 * linked with. What was copied between notes is written nowhere else.
 */

export interface LineageDialogProps {
  note: LineageNote;
  loadNotes: () => Promise<LineageNote[]>;
  /** Titles of the notes this one links to, and the ones linking here. */
  linksTo: readonly { path: string; title: string }[];
  linkedFrom: readonly { path: string; title: string }[];
  onOpenNote: (path: string) => void;
  onClose: () => void;
}

type Load = { kind: "reading" } | { kind: "ready"; relatives: Relative[] } | { kind: "error" };

/**
 * What the dates say, and no more: a note written earlier is where a shared
 * passage usually came from, but text can be copied into an old note too, so
 * the direction is never claimed.
 */
const RELATION: Record<Relative["relation"], string> = {
  parent: "Written before this one",
  child: "Written after this one",
  sibling: "Shares passages",
};

export function LineageDialog({
  note,
  loadNotes,
  linksTo,
  linkedFrom,
  onOpenNote,
  onClose,
}: LineageDialogProps) {
  const [load, setLoad] = useState<Load>({ kind: "reading" });

  useEffect(() => {
    let live = true;
    loadNotes().then(
      (notes) => live && setLoad({ kind: "ready", relatives: relativesOf(note, notes) }),
      () => live && setLoad({ kind: "error" }),
    );
    return () => {
      live = false;
    };
    // Once per opening: the notebook does not change underneath the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noteButton = (path: string, title: string) => (
    <button
      type="button"
      onClick={() => onOpenNote(path)}
      className="font-medium text-[var(--fl-text)] underline decoration-dotted underline-offset-2 hover:text-[var(--fl-accent)]"
    >
      {title}
    </button>
  );

  return (
    <Dialog title="This note's family" subtitle={note.title} onClose={onClose} wide>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto text-[13px]">
        <section>
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--fl-muted)]">
            Shares passages with
          </h3>
          {load.kind === "reading" && (
            <p role="status" className="text-[var(--fl-muted)]">
              Comparing with every note…
            </p>
          )}
          {load.kind === "error" && (
            <p role="alert" className="text-[var(--fl-danger)]">
              The notebook could not be read.
            </p>
          )}
          {load.kind === "ready" && load.relatives.length === 0 && (
            <p className="text-[var(--fl-muted)]">
              No other note carries a passage of this one — nothing was copied in or out.
            </p>
          )}
          {load.kind === "ready" && load.relatives.length > 0 && (
            <ul className="grid gap-2">
              {load.relatives.map((relative) => (
                <li
                  key={relative.path}
                  data-testid="relative"
                  className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3"
                >
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    {noteButton(relative.path, relative.title)}
                    <span className="text-[12px] text-[var(--fl-muted)]">
                      {RELATION[relative.relation]} · {relative.sharedWords} words (
                      {Math.round(relative.share * 100)}% of this note)
                    </span>
                  </p>
                  {relative.passages.map((passage) => (
                    <p
                      key={passage}
                      className="mt-1 border-l-2 border-[var(--fl-accent)] pl-2 text-[12.5px] italic text-[var(--fl-muted)]"
                    >
                      {passage}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--fl-muted)]">
              Links to
            </h3>
            {linksTo.length === 0 ? (
              <p className="text-[var(--fl-muted)]">No links out.</p>
            ) : (
              <ul className="grid gap-1">
                {linksTo.map((link) => (
                  <li key={link.path}>{noteButton(link.path, link.title)}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--fl-muted)]">
              Linked from
            </h3>
            {linkedFrom.length === 0 ? (
              <p className="text-[var(--fl-muted)]">Nothing links here.</p>
            ) : (
              <ul className="grid gap-1">
                {linkedFrom.map((link) => (
                  <li key={link.path}>{noteButton(link.path, link.title)}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
