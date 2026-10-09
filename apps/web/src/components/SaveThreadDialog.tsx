"use client";

import { useState } from "react";
import type { NoteDiscussionDto } from "@forkleaf/github-client";
import { Dialog } from "@/components/Dialog";
import { CONVERSATION_FOLDER, messageCount, participants } from "@/lib/thread-note";

/**
 * Keeping a conversation as a note.
 *
 * The transcript is always written. A summary on top — what was decided, what
 * is left to do, what is still open — is offered only when the assistant is
 * set up, and is off until ticked: it sends the whole conversation to the
 * reader's model provider, and other people's words are not ours to send
 * anywhere without being asked.
 */
export function SaveThreadDialog({
  discussion,
  ai,
  onSave,
  onClose,
}: {
  discussion: NoteDiscussionDto;
  /** The assistant's provider, when one is set up. */
  ai: { name: string } | null;
  /** Writes the note. Resolves to a reason it could not, or null. */
  onSave: (withSummary: boolean) => Promise<string | null>;
  onClose: () => void;
}) {
  const [summarise, setSummarise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const count = messageCount(discussion);
  const people = participants(discussion);

  const save = async () => {
    setBusy(true);
    setFailure(null);
    const error = await onSave(summarise && ai !== null);
    setBusy(false);
    if (error) setFailure(error);
  };

  return (
    <Dialog title="Save as a note" subtitle={discussion.title} onClose={onClose}>
      <p className="text-[13px] leading-relaxed text-[var(--fl-text)]">
        {count} {count === 1 ? "message" : "messages"}
        {people.length ? ` from ${people.map((p) => `@${p}`).join(", ")}` : ""} will be written to a
        new note in <code className="text-[12px]">{CONVERSATION_FOLDER}/</code>, in order, with who
        said what and a link back to the discussion.
      </p>

      {ai && (
        <label className="mt-4 flex items-start gap-2 text-[13px] text-[var(--fl-text)]">
          <input
            type="checkbox"
            checked={summarise}
            onChange={(event) => setSummarise(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Add a summary — decisions, to-dos and open questions — written by {ai.name}
            <span className="mt-0.5 block text-[12px] text-[var(--fl-muted)]">
              Sends this conversation to {ai.name} with your key. It appears in Receipts.
            </span>
          </span>
        </label>
      )}

      {failure && (
        <p role="alert" className="mt-3 text-[12px] text-[var(--fl-danger)]">
          {failure}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="fl-btn fl-btn-ghost">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="fl-btn fl-btn-primary disabled:opacity-50"
        >
          {busy ? (summarise && ai ? "Writing the summary…" : "Saving…") : "Save note"}
        </button>
      </div>
    </Dialog>
  );
}
