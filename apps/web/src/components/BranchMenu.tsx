"use client";

import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@forkleaf/types";
import { sanitizeBranchName } from "@/lib/branch-name";
import { createBranch, listBranches, type BranchSummaryDto } from "@/lib/gateway";

export interface BranchMenuProps {
  workspace: Workspace;
  onSwitch: (branch: string) => void | Promise<void>;
}

/**
 * Which branch the notes are being written to, and a way to change it.
 *
 * The branch was previously fixed to whatever the repository's default was when
 * the workspace was connected, with no way to see or change it. That is fine
 * until you want to draft documentation without committing straight to `main`,
 * which is most of the time in a repository anyone else reads.
 */
export function BranchMenu({ workspace, onSwitch }: BranchMenuProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<BranchSummaryDto[] | null>(null);
  const [creating, setCreating] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void listBranches(workspace.repo.owner, workspace.repo.repo)
      .then((result) => {
        if (!cancelled) setBranches(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load branches.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, workspace.repo.owner, workspace.repo.repo]);

  // Click-away and Escape, so the menu does not strand itself over the editor.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const create = async () => {
    const name = sanitizeBranchName(creating);
    if (!name || busy) return;

    setBusy(true);
    setError(null);

    try {
      await createBranch({
        owner: workspace.repo.owner,
        repo: workspace.repo.repo,
        name,
        from: workspace.repo.branch,
      });
      await onSwitch(name);
      setOpen(false);
      setCreating("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create that branch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={`Branch: ${workspace.repo.branch}`}
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
      >
        <BranchGlyph />
        <span className="max-w-[14ch] truncate font-mono">{workspace.repo.branch}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-40 mb-1.5 w-72 overflow-hidden rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1 shadow-[var(--fl-shadow-lg)]"
        >
          {error && (
            <p role="alert" className="px-2.5 py-2 text-[12px] text-[var(--fl-danger)]">
              {error}
            </p>
          )}

          {!branches && !error && (
            <p className="px-2.5 py-3 text-[12px] text-[var(--fl-muted)]">Loading branches…</p>
          )}

          <ul className="max-h-56 overflow-y-auto">
            {branches?.map((branch) => (
              <li key={branch.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={branch.name === workspace.repo.branch}
                  onClick={() => {
                    void onSwitch(branch.name);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--fl-elevated)] ${
                    branch.name === workspace.repo.branch
                      ? "text-[var(--fl-accent)]"
                      : "text-[var(--fl-text)]"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                    {branch.name}
                  </span>
                  {branch.isDefault && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--fl-muted)]">
                      default
                    </span>
                  )}
                  {branch.protected && (
                    <span
                      title="Protected — direct pushes may be rejected"
                      className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--fl-muted)]"
                    >
                      protected
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-1 border-t border-[var(--fl-border)] p-1.5">
            <input
              value={creating}
              onChange={(event) => setCreating(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void create()}
              placeholder="New branch from this one…"
              disabled={busy}
              className="w-full rounded-md border border-[var(--fl-border)] bg-[var(--fl-bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            />
            {creating.trim() && (
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy || !sanitizeBranchName(creating)}
                className="mt-1.5 w-full rounded-md bg-[var(--fl-accent)] px-2 py-1.5 text-[12px] font-semibold text-[var(--fl-accent-contrast)] disabled:opacity-40"
              >
                {busy ? "Creating…" : `Create ${sanitizeBranchName(creating) || "…"}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BranchGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="4.5" cy="3.5" r="1.75" />
      <circle cx="4.5" cy="12.5" r="1.75" />
      <circle cx="11.5" cy="6.5" r="1.75" />
      <path d="M4.5 5.25v5.5M11.5 8.25c0 2-1.5 2.75-3.25 3.1" />
    </svg>
  );
}
