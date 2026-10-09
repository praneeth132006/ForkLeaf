"use client";

import { useEffect, useRef, useState } from "react";
import type { DiscussionCommentDto, NoteDiscussionDto } from "@forkleaf/github-client";
import type { ConversationError, ConversationState } from "@/hooks/useNoteConversation";
import { Composer, ThreadMessages, type ThreadLinks } from "@/components/DiscussionThread";

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
  /** Marks or unmarks an answer, in a category that takes them. */
  setAnswer?: (commentId: string, answer: boolean) => Promise<ConversationError | null>;
  refresh: () => void;
  onClose: () => void;
  /** Every conversation in the notebook. */
  onOpenLounge?: () => void;
  /** Keeps this conversation as a note. */
  onSaveAsNote?: (discussion: NoteDiscussionDto) => void;
  /** Makes `[[links]]` in messages open notes. */
  links?: ThreadLinks;
}

export function ConversationPanel({
  unavailable,
  repoName,
  state,
  sending,
  send,
  setAnswer,
  refresh,
  onClose,
  onOpenLounge,
  onSaveAsNote,
  links,
}: ConversationPanelProps) {
  const [replyTo, setReplyTo] = useState<DiscussionCommentDto | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const list = useRef<HTMLDivElement>(null);

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
      <div className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-[var(--fl-border)] px-3">
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

        {discussion && messageCount > 0 && onSaveAsNote && (
          <IconAction
            label="Save this conversation as a note"
            onClick={() => onSaveAsNote(discussion)}
          >
            <path d="M4 2.5h6l2.5 2.5v8.5H4zM6 2.5v3h4v-3M6 13.5v-4h4v4" />
          </IconAction>
        )}

        {!unavailable && onOpenLounge && (
          <IconAction
            label="Every conversation in this notebook (the Lounge)"
            onClick={onOpenLounge}
          >
            <path d="M2.5 3.5h6v4h-6zM7.5 8.5h6v4h-6zM5.5 7.5v3h2M10.5 8.5v-3h-2" />
          </IconAction>
        )}

        {!unavailable && (
          <IconAction label="Check for new messages" onClick={refresh}>
            <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.8h-2.8" />
          </IconAction>
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
          <DiscussionsOff repoName={repoName} url={repo?.url ?? ""} onCheck={refresh} />
        ) : !discussion || discussion.comments.length === 0 ? (
          <Empty>
            <span className="block text-[var(--fl-text)]">No messages about this note yet.</span>
            <span className="mt-2 block">
              The first one starts a GitHub Discussion in {repoName ?? "this repository"}, so
              collaborators can reply here or on GitHub.
            </span>
          </Empty>
        ) : (
          <ThreadMessages
            discussion={discussion}
            {...(links ? { links } : {})}
            onReply={
              cannotWrite
                ? undefined
                : (comment) => {
                    setReplyTo(comment);
                    setFocusKey((key) => key + 1);
                  }
            }
            onAnswer={
              setAnswer
                ? async (comment, answer) => (await setAnswer(comment.id, answer))?.message ?? null
                : undefined
            }
          />
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
            <Composer
              sending={sending}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              focusKey={focusKey}
              onSend={async (body, to) => (await send(body, to))?.message ?? null}
            />
          )}
        </div>
      )}
    </aside>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1 text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-10 text-center text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
      {children}
    </div>
  );
}

/** What to do when the repository has Discussions switched off. */
export function DiscussionsOff({
  repoName,
  url,
  onCheck,
}: {
  repoName: string | null;
  url: string;
  onCheck: () => void;
}) {
  return (
    <Empty>
      <span className="block text-[var(--fl-text)]">
        Conversations are kept in GitHub Discussions, which is switched off for{" "}
        {repoName ?? "this repository"}.
      </span>
      <span className="mt-2 block">
        Turn on <strong>Discussions</strong> under Features in the repository&rsquo;s settings, then
        check again.
      </span>
      <span className="mt-3 flex justify-center gap-2">
        <a
          href={`${url}/settings`}
          target="_blank"
          rel="noreferrer"
          className="fl-btn fl-btn-primary"
        >
          Open settings ↗
        </a>
        <button type="button" onClick={onCheck} className="fl-btn fl-btn-ghost">
          Check again
        </button>
      </span>
    </Empty>
  );
}
