"use client";

import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { Dialog } from "./Dialog";

/**
 * An optional "where does this go" choice, shown above the name field.
 *
 * Creating a folder used to put it wherever the dialog had been opened from,
 * and the only way to say otherwise was to type the parent into the name with
 * a slash — which you had to know, and had to spell exactly as the existing
 * folder is spelled, or you silently got a second folder beside it.
 */
export interface PromptParentChoice {
  label: string;
  /** Folder paths in tree order. `""` is the repository root. */
  options: readonly string[];
  /** The one selected on open. */
  initial: string;
  /** What `""` is called, since a blank option reads as a missing one. */
  rootLabel: string;
}

export interface PromptRequest {
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  /** Renders a destructive confirmation instead of a text input. */
  destructive?: boolean;
  body?: string;
  parent?: PromptParentChoice;
  onConfirm: (value: string, parent: string) => void | Promise<void>;
}

export interface PromptDialogProps {
  request: PromptRequest;
  onClose: () => void;
}

/**
 * Replaces `window.prompt` / `window.confirm`.
 *
 * The native dialogs cannot be styled, ignore the app's dark theme, are
 * suppressed entirely in some embedded contexts, and block the main thread —
 * which would stall the autosave loop mid-keystroke.
 */
export function PromptDialog({ request, onClose }: PromptDialogProps) {
  const [value, setValue] = useState(request.initialValue ?? "");
  const [parent, setParent] = useState(request.parent?.initial ?? "");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // A ref, not `busy`, because `setBusy(true)` does not take effect until the
  // next render — two submits dispatched in the same tick would both read
  // `busy === false` and both run, which on a connected repository is two
  // commits for one folder.
  const running = useRef(false);

  /**
   * Enter, made to mean Create.
   *
   * A form with a submit button submits on Enter on its own, and this dialog
   * has one — but "on its own" is doing a lot of work there. Implicit
   * submission is skipped whenever the default button is disabled, and this
   * one is disabled until the name is non-empty, so an Enter pressed in the
   * same frame as the last keystroke could find a disabled button and be
   * dropped. Asking the form directly removes the question, and the
   * `preventDefault` keeps the browser from also submitting and running the
   * whole thing twice.
   */
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (running.current) return;
    if (!request.destructive && !value.trim()) return;

    running.current = true;
    setBusy(true);
    try {
      // Execute the confirmation callback with the trimmed input value
      await request.onConfirm(value.trim(), parent);
      // Close the dialog only on success — errors leave it open for retry
      onClose();
    } catch (error: unknown) {
      // Surface the error so the user knows the action failed
      console.error("[forkleaf] Prompt action failed:", error);
    } finally {
      // Always re-enable the form regardless of success or failure
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog title={request.title} onClose={onClose}>
      <form ref={formRef} onSubmit={submit}>
        {request.body && (
          <p className="mb-3 text-sm leading-relaxed text-[var(--fl-muted)]">{request.body}</p>
        )}

        {request.parent && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
              {request.parent.label}
            </span>
            <select
              value={parent}
              onChange={(event) => setParent(event.target.value)}
              className="w-full rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            >
              {request.parent.options.map((folder) => (
                <option key={folder} value={folder}>
                  {folder === ""
                    ? request.parent!.rootLabel
                    : `${"\u00a0\u00a0".repeat(folder.split("/").length - 1)}${folder.split("/").pop()}`}
                </option>
              ))}
            </select>
          </label>
        )}

        {!request.destructive && (
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
              {request.label}
            </span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={submitOnEnter}
              // A real attribute, unlike React's `autoFocus`, so `Dialog` can
              // find it and put the cursor here rather than on Close.
              data-autofocus
              // Select the existing text so renaming replaces rather than appends.
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-sm text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            />
            {request.parent && value.includes("/") && (
              <span className="mt-1.5 block text-[12px] text-[var(--fl-muted)]">
                Creates{" "}
                <strong className="font-medium text-[var(--fl-text)]">
                  {[parent, value.trim()].filter(Boolean).join("/")}
                </strong>
                , one folder per slash.
              </span>
            )}
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-autofocus={request.destructive ? "" : undefined}
            disabled={busy || (!request.destructive && !value.trim())}
            className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
              request.destructive
                ? "bg-[var(--fl-danger)] text-white hover:opacity-90"
                : "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)] hover:opacity-90"
            }`}
          >
            {busy ? "Working…" : (request.confirmLabel ?? "Save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
