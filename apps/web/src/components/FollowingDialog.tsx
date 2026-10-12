"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  compareParagraphs,
  parseRepoInput,
  quoteWithCredit,
  type Followed,
  type Paragraph,
} from "@/lib/following";

/**
 * Notebooks I follow: what the people whose notes you read have written since
 * you last looked.
 *
 * Each followed notebook lists the notes it added or changed. Opening one
 * shows it paragraph by paragraph with the new ones marked, and any paragraph
 * can be added to the note you have open — quoted, with a permanent link to
 * exactly where it came from.
 */

export interface FollowedChanges {
  baseSha: string | null;
  headSha: string;
  files: Array<{ path: string; status: string; previousPath: string | null }>;
  truncated: boolean;
}

export interface FollowingDialogProps {
  onClose: () => void;
  signedIn: boolean;
  following: readonly Followed[];
  /** Checks the notebook exists and is readable, then adds it. */
  onFollow: (owner: string, repo: string) => Promise<void>;
  onUnfollow: (followed: Followed) => Promise<void>;
  /** When you last caught up with a notebook. */
  since: (followed: Followed) => string;
  onCaughtUp: (followed: Followed) => void;
  loadChanges: (followed: Followed, since: string) => Promise<FollowedChanges>;
  /** A note's text at a commit; null when it did not exist there. */
  readAt: (followed: Followed, path: string, sha: string) => Promise<string | null>;
  /** Adds markdown to the end of the open note. Rejects with the reason when it cannot. */
  onCopy: (markdown: string) => Promise<string>;
}

type Changes =
  | { kind: "loading" }
  | { kind: "ready"; changes: FollowedChanges; since: string }
  | { kind: "error"; message: string };

interface Reading {
  followed: Followed;
  path: string;
  sha: string;
  title: string;
  state:
    | { kind: "loading" }
    | { kind: "ready"; paragraphs: Paragraph[]; isNewNote: boolean }
    | { kind: "error"; message: string };
}

const STATUS: Record<string, string> = {
  added: "New",
  modified: "Updated",
  renamed: "Moved",
  removed: "Deleted",
  changed: "Updated",
};

function titleOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.(md|markdown)$/i, "");
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function FollowingDialog(props: FollowingDialogProps) {
  const { onClose, signedIn, following, since, loadChanges, readAt, onCopy } = props;
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, Changes>>({});
  const [reading, setReading] = useState<Reading | null>(null);
  const [copied, setCopied] = useState<Record<number, string>>({});
  const [reloads, setReloads] = useState(0);

  const keyOf = (followed: Followed) => `${followed.owner}/${followed.repo}`.toLowerCase();

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    for (const followed of following) {
      const from = since(followed);
      loadChanges(followed, from).then(
        (result) => {
          if (live)
            setChanges((current) => ({
              ...current,
              [keyOf(followed)]: { kind: "ready", changes: result, since: from },
            }));
        },
        (error: unknown) => {
          if (live) {
            setChanges((current) => ({
              ...current,
              [keyOf(followed)]: {
                kind: "error",
                message: messageOf(error, "That notebook could not be read."),
              },
            }));
          }
        },
      );
    }
    return () => {
      live = false;
    };
    // Loaded when the list changes or on a refresh; the callbacks are inline props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, following.map(keyOf).join(" "), reloads]);

  const follow = async () => {
    const parsed = parseRepoInput(input);
    if (!parsed) {
      setProblem("Give the notebook as owner/name, or paste its GitHub address.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await props.onFollow(parsed.owner, parsed.repo);
      setInput("");
    } catch (error) {
      setProblem(messageOf(error, "That notebook could not be followed."));
    } finally {
      setBusy(false);
    }
  };

  const open = useCallback(
    async (followed: Followed, file: { path: string }, result: FollowedChanges) => {
      const title = titleOf(file.path);
      setCopied({});
      setReading({
        followed,
        path: file.path,
        sha: result.headSha,
        title,
        state: { kind: "loading" },
      });
      try {
        const [after, before] = await Promise.all([
          readAt(followed, file.path, result.headSha),
          result.baseSha ? readAt(followed, file.path, result.baseSha) : Promise.resolve(null),
        ]);
        if (after === null) {
          setReading((current) =>
            current && current.path === file.path
              ? {
                  ...current,
                  state: { kind: "error", message: "That note has since been deleted." },
                }
              : current,
          );
          return;
        }
        setReading((current) =>
          current && current.path === file.path
            ? {
                ...current,
                state: {
                  kind: "ready",
                  paragraphs: compareParagraphs(before, after),
                  isNewNote: before === null,
                },
              }
            : current,
        );
      } catch (error) {
        setReading((current) =>
          current && current.path === file.path
            ? {
                ...current,
                state: { kind: "error", message: messageOf(error, "That note could not be read.") },
              }
            : current,
        );
      }
    },
    [readAt],
  );

  const copy = async (paragraph: Paragraph, index: number) => {
    if (!reading) return;
    try {
      const where = await onCopy(
        quoteWithCredit(paragraph, {
          owner: reading.followed.owner,
          repo: reading.followed.repo,
          path: reading.path,
          sha: reading.sha,
          title: reading.title,
        }),
      );
      setCopied((current) => ({ ...current, [index]: `Added to ${where}` }));
    } catch (error) {
      setCopied((current) => ({
        ...current,
        [index]: messageOf(error, "That could not be added."),
      }));
    }
  };

  return (
    <Dialog
      title="Notebooks I follow"
      subtitle="What the people whose notes you read have written lately"
      onClose={onClose}
      wide
    >
      <div className="grid gap-4 text-[13px]">
        {!signedIn ? (
          <p className="text-[var(--fl-muted)]">
            Following reads other people&rsquo;s notebooks on GitHub, so it needs you signed in with
            GitHub first.
          </p>
        ) : (
          <>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void follow();
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="owner/notebook or a GitHub address"
                aria-label="Notebook to follow"
                className="fl-input min-w-0 flex-1"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="fl-btn fl-btn-primary"
              >
                {busy ? "Checking…" : "Follow"}
              </button>
            </form>
            {problem && (
              <p role="alert" className="text-[var(--fl-danger)]">
                {problem}
              </p>
            )}

            {following.length === 0 && (
              <p className="leading-relaxed text-[var(--fl-muted)]">
                You are not following any notebooks yet. Follow a public repository of notes — a
                friend&rsquo;s, a teacher&rsquo;s, a team&rsquo;s — and what they write shows up
                here, with anything you want to keep a click away from your own notes. The list is
                kept in <code>following.md</code>.
              </p>
            )}

            <div
              className={reading ? "grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]" : ""}
            >
              <ul className="grid content-start gap-3" data-testid="following-list">
                {following.map((followed) => {
                  const state = changes[keyOf(followed)] ?? { kind: "loading" as const };
                  return (
                    <li
                      key={keyOf(followed)}
                      className="rounded-xl border border-[var(--fl-border)] p-3"
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold text-[var(--fl-text)]">
                          {followed.label}
                        </span>
                        <a
                          href={`https://github.com/${followed.owner}/${followed.repo}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[11.5px] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                        >
                          {followed.owner}/{followed.repo}
                        </a>
                        <span className="ml-auto flex gap-2 text-[12px]">
                          {state.kind === "ready" && state.changes.files.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                props.onCaughtUp(followed);
                                setReloads((count) => count + 1);
                              }}
                              className="text-[var(--fl-muted)] underline underline-offset-2 hover:text-[var(--fl-text)]"
                            >
                              Caught up
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void props.onUnfollow(followed)}
                            className="text-[var(--fl-muted)] underline underline-offset-2 hover:text-[var(--fl-text)]"
                          >
                            Unfollow
                          </button>
                        </span>
                      </div>

                      {state.kind === "loading" && (
                        <p role="status" className="mt-1.5 text-[var(--fl-muted)]">
                          Looking for what is new…
                        </p>
                      )}
                      {state.kind === "error" && (
                        <p className="mt-1.5 text-[var(--fl-danger)]">{state.message}</p>
                      )}
                      {state.kind === "ready" && state.changes.files.length === 0 && (
                        <p className="mt-1.5 text-[var(--fl-muted)]">
                          Nothing new since {state.since.slice(0, 10)}.
                        </p>
                      )}
                      {state.kind === "ready" && state.changes.files.length > 0 && (
                        <ul className="mt-1.5 grid gap-0.5">
                          {state.changes.files
                            .filter((file) => file.status !== "removed")
                            .map((file) => (
                              <li key={file.path}>
                                <button
                                  type="button"
                                  onClick={() => void open(followed, file, state.changes)}
                                  className={`flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[var(--fl-elevated)] ${
                                    reading?.path === file.path &&
                                    keyOf(reading.followed) === keyOf(followed)
                                      ? "bg-[var(--fl-elevated)]"
                                      : ""
                                  }`}
                                >
                                  <span className="shrink-0 rounded bg-[var(--fl-accent-soft)] px-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fl-accent)]">
                                    {STATUS[file.status] ?? "Updated"}
                                  </span>
                                  <span className="min-w-0 truncate text-[var(--fl-text)]">
                                    {titleOf(file.path)}
                                  </span>
                                  <span className="ml-auto hidden shrink-0 truncate font-mono text-[10.5px] text-[var(--fl-muted)] sm:inline">
                                    {file.path}
                                  </span>
                                </button>
                              </li>
                            ))}
                          {state.changes.truncated && (
                            <li className="px-1.5 text-[12px] text-[var(--fl-muted)]">
                              And more — the first hundred are shown.
                            </li>
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>

              {reading && (
                <article
                  className="min-w-0 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3"
                  data-testid="following-reader"
                >
                  <header className="mb-2 flex flex-wrap items-baseline gap-2">
                    <h3 className="font-serif text-[1.25rem] text-[var(--fl-text)]">
                      {reading.title}
                    </h3>
                    <span className="text-[12px] text-[var(--fl-muted)]">
                      by @{reading.followed.owner}
                    </span>
                    <a
                      href={`https://github.com/${reading.followed.owner}/${reading.followed.repo}/blob/${reading.sha}/${reading.path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-[12px] text-[var(--fl-muted)] underline underline-offset-2 hover:text-[var(--fl-text)]"
                    >
                      Open on GitHub
                    </a>
                  </header>
                  {reading.state.kind === "loading" && (
                    <p role="status" className="text-[var(--fl-muted)]">
                      Reading the note…
                    </p>
                  )}
                  {reading.state.kind === "error" && (
                    <p className="text-[var(--fl-danger)]">{reading.state.message}</p>
                  )}
                  {reading.state.kind === "ready" && (
                    <ol className="grid gap-2">
                      {reading.state.paragraphs.map((paragraph, index) => (
                        <li
                          key={index}
                          className={`group rounded-lg border-l-2 px-2.5 py-1.5 ${
                            paragraph.isNew &&
                            !(reading.state.kind === "ready" && reading.state.isNewNote)
                              ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                              : "border-transparent"
                          }`}
                        >
                          <p className="whitespace-pre-wrap font-serif text-[14.5px] leading-relaxed text-[var(--fl-text)]">
                            {paragraph.markdown}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[12px]">
                            {paragraph.isNew &&
                              !(reading.state.kind === "ready" && reading.state.isNewNote) && (
                                <span className="font-semibold text-[var(--fl-accent)]">New</span>
                              )}
                            {copied[index] ? (
                              <span className="text-[var(--fl-muted)]">{copied[index]}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void copy(paragraph, index)}
                                className="text-[var(--fl-muted)] underline underline-offset-2 hover:text-[var(--fl-text)]"
                              >
                                Add to my note
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
