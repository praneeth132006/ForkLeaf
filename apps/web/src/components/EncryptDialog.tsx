"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { passphraseAdvice } from "@/lib/encryption";

/**
 * Choosing a passphrase for a note, with the one warning that matters.
 *
 * There is no "forgot passphrase" for an encrypted note — nobody, including
 * ForkLeaf, holds a copy. So the passphrase is typed twice, and encrypting
 * waits until the person has ticked that they understand.
 */

export interface EncryptDialogProps {
  noteTitle: string;
  notePath: string;
  onEncrypt: (passphrase: string) => Promise<void>;
  onClose: () => void;
}

const field =
  "w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]";

export function EncryptDialog({ noteTitle, notePath, onEncrypt, onClose }: EncryptDialogProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const advice = passphrase ? passphraseAdvice(passphrase) : null;
  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const ready = passphrase.length > 0 && confirm === passphrase && understood && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      await onEncrypt(passphrase);
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "The note could not be encrypted.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Encrypt this note"
      subtitle="Only someone with the passphrase can read it — here, on GitHub, anywhere"
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3 text-[13px]"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="leading-relaxed text-[var(--fl-muted)]">
          <span className="font-medium text-[var(--fl-text)]">{noteTitle}</span> — its words, title
          and tags are sealed. The filename,{" "}
          <code className="text-[var(--fl-text)]">{notePath}</code>, is not; rename the note first
          if the name itself is private.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
            Passphrase
          </span>
          <input
            type={show ? "text" : "password"}
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="new-password"
            className={field}
          />
        </label>
        {advice && <p className="-mt-2 text-[12px] text-[var(--fl-muted)]">{advice}</p>}

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
            Type it again
          </span>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            className={field}
          />
        </label>
        {mismatch && (
          <p className="-mt-2 text-[12px] text-[var(--fl-danger)]">The two do not match yet.</p>
        )}

        <label className="flex items-center gap-2 text-[12.5px] text-[var(--fl-muted)]">
          <input
            type="checkbox"
            checked={show}
            onChange={(event) => setShow(event.target.checked)}
            className="accent-[var(--fl-accent)]"
          />
          Show the passphrase
        </label>

        <label className="flex items-start gap-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-2.5 text-[12.5px] leading-relaxed text-[var(--fl-text)]">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
            className="mt-[3px] accent-[var(--fl-accent)]"
          />
          I understand that if I forget this passphrase, nobody can recover the note — not me, not
          ForkLeaf.
        </label>

        {problem && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="fl-btn fl-btn-ghost">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready}
            className="fl-btn fl-btn-primary disabled:opacity-50"
          >
            {busy ? "Encrypting…" : "Encrypt"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
