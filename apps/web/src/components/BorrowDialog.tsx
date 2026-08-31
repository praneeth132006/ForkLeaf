"use client";

import { useCallback, useState } from "react";
import type { TreeNode } from "@forkleaf/types";
import { Dialog } from "@/components/Dialog";
import { describeRepo, listBranches } from "@/lib/gateway";
import { collectFilePaths } from "@/lib/tree";

/**
 * Borrowing a note from somebody else's notebook.
 *
 * When a friend writes a good note, what people do is copy and paste it. Now
 * there are two copies, one of them is already out of date, and neither of you
 * can tell which. It is the problem installing a library solves for code, and
 * nobody has solved it for the things people know.
 *
 * A borrowed note is a link into their repository, pinned to the revision you
 * read: `[[repo:them/notes:runbook.md@a1b2c3d]]`. Their note stays theirs and
 * yours stays yours; the link keeps working after they edit it, because it
 * names the version you actually read rather than "whatever is there now".
 * Unpinning is a character you delete, if following along is what you wanted.
 *
 * Nothing is copied and nothing is stored. This dialog only helps find the
 * path, because the link itself has always worked and nobody could be expected
 * to type a repository path from memory.
 */

export interface BorrowDialogProps {
  onClose: () => void;
  /** Reads the file list of any repository the reader can see. */
  loadTree: (owner: string, repo: string, branch: string) => Promise<TreeNode[]>;
  /** Writes the link into the note being read from. */
  onBorrow: (link: string) => void;
}

type State =
  | { kind: "idle" }
  | { kind: "looking" }
  | {
      kind: "found";
      owner: string;
      repo: string;
      branch: string;
      /** The revision that branch is on right now, which is what gets pinned. */
      sha: string | null;
      paths: string[];
    }
  | { kind: "error"; message: string };

export function BorrowDialog({ onClose, loadTree, onBorrow }: BorrowDialogProps) {
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  /**
   * Whether the link names the revision read.
   *
   * On by default, which is the whole idea: an unpinned link says "whatever
   * they have now", and a note that changes under a claim you made about it is
   * the thing borrowing is supposed to prevent. Off is a real choice for
   * somebody following a document they expect to keep changing.
   */
  const [pin, setPin] = useState(true);

  const look = useCallback(async () => {
    const [owner, repo] = name
      .trim()
      .replace(/^https:\/\/github\.com\//, "")
      .split("/");
    if (!owner || !repo) {
      setState({ kind: "error", message: "Give it as owner/repository — for example ada/notes." });
      return;
    }

    setState({ kind: "looking" });

    try {
      const found = await describeRepo(owner, repo.replace(/\.git$/, ""));

      const [tree, branches] = await Promise.all([
        loadTree(found.owner, found.name, found.defaultBranch),
        // The revision to pin to. A branch name would be no pin at all: it is
        // a name for "whatever is there now", which is the thing borrowing is
        // meant to protect a note from.
        listBranches(found.owner, found.name).catch(() => []),
      ]);

      setState({
        kind: "found",
        owner: found.owner,
        repo: found.name,
        branch: found.defaultBranch,
        sha: branches.find((branch) => branch.name === found.defaultBranch)?.sha ?? null,
        paths: collectFilePaths(tree).filter((path) => /\.mdx?$/i.test(path)),
      });
    } catch (problem: unknown) {
      setState({
        kind: "error",
        message:
          problem instanceof Error
            ? problem.message
            : "That notebook could not be read. It may be private, or not exist.",
      });
    }
  }, [name, loadTree]);

  const paths =
    state.kind === "found"
      ? state.paths.filter((path) => path.toLowerCase().includes(filter.trim().toLowerCase()))
      : [];

  return (
    <Dialog
      title="Borrow a note"
      subtitle="Link into somebody else's notebook instead of copying out of it"
      onClose={onClose}
      wide
    >
      <div className="text-[13px]">
        <p className="max-w-2xl leading-relaxed text-[var(--fl-muted)]">
          Copying a note makes a second copy that is already going out of date. A borrowed note is a
          link into their repository, pinned to the version you read — theirs stays theirs, and your
          link keeps working after they change it.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fl-muted)]">
              Whose notebook
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void look();
              }}
              placeholder="ada/notes"
              autoFocus
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
            />
          </label>

          <button
            type="button"
            onClick={() => void look()}
            disabled={state.kind === "looking"}
            className="fl-btn fl-btn-primary !py-1.5 disabled:opacity-60"
          >
            {state.kind === "looking" ? "Looking…" : "Look inside"}
          </button>
        </div>

        {state.kind === "error" && (
          <p role="alert" className="mt-3 text-[var(--fl-danger)]">
            {state.message}
          </p>
        )}

        {state.kind === "found" && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-[var(--fl-muted)]">
                {state.paths.length} {state.paths.length === 1 ? "note" : "notes"} in{" "}
                <span className="font-mono text-[12px] text-[var(--fl-text)]">
                  {state.owner}/{state.repo}
                </span>{" "}
                on <span className="font-mono text-[12px]">{state.branch}</span>
              </p>

              <label className="ml-auto flex items-center gap-1.5 text-[12px] text-[var(--fl-muted)]">
                <input
                  type="checkbox"
                  checked={pin && state.sha !== null}
                  disabled={state.sha === null}
                  onChange={(event) => setPin(event.target.checked)}
                />
                {state.sha === null
                  ? "That revision could not be read, so this cannot be pinned"
                  : "Pin to the version I read"}
              </label>
            </div>

            {state.paths.length > 8 && (
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by name…"
                className="mt-2 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
              />
            )}

            <ul className="mt-2 max-h-[38vh] overflow-y-auto rounded-xl border border-[var(--fl-border)] p-1.5">
              {paths.length === 0 && (
                <li className="px-1.5 py-2 text-[12.5px] text-[var(--fl-muted)]">
                  {state.paths.length === 0
                    ? "There are no markdown notes in that repository."
                    : "Nothing matches that."}
                </li>
              )}

              {paths.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() =>
                      onBorrow(
                        `[[repo:${state.owner}/${state.repo}:${path}` +
                          `${pin && state.sha ? `@${state.sha.slice(0, 7)}` : ""}]]`,
                      )
                    }
                    className="block w-full truncate rounded px-1.5 py-1 text-left font-mono text-[11.5px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
              Choosing one writes a link into your note. Nothing is copied, and nothing of theirs is
              stored here — the note is read from their repository when you open it.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
