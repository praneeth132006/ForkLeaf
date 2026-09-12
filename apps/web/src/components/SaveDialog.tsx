"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { INBOX_FOLDER, siteOf, titleFor, type SaveRequest } from "@/lib/inbox";

/**
 * "Save this to your notebook?" — asked, every time.
 *
 * The address that brings a page here can be written into a link on any
 * website, so arriving at it is not the same as asking for it. Nothing is
 * written until the person has seen what will be and pressed Save. Save is
 * where focus starts, so from the share sheet it is still one tap.
 */

export interface SaveDialogProps {
  request: SaveRequest;
  /** Writes the note; resolves once it exists. */
  onSave: (request: SaveRequest) => Promise<void>;
  onClose: () => void;
  /** A note already saved from the same address, when there is one. */
  existing: { path: string; title: string } | null;
  onOpenExisting: (path: string) => void;
}

const KIND_LABEL: Record<SaveRequest["kind"], string> = {
  page: "Note",
  quote: "Quote",
  image: "Image",
  link: "Link",
};

export function SaveDialog({
  request,
  onSave,
  onClose,
  existing,
  onOpenExisting,
}: SaveDialogProps) {
  const [title, setTitle] = useState(titleFor(request));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const site = siteOf(request.url);

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await onSave({ ...request, title: title.trim() || titleFor(request) });
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "It could not be saved.");
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Save to your notebook?"
      subtitle={`A new note in ${INBOX_FOLDER}/ — nothing is saved until you press Save`}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3 text-[13px]"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
            {KIND_LABEL[request.kind]} title
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={300}
            className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
          />
        </label>

        {request.url && (
          <p className="truncate text-[12px] text-[var(--fl-muted)]" title={request.url}>
            From <span className="text-[var(--fl-text)]">{site}</span> — {request.url}
          </p>
        )}

        {request.text && (
          <blockquote className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 border-[var(--fl-accent)] bg-[var(--fl-elevated)] px-3 py-2 text-[12.5px] text-[var(--fl-text)]">
            {request.text}
          </blockquote>
        )}

        {existing && (
          <p className="text-[12px] text-[var(--fl-muted)]">
            You saved this already, as{" "}
            <button
              type="button"
              onClick={() => onOpenExisting(existing.path)}
              className="text-[var(--fl-accent)] underline underline-offset-2"
            >
              {existing.title}
            </button>
            .
          </p>
        )}

        {problem && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="fl-btn fl-btn-ghost">
            Don&rsquo;t save
          </button>
          <button
            type="submit"
            data-autofocus
            disabled={saving}
            className="fl-btn fl-btn-primary disabled:opacity-60"
          >
            {saving ? "Saving…" : existing ? "Save another copy" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
