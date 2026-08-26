"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildThreads,
  summariseReviews,
  type ReviewComment,
  type ReviewThread,
  type SubmittedReview,
  type Verdict,
} from "@forkleaf/markdown-engine";
import { relativeTime } from "@/lib/relative-time";

/**
 * A pull request's review, read inside the note it is about.
 *
 * Opening a request against your own notes already worked. Reading the review
 * meant going to github.com and reading your own prose as a unified diff —
 * which is the part that made "study something, then have it reviewed" not
 * actually work. Comments are shown against the paragraph they were written
 * about, in the order the note reads, with the paragraph quoted so a remark is
 * never floating free of what it is a remark about.
 */

interface PullSummary {
  number: number;
  url: string;
  title: string;
  state: string;
  merged: boolean;
  author: string | null;
  head: string;
  base: string;
  mergeable: boolean | null;
  mergeableState: string | null;
}

interface Conversation {
  id: number;
  author: string | null;
  body: string;
  createdAt: string;
}

interface ReviewData {
  pull: PullSummary | null;
  comments: ReviewComment[];
  reviews: SubmittedReview[];
  conversation: Conversation[];
}

export interface ReviewPanelProps {
  owner: string;
  repo: string;
  /** The branch the workspace is on, which is what identifies the request. */
  branch: string;
  /** The note being reviewed — only its comments are shown. */
  path: string;
  /** The note as it stands, for quoting the paragraph each remark is about. */
  content: string;
  /** Told when a merge lands, so the workspace can go back to the base branch. */
  onMerged?: (base: string) => void;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  approved: "Approved",
  "changes-requested": "Changes requested",
  commented: "Commented on",
  none: "Not reviewed yet",
};

export function ReviewPanel({ owner, repo, branch, path, content, onMerged }: ReviewPanelProps) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Reads the whole review, and writes no state of its own.
   *
   * Kept pure so the effect below can own every write. A version of this that
   * called setState was flagged for setting state synchronously from an
   * effect — and would have had a real race behind the lint error: switching
   * branch mid-request let a slow answer for the old branch overwrite the new
   * one's.
   */
  const read = useCallback(async (): Promise<
    { ok: true; data: ReviewData } | { ok: false; message: string }
  > => {
    try {
      const params = new URLSearchParams({ owner, repo, head: branch });
      const response = await fetch(`/api/gh/review?${params.toString()}`);
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        return { ok: false, message: body?.error?.message ?? "That review could not be read." };
      }

      return { ok: true, data: body as ReviewData };
    } catch {
      return {
        ok: false,
        message: "Could not reach GitHub. The review is there, this view is not.",
      };
    }
  }, [owner, repo, branch]);

  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await read();
      if (cancelled) return;

      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [read, reloads]);

  /** Re-reads after something is sent, rather than guessing the new state. */
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const threads = useMemo(
    () => (data ? buildThreads(data.comments, { path, content }) : []),
    [data, path, content],
  );

  const verdict = useMemo(() => summariseReviews(data?.reviews ?? []), [data]);

  /** Sends one reply, then re-reads rather than guessing the new state. */
  const send = useCallback(
    async (payload: Record<string, unknown>, key: string) => {
      if (!data?.pull) return;
      setBusy(key);
      setError(null);

      try {
        const response = await fetch("/api/gh/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner, repo, number: data.pull.number, ...payload }),
        });

        const body = await response.json().catch(() => null);

        if (!response.ok) {
          setError(body?.error?.message ?? "That did not go through.");
          return;
        }

        if (payload.action === "merge") {
          onMerged?.(data.pull.base);
          return;
        }

        reload();
      } catch {
        setError("Could not reach GitHub. Nothing was sent.");
      } finally {
        setBusy(null);
      }
    },
    [data, owner, repo, reload, onMerged],
  );

  if (error && !data) {
    return <p className="text-[13px] text-[var(--fl-muted)]">{error}</p>;
  }

  if (!data) {
    return <p className="text-[13px] text-[var(--fl-muted)]">Reading the review…</p>;
  }

  if (!data.pull) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-[var(--fl-text)]">Nothing is under review.</p>
        <p className="text-[12.5px] text-[var(--fl-muted)]">
          This branch — <code className="font-mono">{branch}</code> — has no open pull request.
          Propose changes from the properties panel to open one, and the review appears here.
        </p>
      </div>
    );
  }

  const pull = data.pull;

  return (
    <div className="space-y-4">
      <header className="space-y-1.5 border-b border-[var(--fl-border)] pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <a
            href={pull.url}
            target="_blank"
            rel="noreferrer"
            className="text-[14px] font-medium text-[var(--fl-text)] underline-offset-2 hover:underline"
          >
            {pull.title}
          </a>
          <span className="font-mono text-[12px] text-[var(--fl-muted)]">#{pull.number}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--fl-muted)]">
          <Badge verdict={verdict.verdict} />
          <span>
            {pull.head} → {pull.base}
          </span>
          {verdict.reviewers.length > 0 && (
            <span>{verdict.reviewers.map((r) => r.author).join(", ")}</span>
          )}
        </div>
      </header>

      {error && <p className="text-[12.5px] text-[var(--fl-danger,#f87171)]">{error}</p>}

      {threads.length === 0 ? (
        <p className="text-[12.5px] text-[var(--fl-muted)]">
          No inline comments on this note yet. Anything a reviewer marks up will appear here beside
          the paragraph it is about.
        </p>
      ) : (
        <ol className="space-y-3">
          {threads.map((thread) => (
            <Thread
              key={thread.id}
              thread={thread}
              busy={busy === `reply-${thread.id}`}
              onReply={(body) =>
                send({ action: "reply", commentId: thread.id, body }, `reply-${thread.id}`)
              }
            />
          ))}
        </ol>
      )}

      <Composer
        label="Add to the conversation"
        placeholder="Reply to the review as a whole…"
        busy={busy === "comment"}
        onSend={(body) => send({ action: "comment", body }, "comment")}
      />

      <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--fl-border)] pt-3">
        <button
          type="button"
          disabled={busy !== null || pull.mergeable === false}
          onClick={() => send({ action: "merge" }, "merge")}
          className="rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--fl-accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "merge" ? "Merging…" : "Squash and merge"}
        </button>

        <span className="text-[12px] text-[var(--fl-muted)]">
          {mergeAdvice(pull, verdict.verdict)}
        </span>
      </footer>
    </div>
  );
}

/**
 * What the merge button will and will not do, said before it is pressed.
 *
 * GitHub computes mergeability in the background and reports null until it has
 * — so "unknown" is a real answer here, not an oversight, and saying so beats
 * a button that looks ready and then fails.
 */
function mergeAdvice(pull: PullSummary, verdict: Verdict): string {
  if (pull.mergeable === false) {
    return pull.mergeableState === "dirty"
      ? "This has conflicts with the base branch and cannot be merged here."
      : "GitHub will not merge this yet.";
  }

  if (pull.mergeable === null) return "GitHub is still working out whether this can merge.";
  if (verdict === "changes-requested") return "Someone has asked for changes.";
  if (verdict === "approved") return "Approved — this will land as a single commit.";

  return "This will land as a single commit.";
}

function Badge({ verdict }: { verdict: Verdict }) {
  const tone =
    verdict === "approved"
      ? "text-[#4ade80]"
      : verdict === "changes-requested"
        ? "text-[#f87171]"
        : "text-[var(--fl-muted)]";

  return <span className={`font-medium ${tone}`}>{VERDICT_LABEL[verdict]}</span>;
}

function Thread({
  thread,
  busy,
  onReply,
}: {
  thread: ReviewThread;
  busy: boolean;
  onReply: (body: string) => void;
}) {
  return (
    <li className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
      {thread.quote ? (
        <blockquote className="mb-2.5 border-l-2 border-[var(--fl-accent)] pl-2.5 text-[12.5px] whitespace-pre-wrap text-[var(--fl-muted)]">
          {thread.quote}
        </blockquote>
      ) : (
        /* The line it was written against is gone, so there is nothing
           truthful to quote. Saying so beats quoting the wrong paragraph. */
        <p className="mb-2.5 text-[12px] text-[var(--fl-muted)] italic">
          On a part of the note that has since changed.
        </p>
      )}

      <ol className="space-y-2.5">
        {thread.comments.map((comment) => (
          <li key={comment.id}>
            <div className="flex items-baseline gap-2 text-[12px]">
              <span className="font-medium text-[var(--fl-text)]">
                {comment.author ?? "someone"}
              </span>
              <time dateTime={comment.createdAt} className="text-[var(--fl-muted)]">
                {relativeTime(comment.createdAt)}
              </time>
            </div>
            <p className="mt-0.5 text-[13px] whitespace-pre-wrap text-[var(--fl-text)]">
              {comment.body}
            </p>
          </li>
        ))}
      </ol>

      <Composer label="Reply" placeholder="Reply to this…" busy={busy} onSend={onReply} compact />
    </li>
  );
}

function Composer({
  label,
  placeholder,
  busy,
  onSend,
  compact = false,
}: {
  label: string;
  placeholder: string;
  busy: boolean;
  onSend: (body: string) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");

  const send = () => {
    const body = text.trim();
    if (!body || busy) return;
    onSend(body);
    setText("");
  };

  return (
    <div className={compact ? "mt-2.5" : "space-y-1.5"}>
      {!compact && (
        <label className="block text-[12px] text-[var(--fl-muted)]" htmlFor={`c-${label}`}>
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <textarea
          id={`c-${label}`}
          rows={compact ? 1 : 2}
          value={text}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          // Enter sends, because these are one-line remarks; a newline still
          // works with the modifier, the way every chat box behaves.
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          className="min-w-0 flex-1 resize-y rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 text-[13px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)]"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || text.trim() === ""}
          className="self-end rounded-lg border border-[var(--fl-border)] px-2.5 py-1.5 text-[12.5px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)] disabled:opacity-40"
        >
          {busy ? "Sending…" : label}
        </button>
      </div>
    </div>
  );
}
