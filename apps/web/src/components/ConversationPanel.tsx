"use client";

import { useEffect, useRef, useState } from "react";
import type { DiscussionCommentDto } from "@forkleaf/github-client";
import { markdownToHtml } from "@forkleaf/markdown-engine";
import type { ConversationError, ConversationState } from "@/hooks/useNoteConversation";
import { relativeTime } from "@/lib/relative-time";

/**
 * The conversation about the open note.
 *
 * Every message is a comment on a GitHub Discussion in the notebook's own
 * repository, so collaborators can answer from github.com or GitHub's phone
 * app and the conversation outlives any one app. This panel is a view of it,
 * with nothing stored anywhere else.
 */

export interface ConversationPanelProps {
  /**
   * Why there is no conversation to have, when there is not: no repository,
   * an encrypted note. Shown instead of everything else.
   */
  unavailable?: string;
  /** `owner/repo`, for the sentences that name where messages go. */
  repoName: string | null;
  state: ConversationState;
  sending: boolean;
  send: (body: string, replyTo?: string) => Promise<ConversationError | null>;
  refresh: () => void;
  onClose: () => void;
}

export function ConversationPanel({
  unavailable,
  repoName,
  state,
  sending,
  send,
  refresh,
  onClose,
}: ConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<DiscussionCommentDto | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const repo = state.conversation?.repo ?? null;
  const discussion = state.conversation?.discussion ?? null;
  const messageCount = discussion
    ? discussion.comments.reduce((sum, c) => sum + 1 + c.replies.length, 0)
    : 0;

  // New messages arrive at the bottom, so that is where the reader is taken —
  // the way every chat behaves.
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messageCount]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setFailure(null);
    const error = await send(body, replyTo?.id);
    if (error) {
      // The draft stays: a message that did not send is one nobody should
      // have to type twice.
      setFailure(error.message);
      return;
    }
    setDraft("");
    setReplyTo(null);
  };

  const cannotWrite = !repo
    ? null
    : !repo.enabled
      ? "Discussions is switched off for this repository."
      : !repo.canComment
        ? "Only this repository's collaborators can join its conversations."
        : discussion?.locked
          ? "This conversation has been locked on GitHub."
          : null;

  return (
    <aside className="flex w-full min-w-0 shrink-0 flex-col" aria-label="Conversation">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--fl-border)] px-3">
        <span className="flex-1 truncate text-[13px] font-semibold text-[var(--fl-text)]">
          Conversation
        </span>

        {discussion && (
          <a
            href={discussion.url}
            target="_blank"
            rel="noreferrer"
            title="Open this conversation on GitHub"
            className="rounded px-1.5 py-0.5 text-[11.5px] text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
          >
            #{discussion.number} ↗
          </a>
        )}

        {!unavailable && (
          <button
            type="button"
            onClick={refresh}
            title="Check for new messages"
            aria-label="Check for new messages"
            className="rounded p-1 text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.8h-2.8" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          title="Hide panel"
          aria-label="Hide panel"
          className="rounded p-1 text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
        >
          ›
        </button>
      </div>

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[13px]">
        {unavailable ? (
          <Empty>{unavailable}</Empty>
        ) : state.status === "loading" && !state.conversation ? (
          <Empty>Loading the conversation…</Empty>
        ) : !state.conversation ? (
          <Empty>
            <span className="block text-[var(--fl-text)]">
              {state.error?.message ?? "Could not load the conversation."}
            </span>
            <button type="button" onClick={refresh} className="fl-btn fl-btn-ghost mt-3">
              Try again
            </button>
          </Empty>
        ) : !repo?.enabled ? (
          <Empty>
            <span className="block text-[var(--fl-text)]">
              Conversations are kept in GitHub Discussions, which is switched off for{" "}
              {repoName ?? "this repository"}.
            </span>
            <span className="mt-2 block">
              Turn on <strong>Discussions</strong> under Features in the repository&rsquo;s
              settings, then check again.
            </span>
            <span className="mt-3 flex justify-center gap-2">
              <a
                href={`${repo?.url ?? ""}/settings`}
                target="_blank"
                rel="noreferrer"
                className="fl-btn fl-btn-primary"
              >
                Open settings ↗
              </a>
              <button type="button" onClick={refresh} className="fl-btn fl-btn-ghost">
                Check again
              </button>
            </span>
          </Empty>
        ) : !discussion || discussion.comments.length === 0 ? (
          <Empty>
            <span className="block text-[var(--fl-text)]">No messages about this note yet.</span>
            <span className="mt-2 block">
              The first one starts a GitHub Discussion in {repoName ?? "this repository"}, so
              collaborators can reply here or on GitHub.
            </span>
          </Empty>
        ) : (
          <ol className="space-y-4">
            {discussion.commentCount > discussion.comments.length && (
              <li className="text-center text-[11.5px] text-[var(--fl-muted)]">
                <a
                  href={discussion.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {discussion.commentCount - discussion.comments.length} earlier messages on GitHub
                  ↗
                </a>
              </li>
            )}
            {discussion.comments.map((comment) => (
              <li key={comment.id}>
                <Message
                  message={comment}
                  onReply={
                    cannotWrite
                      ? undefined
                      : () => {
                          setReplyTo(comment);
                          composer.current?.focus();
                        }
                  }
                />
                {(comment.replies.length > 0 || comment.replyCount > comment.replies.length) && (
                  <ol className="mt-2 ml-3 space-y-3 border-l border-[var(--fl-border)] pl-3">
                    {comment.replyCount > comment.replies.length && (
                      <li className="text-[11.5px] text-[var(--fl-muted)]">
                        <a
                          href={comment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                        >
                          {comment.replyCount - comment.replies.length} earlier replies on GitHub ↗
                        </a>
                      </li>
                    )}
                    {comment.replies.map((reply) => (
                      <li key={reply.id}>
                        <Message message={reply} />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Composer ─────────────────────────────────────────────────────── */}
      {!unavailable && repo?.enabled && (
        <div className="shrink-0 border-t border-[var(--fl-border)] px-3 py-2.5">
          {state.status === "error" && state.error && (
            <p role="status" className="mb-2 text-[11.5px] text-[var(--fl-muted)]">
              Could not check for new messages: {state.error.message}
            </p>
          )}

          {!repo.private && !cannotWrite && (
            <p className="mb-2 text-[11.5px] text-[var(--fl-muted)]">
              This repository is public — anyone can read this conversation.
            </p>
          )}

          {cannotWrite ? (
            <p className="text-[12px] text-[var(--fl-muted)]">{cannotWrite}</p>
          ) : (
            <>
              {replyTo && (
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-[var(--fl-muted)]">
                  <span className="min-w-0 flex-1 truncate">
                    Replying to @{replyTo.author?.login ?? "ghost"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    aria-label="Cancel the reply"
                    className="rounded px-1 hover:text-[var(--fl-text)]"
                  >
                    ✕
                  </button>
                </div>
              )}

              <textarea
                ref={composer}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter is a new line, because a message is Markdown and
                  // Markdown is written in lines; ⌘↵ sends, as on GitHub.
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void submit();
                  }
                  if (event.key === "Escape" && replyTo) setReplyTo(null);
                }}
                rows={3}
                placeholder={replyTo ? "Write a reply…" : "Write a message… Markdown works"}
                aria-label={replyTo ? "Reply" : "Message"}
                className="fl-input min-h-[4.5rem] resize-y text-[13px]"
              />

              {failure && (
                <p role="alert" className="mt-1.5 text-[11.5px] text-[var(--fl-danger)]">
                  {failure}
                </p>
              )}

              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex-1 text-[11px] text-[var(--fl-muted)]">⌘↵ to send</span>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!draft.trim() || sending}
                  className="fl-btn fl-btn-primary disabled:opacity-50"
                >
                  {sending ? "Sending…" : replyTo ? "Reply" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-10 text-center text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
      {children}
    </div>
  );
}

function Message({ message, onReply }: { message: DiscussionCommentDto; onReply?: () => void }) {
  const [shown, setShown] = useState(!message.isMinimized);
  const login = message.author?.login ?? "ghost";

  return (
    <article className="group flex gap-2">
      {message.author?.avatarUrl ? (
        // A GitHub avatar, served from GitHub; nothing for Next's optimiser to do.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={message.author.avatarUrl}
          alt=""
          width={24}
          height={24}
          className="mt-0.5 h-6 w-6 shrink-0 rounded-full"
        />
      ) : (
        <span
          aria-hidden="true"
          className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-[var(--fl-elevated)]"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-[12px]">
          {message.author ? (
            <a
              href={message.author.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--fl-text)] hover:underline"
            >
              {login}
            </a>
          ) : (
            <span className="font-semibold text-[var(--fl-text)]">{login}</span>
          )}
          <a
            href={message.url}
            target="_blank"
            rel="noreferrer"
            title={new Date(message.createdAt).toLocaleString()}
            className="text-[11px] text-[var(--fl-muted)] hover:underline"
          >
            <time dateTime={message.createdAt}>{relativeTime(message.createdAt)}</time>
          </a>
          {message.isAnswer && (
            <span className="rounded-full bg-[var(--fl-accent-soft)] px-1.5 text-[10.5px] text-[var(--fl-accent)]">
              Answer
            </span>
          )}
        </div>

        {shown ? (
          <div
            className="fl-prose fl-assistant-answer mt-0.5 text-[13px] break-words text-[var(--fl-text)]"
            // Safe: `markdownToHtml` sanitises its output. The body is somebody
            // else's Markdown, which is exactly what the sanitiser is for.
            dangerouslySetInnerHTML={{ __html: markdownToHtml(message.body) }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShown(true)}
            className="mt-0.5 text-[12px] text-[var(--fl-muted)] italic hover:text-[var(--fl-text)]"
          >
            Hidden by a maintainer — show it
          </button>
        )}

        {onReply && (
          <button
            type="button"
            onClick={onReply}
            className="mt-0.5 rounded px-1 text-[11.5px] text-[var(--fl-muted)] opacity-70 transition-opacity group-hover:opacity-100 hover:text-[var(--fl-text)] focus-visible:opacity-100"
          >
            Reply
          </button>
        )}
      </div>
    </article>
  );
}
