"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Workspace } from "@forkleaf/types";
import { formatRepoTarget } from "@forkleaf/markdown-engine";
import { Dialog } from "./Dialog";

/**
 * Picking a file to link, instead of typing a link to a file.
 *
 * The `[[repo:owner/name:path@a1b2c3d]]` syntax is precise, survives in plain
 * markdown, and is completely unreasonable to expect anybody to type. Worse,
 * the useful half — pinning the revision you read the file at, which is what
 * lets the note tell you later that the file moved — requires knowing a commit
 * SHA you have no way of knowing while writing.
 *
 * So: a list of the files in the repository, a filter box, and one click. The
 * revision is looked up and pinned automatically, because that is the part a
 * person cannot do and the machine can.
 */

export interface LinkFileDialogProps {
  workspace: Workspace;
  /** Inserts the finished `[[repo:…]]` link into the note. */
  onInsert: (link: string) => void;
  onClose: () => void;
}

/** Files that are not worth offering as documentation targets. */
const IGNORED = /(^|\/)(\.git|node_modules|\.next|dist|build|coverage)(\/|$)/;

export function LinkFileDialog({ workspace, onInsert, onClose }: LinkFileDialogProps) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pinning, setPinning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const params = new URLSearchParams({
          owner: workspace.repo.owner,
          repo: workspace.repo.repo,
          branch: workspace.repo.branch,
          all: "1",
        });

        const response = await fetch(`/api/gh/tree?${params.toString()}`);
        const body = await response.json().catch(() => null);
        if (cancelled) return;

        if (!response.ok) {
          setError(body?.error?.message ?? "That repository's files could not be listed.");
          return;
        }

        const found: string[] = (body?.tree ?? body?.paths ?? [])
          .map((node: unknown) =>
            typeof node === "string" ? node : ((node as { path?: string })?.path ?? ""),
          )
          .filter((path: string) => path && !IGNORED.test(path));

        setPaths(found.sort((a, b) => a.localeCompare(b)));
      } catch {
        setError("Could not reach GitHub to list the files.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace.repo.owner, workspace.repo.repo, workspace.repo.branch]);

  const shown = useMemo(() => {
    if (!paths) return [];
    const needle = filter.trim().toLowerCase();
    const matched = needle ? paths.filter((path) => path.toLowerCase().includes(needle)) : paths;
    // Capped: a repository can hold thousands of files and nobody scrolls past
    // the first screen — they type instead.
    return matched.slice(0, 200);
  }, [paths, filter]);

  /**
   * Pins the file's current revision, then inserts the link.
   *
   * A link that fails to pin is still inserted, unpinned: the reader wanted a
   * link to a file, and refusing to give them one because the revision lookup
   * failed would be trading the whole feature for half of it. It just cannot
   * report staleness until something pins it.
   */
  const choose = useCallback(
    async (path: string) => {
      setPinning(path);

      let ref: string | null = null;
      try {
        const params = new URLSearchParams({
          owner: workspace.repo.owner,
          repo: workspace.repo.repo,
          branch: workspace.repo.branch,
          path,
        });
        const response = await fetch(`/api/gh/file-head?${params.toString()}`);
        const body = await response.json().catch(() => null);
        if (response.ok && body?.sha) ref = String(body.sha).slice(0, 7);
      } catch {
        // Left unpinned; see above.
      }

      onInsert(`[[${formatRepoTarget({ owner: null, repo: null, path, ref })}]]`);
      setPinning(null);
      onClose();
    },
    [workspace.repo, onInsert, onClose],
  );

  return (
    <Dialog
      title="Link a file"
      subtitle={`A file in ${workspace.repo.owner}/${workspace.repo.repo}, pinned to its current revision`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <input
          autoFocus
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name or folder…"
          aria-label="Filter files"
          className="w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
        />

        {error && <p className="text-[13px] text-[var(--fl-danger)]">{error}</p>}

        {!paths && !error && (
          <p className="text-[13px] text-[var(--fl-muted)]">Reading the repository…</p>
        )}

        {paths && shown.length === 0 && (
          <p className="text-[13px] text-[var(--fl-muted)]">
            {filter.trim()
              ? `Nothing matches “${filter.trim()}”.`
              : "This repository has no files."}
          </p>
        )}

        {shown.length > 0 && (
          <ul className="max-h-80 divide-y divide-[var(--fl-border)] overflow-y-auto rounded-lg border border-[var(--fl-border)]">
            {shown.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  disabled={pinning !== null}
                  onClick={() => void choose(path)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-50"
                >
                  <span className="truncate font-mono text-[12.5px] text-[var(--fl-text)]">
                    {path}
                  </span>
                  {pinning === path && (
                    <span className="shrink-0 text-[11.5px] text-[var(--fl-muted)]">pinning…</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11.5px] leading-snug text-[var(--fl-muted)]">
          The link records the revision the file is at now. When it changes, the Freshness panel
          says so — which is what turns a paragraph describing a script into one you can trust.
        </p>
      </div>
    </Dialog>
  );
}
