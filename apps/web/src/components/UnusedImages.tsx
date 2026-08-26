"use client";

import React, { useState } from "react";
import type { Workspace } from "@forkleaf/types";
import { formatBytes, type OrphanAsset } from "@/lib/orphan-assets";
import { deleteUnusedImages, ScanError, scanForUnusedImages } from "@/lib/unused-images";

/**
 * Clearing out images no note uses.
 *
 * An older version of this app deleted a folder's notes and left the pictures
 * they used behind, in an `assets` directory beside them. That is fixed, but
 * any repository used before the fix is still carrying the leftovers — and
 * because the sidebar is built from notes, a folder with no note left in it
 * cannot be reached to clear it.
 *
 * It is a scan and then a decision, never one action. The list is shown with
 * every path and what it costs, and removing it is a second, separate press.
 * A tool that deletes files out of somebody's repository on one click, on the
 * strength of a heuristic about what is "unused", is not a tool anybody should
 * have to trust.
 */
export function UnusedImages({ workspace }: { workspace: Workspace }) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "scanning"; done: number; total: number }
    | { kind: "found"; orphans: OrphanAsset[]; notesRead: number }
    | { kind: "deleting" }
    | { kind: "done"; removed: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const scan = async () => {
    setState({ kind: "scanning", done: 0, total: 0 });
    try {
      const result = await scanForUnusedImages(workspace, (done, total) =>
        setState({ kind: "scanning", done, total }),
      );
      setState({ kind: "found", orphans: result.orphans, notesRead: result.notesRead });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof ScanError
            ? error.message
            : "The repository could not be read. Nothing was changed.",
      });
    }
  };

  const remove = async (orphans: OrphanAsset[]) => {
    setState({ kind: "deleting" });
    try {
      await deleteUnusedImages(
        workspace,
        orphans.map((orphan) => orphan.path),
      );
      setState({ kind: "done", removed: orphans.length });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof ScanError
            ? error.message
            : "Those images could not be removed. Nothing was changed.",
      });
    }
  };

  return (
    <div className="mt-4 border-t border-[var(--fl-border)] pt-4">
      <h4 className="text-[13.5px] font-semibold text-[var(--fl-text)]">Unused images</h4>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--fl-muted)]">
        Reads every note in this repository and lists the images none of them link to. Nothing is
        deleted until you say so.
      </p>

      {state.kind === "idle" && (
        <button
          type="button"
          onClick={scan}
          className="fl-btn fl-btn-ghost mt-3 !py-1.5 !text-[13px]"
        >
          Scan for unused images
        </button>
      )}

      {state.kind === "scanning" && (
        <p role="status" className="mt-3 text-[13px] text-[var(--fl-muted)]">
          {state.total > 0
            ? `Reading notes — ${state.done} of ${state.total}…`
            : "Reading the repository…"}
        </p>
      )}

      {state.kind === "found" && state.orphans.length === 0 && (
        <p role="status" className="mt-3 text-[13px] text-[var(--fl-muted)]">
          Nothing unused. Every image in this repository is linked from one of its{" "}
          {state.notesRead.toLocaleString()} notes.
        </p>
      )}

      {state.kind === "found" && state.orphans.length > 0 && (
        <div className="mt-3">
          <p className="text-[13px] text-[var(--fl-text)]">
            {state.orphans.length === 1
              ? "One image is not linked from any note"
              : `${state.orphans.length} images are not linked from any note`}
            {totalBytes(state.orphans) !== null && (
              <span className="text-[var(--fl-muted)]">
                {" "}
                — {formatBytes(totalBytes(state.orphans)!)}
              </span>
            )}
            <span className="text-[var(--fl-muted)]">
              , after reading all {state.notesRead.toLocaleString()}.
            </span>
          </p>

          {/* Every path, not a count. Somebody is about to delete these from
              their own repository and is entitled to see exactly which. */}
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-2">
            {state.orphans.map((orphan) => (
              <li
                key={orphan.path}
                className="flex items-baseline justify-between gap-3 px-1.5 py-1 font-mono text-[12px] text-[var(--fl-muted)]"
              >
                <span className="min-w-0 break-all">{orphan.path}</span>
                {orphan.size !== null && (
                  <span className="shrink-0">{formatBytes(orphan.size)}</span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => remove(state.orphans)}
              className="fl-btn !border-[var(--fl-danger)] !py-1.5 !text-[13px] !text-[var(--fl-danger)]"
            >
              Delete {state.orphans.length === 1 ? "it" : "them"} from GitHub
            </button>
            <button
              type="button"
              onClick={() => setState({ kind: "idle" })}
              className="fl-btn fl-btn-ghost !py-1.5 !text-[13px]"
            >
              Leave them
            </button>
          </div>

          <p className="mt-2 text-[12px] text-[var(--fl-muted)]">
            One commit, so it stays recoverable from your git history.
          </p>
        </div>
      )}

      {state.kind === "deleting" && (
        <p role="status" className="mt-3 text-[13px] text-[var(--fl-muted)]">
          Removing them…
        </p>
      )}

      {state.kind === "done" && (
        <p role="status" className="mt-3 text-[13px] text-[var(--fl-muted)]">
          {state.removed === 1 ? "One image removed" : `${state.removed} images removed`}. The
          commit is in your repository&rsquo;s history if you need it back.{" "}
          <button
            type="button"
            onClick={() => setState({ kind: "idle" })}
            className="text-[var(--fl-accent)] underline"
          >
            Scan again
          </button>
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--fl-danger)]">
          {state.message}{" "}
          <button
            type="button"
            onClick={() => setState({ kind: "idle" })}
            className="text-[var(--fl-accent)] underline"
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}

/** Null when GitHub reported no size for any of them, rather than "0 B". */
function totalBytes(orphans: readonly OrphanAsset[]): number | null {
  const known = orphans.filter((orphan) => orphan.size !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, orphan) => sum + (orphan.size ?? 0), 0);
}
