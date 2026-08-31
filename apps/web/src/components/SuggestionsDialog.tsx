"use client";

import { useCallback, useEffect, useState } from "react";
import type { RepoRef } from "@forkleaf/types";
import { Dialog } from "@/components/Dialog";
import { acceptSuggestion, listSuggestions, type SuggestionDto } from "@/lib/gateway";
import { relativeTime } from "@/lib/relative-time";

/**
 * What other people have suggested you change.
 *
 * Programmers have had "here is a fix for what you wrote" for twenty years and
 * call it a pull request. Nobody has ever offered it to people writing notes: a
 * published page is something you read, and that is where it ends — a reader
 * who spots a mistake can email you about it, and usually does not.
 *
 * A published ForkLeaf page now carries **Suggest an edit**, which takes the
 * reader to the note in GitHub's own editor, where their change becomes a pull
 * request without anybody having to know that word. This is the other end of
 * it: the author's list, in the app they write in, with the one action that
 * matters on each.
 *
 * Reading a suggestion still happens on GitHub. That is deliberate rather than
 * unfinished — a diff with a conversation attached is a thing GitHub is
 * extremely good at, and a worse copy of it here would be a worse copy of it
 * here. Accepting one, which is the part that belongs to the person whose
 * notebook it is, happens here.
 */

export interface SuggestionsDialogProps {
  onClose: () => void;
  repo: RepoRef;
  /** Re-reads the notebook after one is accepted, so the notes catch up. */
  onAccepted?: () => void | Promise<void>;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; pulls: SuggestionDto[] }
  | { kind: "error"; message: string };

export function SuggestionsDialog({ onClose, repo, onAccepted }: SuggestionsDialogProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  /** The suggestion being merged, so its row can say so. */
  const [accepting, setAccepting] = useState<number | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);

  /**
   * Reads the list, once, when the dialog opens.
   *
   * The state moves in the promise's callbacks rather than in the effect
   * body: the dialog already opens in "loading", so writing it again on the
   * way in would be a render spent saying what the previous render said.
   */
  useEffect(() => {
    let live = true;

    void listSuggestions(repo.owner, repo.repo)
      .then((pulls) => {
        if (live) setState({ kind: "ready", pulls });
      })
      .catch((error: unknown) => {
        if (!live) return;
        setState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "The suggestions could not be read from GitHub.",
        });
      });

    return () => {
      live = false;
    };
  }, [repo.owner, repo.repo]);

  const accept = useCallback(
    async (pull: SuggestionDto) => {
      setAccepting(pull.number);
      setProblem(null);

      try {
        await acceptSuggestion({
          owner: repo.owner,
          repo: repo.repo,
          number: pull.number,
          title: pull.title,
        });
        setAccepted((current) => new Set(current).add(pull.number));
        await onAccepted?.();
      } catch (error: unknown) {
        // Usually a conflict, and GitHub's own words are better than ours:
        // "this branch has conflicts that must be resolved" says exactly what
        // to do next, on a page that can do it.
        setProblem(
          error instanceof Error ? error.message : "GitHub would not accept that suggestion.",
        );
      } finally {
        setAccepting(null);
      }
    },
    [repo.owner, repo.repo, onAccepted],
  );

  return (
    <Dialog
      title="Suggestions"
      subtitle="Changes other people have proposed to this notebook"
      onClose={onClose}
      wide
    >
      {state.kind === "loading" && (
        <p aria-busy="true" className="text-[13px] text-[var(--fl-muted)]">
          Reading what is open on {repo.owner}/{repo.repo}…
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[13px] text-[var(--fl-danger)]">
          {state.message}
        </p>
      )}

      {state.kind === "ready" && state.pulls.length === 0 && (
        <div className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
          <p className="max-w-2xl">Nothing has been suggested yet.</p>
          <p className="mt-2 max-w-2xl">
            Every page you publish carries a <strong>Suggest an edit</strong> link. A reader who
            spots a mistake follows it, fixes the note in GitHub&rsquo;s editor, and their change
            arrives here for you to accept or decline — without either of you having to say the
            words &ldquo;pull request&rdquo;.
          </p>
        </div>
      )}

      {state.kind === "ready" && state.pulls.length > 0 && (
        <div className="text-[13px]">
          {problem && (
            <p role="alert" className="mb-2 text-[12.5px] text-[var(--fl-danger)]">
              {problem}
            </p>
          )}

          <ul className="space-y-2">
            {state.pulls.map((pull) => (
              <li
                key={pull.number}
                className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-2.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-medium text-[var(--fl-text)]">
                    {pull.title}
                  </span>
                  {pull.draft && (
                    <span className="rounded bg-[var(--fl-surface)] px-1.5 py-px text-[10.5px] uppercase tracking-wide text-[var(--fl-muted)]">
                      draft
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-[11.5px] text-[var(--fl-muted)]">
                  #{pull.number} · {pull.author ? `by ${pull.author}` : "by somebody"}
                  {pull.updatedAt ? ` · ${relativeTime(pull.updatedAt)}` : ""} ·{" "}
                  <span className="font-mono text-[11px]">
                    {pull.head} → {pull.base}
                  </span>
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={pull.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-[var(--fl-border)] px-2 py-1 text-[11.5px] font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-surface)]"
                  >
                    Read what changed
                  </a>

                  {accepted.has(pull.number) ? (
                    <span className="text-[11.5px] text-[var(--fl-muted)]">
                      Accepted. It is in your notes now.
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={accepting !== null || pull.draft}
                      onClick={() => void accept(pull)}
                      title={
                        pull.draft
                          ? "A draft is not finished being written"
                          : "Squash-merges it into your notes"
                      }
                      className="rounded border border-[var(--fl-border)] px-2 py-1 text-[11.5px] font-medium text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-surface)] disabled:opacity-50"
                    >
                      {accepting === pull.number ? "Accepting…" : "Accept"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Said once, at the bottom, rather than on every row: reading a diff
              with a conversation on it is a thing GitHub does very well, and a
              worse copy of it here would help nobody. */}
          <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
            <strong>Read what changed</strong> opens the suggestion on GitHub, where the diff and
            the conversation are. <strong>Accept</strong> merges it into your notes here, and the
            next sync brings the change down to this device.
          </p>
        </div>
      )}
    </Dialog>
  );
}
