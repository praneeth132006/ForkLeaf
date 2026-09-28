"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  RECEIPTS_KEY,
  byDay,
  clearReceipts,
  notesSent,
  readReceipts,
  type Receipt,
} from "@/lib/ai-receipts";

/**
 * What the AI has read: every send from this browser, with where it went.
 *
 * The one audit trail a notes app that talks to models directly can offer,
 * and nobody else can: there is no server in the path to keep one.
 */

export interface ReceiptsDialogProps {
  onClose: () => void;
  onOpenNote?: (path: string) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function time(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? at
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ReceiptsDialog({ onClose, onOpenNote }: ReceiptsDialogProps) {
  const [receipts, setReceipts] = useState<Receipt[]>(readReceipts);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const refresh = () => setReceipts(readReceipts());
    window.addEventListener(RECEIPTS_KEY, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(RECEIPTS_KEY, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const hosts = [...new Set(receipts.map((receipt) => receipt.host))];
  const notes = notesSent(receipts);

  return (
    <Dialog
      title="What the AI has read"
      subtitle="Every time this browser sent a note or a question to a model"
      onClose={onClose}
      wide
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-[13px]">
        {receipts.length === 0 ? (
          <p className="text-[var(--fl-muted)]">
            Nothing has been sent from this browser. When the assistant or the flashcards send a
            note to a model, a receipt appears here: when, to which provider, which note and how
            much of it.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3">
              <p className="font-medium text-[var(--fl-text)]">
                {plural(receipts.length, "send")} to {hosts.join(", ")}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--fl-muted)]">
                {notes.length > 0
                  ? `Notes sent most: ${notes
                      .slice(0, 3)
                      .map((entry) => `${entry.title} (${entry.count})`)
                      .join(", ")}`
                  : "No note was sent with any of them."}
              </p>
            </div>

            {byDay(receipts).map((group) => (
              <section key={group.day}>
                <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--fl-muted)]">
                  {group.day}
                </h3>
                <ul className="divide-y divide-[var(--fl-border)] rounded-xl border border-[var(--fl-border)]">
                  {group.receipts.map((receipt, index) => (
                    <li key={`${receipt.at}-${index}`} className="px-3 py-2" data-testid="receipt">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[var(--fl-text)]">
                        <span className="tabular-nums text-[var(--fl-muted)]">
                          {time(receipt.at)}
                        </span>
                        <span className="font-medium">{receipt.purpose}</span>
                        <span>
                          → {receipt.provider} · {receipt.model} ·{" "}
                          <code className="text-[12px]">{receipt.host}</code>
                        </span>
                      </p>
                      <p className="mt-0.5 text-[12px] text-[var(--fl-muted)]">
                        {receipt.note ? (
                          <>
                            With{" "}
                            {receipt.note.path && onOpenNote ? (
                              <button
                                type="button"
                                onClick={() => onOpenNote(receipt.note!.path!)}
                                className="underline decoration-dotted underline-offset-2 hover:text-[var(--fl-text)]"
                              >
                                {receipt.note.title}
                              </button>
                            ) : (
                              receipt.note.title
                            )}{" "}
                            ({receipt.note.characters.toLocaleString()} characters)
                          </>
                        ) : (
                          "No note sent"
                        )}
                        {receipt.question ? ` · “${receipt.question}”` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--fl-muted)]">
          <span className="flex-1">
            Kept on this device only, the last 500 sends. The note&apos;s text is never kept here.
          </span>
          {receipts.length > 0 &&
            (confirming ? (
              <>
                <span>Clear every receipt?</span>
                <button
                  type="button"
                  onClick={() => {
                    clearReceipts();
                    setReceipts([]);
                    setConfirming(false);
                  }}
                  className="rounded-lg bg-[var(--fl-danger)] px-2.5 py-1 font-medium text-white"
                >
                  Clear
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="px-2 py-1">
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-lg border border-[var(--fl-border)] px-2.5 py-1 hover:text-[var(--fl-text)]"
              >
                Clear receipts
              </button>
            ))}
        </div>
      </div>
    </Dialog>
  );
}
