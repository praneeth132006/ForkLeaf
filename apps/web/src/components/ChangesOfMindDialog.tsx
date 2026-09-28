"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { Reversal } from "@/lib/changes-of-mind";

/**
 * The reversals in this session's edits to a note, each with room for why.
 *
 * A reason is written into the note itself, under "Why I changed my mind", so
 * it travels with the note to every tool and every clone. "Not a change of
 * mind" puts one away without writing anything.
 */

export interface ChangesOfMindDialogProps {
  reversals: readonly Reversal[];
  onRecord: (reversal: Reversal, reason: string) => void;
  onDismiss: (reversal: Reversal) => void;
  onClose: () => void;
}

export function ChangesOfMindDialog({
  reversals,
  onRecord,
  onDismiss,
  onClose,
}: ChangesOfMindDialogProps) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const keyOf = (reversal: Reversal) => `${reversal.before}\n${reversal.after}`;

  return (
    <Dialog
      title="Why did you change your mind?"
      subtitle="Edits in this session that reverse what the note said. The reason is the part git cannot keep."
      onClose={onClose}
      wide
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-[13px]">
        {reversals.length === 0 && (
          <p className="text-[var(--fl-muted)]">
            Nothing left to explain. Every reason is recorded.
          </p>
        )}
        {reversals.map((reversal) => {
          const key = keyOf(reversal);
          const reason = reasons[key] ?? "";
          return (
            <form
              key={key}
              data-testid="reversal"
              className="grid gap-2 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (reason.trim()) onRecord(reversal, reason);
              }}
            >
              <p className="text-[var(--fl-muted)] line-through decoration-[var(--fl-danger)]/60">
                {reversal.before}
              </p>
              <p className="text-[var(--fl-text)]">{reversal.after}</p>
              <label className="grid gap-1">
                <span className="text-[11.5px] text-[var(--fl-muted)]">
                  Why “{reversal.from || "…"}” became “{reversal.to || "…"}”
                </span>
                <input
                  value={reason}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [key]: event.target.value }))
                  }
                  aria-label={`Why: ${reversal.after}`}
                  placeholder="What changed? One line is enough."
                  className="fl-input w-full"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!reason.trim()}
                  className="fl-btn fl-btn-primary disabled:opacity-50"
                >
                  Record the reason
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(reversal)}
                  className="rounded-lg px-2.5 py-1 text-[12.5px] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                >
                  Not a change of mind
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </Dialog>
  );
}
