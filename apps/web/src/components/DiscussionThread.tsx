"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { DiscussionCommentDto, NoteDiscussionDto } from "@forkleaf/github-client";
import { markdownToHtml, type WikilinkResolver } from "@forkleaf/markdown-engine";
import { firstNewMessageId } from "@/lib/conversation";
import { relativeTime } from "@/lib/relative-time";

/**
 * A GitHub Discussion, read and answered — the parts shared by a note's Chat
 * tab and the Lounge, so a message looks and behaves the same in both.
 */

// ─── The messages ──────────────────────────────────────────────────────────

/**
 * How `[[links]]` in a message resolve, and what following one does.
 *
 * People write `[[the other note]]` in a conversation about a notebook as
 * naturally as in the notebook itself, so a link in a message is a link to a
 * note — shown as found or missing, and opened in the editor when clicked.
 */
export interface ThreadLinks {
  resolve: WikilinkResolver;
  open: (target: string) => void;
}

const LinksContext = createContext<ThreadLinks | null>(null);

export interface ThreadMessagesProps {
  discussion: NoteDiscussionDto;
  /**
   * Where the reader last left off. The first newer message from somebody
   * else gets a "new since you were last here" line above it.
   */
  since?: string | null;
  /** Show the opening post — a real question for a thread started on GitHub. */
  showOpening?: boolean;
  /** Absent when the reader cannot write here. */
  onReply?: (comment: DiscussionCommentDto) => void;
  /** Marks or unmarks an answer. Resolves to a reason it did not, or null. */
  onAnswer?: (comment: DiscussionCommentDto, answer: boolean) => Promise<string | null>;
  /** Makes `[[links]]` open notes. Without it they render, and go nowhere. */
  links?: ThreadLinks;
}

/** Removes ForkLeaf's own marker, so it is not mistaken for content. */
function withoutMarker(body: string): string {
  return body.replace(/<!-- forkleaf:note \S+ -->/g, "").trim();
}

export function ThreadMessages({
  discussion,
  since = null,
  showOpening = false,
  onReply,
  onAnswer,
  links,
}: ThreadMessagesProps) {
  const [answering, setAnswering] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const firstNew = firstNewMessageId(discussion, since);
  const opening = showOpening ? withoutMarker(discussion.body) : "";

  const answer = onAnswer
    ? async (comment: DiscussionCommentDto, value: boolean) => {
        setAnswering(comment.id);
        setFailure(null);
        const error = await onAnswer(comment, value);
        setAnswering(null);
        if (error) setFailure(error);
      }
    : undefined;

  const divider = (key: string) => (
    <li
      key={key}
      role="separator"
      aria-label="New since you were last here"
      className="flex items-center gap-2 text-[11px] font-medium text-[var(--fl-accent)]"
    >
      <span className="h-px flex-1 bg-[var(--fl-accent)] opacity-40" />
      New since you were last here
      <span className="h-px flex-1 bg-[var(--fl-accent)] opacity-40" />
    </li>
  );

  return (
    <LinksContext.Provider value={links ?? null}>
      <ol
        className="space-y-4"
        onClick={(event) => {
          if (!links) return;
          const anchor = (event.target as Element).closest?.("a[data-wikilink]");
          const target = anchor?.getAttribute("data-wikilink");
          if (!target) return;
          event.preventDefault();
          links.open(target);
        }}
      >
        {failure && (
          <li role="alert" className="text-[11.5px] text-[var(--fl-danger)]">
            {failure}
          </li>
        )}

        {opening && (
          <li>
            <Message
              message={{
                id: `${discussion.id}-opening`,
                author: discussion.author,
                body: opening,
                createdAt: discussion.createdAt,
                url: discussion.url,
                isAnswer: false,
                isMinimized: false,
                viewerDidAuthor: discussion.viewerDidAuthor,
                replies: [],
                replyCount: 0,
                canMarkAnswer: false,
                canUnmarkAnswer: false,
              }}
              label="Opening post"
            />
          </li>
        )}

        {discussion.commentCount > discussion.comments.length && (
          <li className="text-center text-[11.5px] text-[var(--fl-muted)]">
            <a
              href={discussion.url}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {discussion.commentCount - discussion.comments.length} earlier messages on GitHub ↗
            </a>
          </li>
        )}

        {discussion.comments.flatMap((comment) => {
          const items = [];
          if (comment.id === firstNew) items.push(divider(`new-${comment.id}`));
          items.push(
            <li key={comment.id}>
              <Message
                message={comment}
                onReply={onReply ? () => onReply(comment) : undefined}
                onAnswer={
                  answer &&
                  discussion.answerable &&
                  (comment.canMarkAnswer || comment.canUnmarkAnswer)
                    ? (value) => void answer(comment, value)
                    : undefined
                }
                answering={answering === comment.id}
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
                  {comment.replies.flatMap((reply) => [
                    ...(reply.id === firstNew ? [divider(`new-${reply.id}`)] : []),
                    <li key={reply.id}>
                      <Message message={reply} />
                    </li>,
                  ])}
                </ol>
              )}
            </li>,
          );
          return items;
        })}
      </ol>
    </LinksContext.Provider>
  );
}

function Message({
  message,
  onReply,
  onAnswer,
  answering = false,
  label,
}: {
  message: DiscussionCommentDto;
  onReply?: () => void;
  onAnswer?: (answer: boolean) => void;
  answering?: boolean;
  label?: string;
}) {
  const [shown, setShown] = useState(!message.isMinimized);
  const links = useContext(LinksContext);
  const login = message.author?.login ?? "ghost";

  return (
    <article className="group flex gap-2" aria-label={label}>
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
            dangerouslySetInnerHTML={{
              __html: markdownToHtml(
                message.body,
                links ? { resolveWikilink: links.resolve } : undefined,
              ),
            }}
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

        {(onReply || onAnswer) && (
          <div className="mt-0.5 flex gap-1 text-[11.5px] text-[var(--fl-muted)] opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {onReply && (
              <button
                type="button"
                onClick={onReply}
                className="rounded px-1 hover:text-[var(--fl-text)]"
              >
                Reply
              </button>
            )}
            {onAnswer && message.isAnswer && message.canUnmarkAnswer && (
              <button
                type="button"
                disabled={answering}
                onClick={() => onAnswer(false)}
                className="rounded px-1 hover:text-[var(--fl-text)] disabled:opacity-50"
              >
                {answering ? "Saving…" : "Unmark answer"}
              </button>
            )}
            {onAnswer && !message.isAnswer && message.canMarkAnswer && (
              <button
                type="button"
                disabled={answering}
                onClick={() => onAnswer(true)}
                className="rounded px-1 hover:text-[var(--fl-text)] disabled:opacity-50"
              >
                {answering ? "Saving…" : "Mark as answer"}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── The composer ──────────────────────────────────────────────────────────

export interface ComposerProps {
  /** Sends; resolves to a reason it did not, or null once it has. */
  onSend: (body: string, replyTo?: string) => Promise<string | null>;
  sending?: boolean;
  replyTo: DiscussionCommentDto | null;
  onCancelReply: () => void;
  /** Bumped to move the cursor into the box — when Reply is pressed. */
  focusKey?: number | string;
  placeholder?: string;
}

export function Composer({
  onSend,
  sending = false,
  replyTo,
  onCancelReply,
  focusKey = 0,
  placeholder = "Write a message… Markdown works",
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [box, setBox] = useState<HTMLTextAreaElement | null>(null);
  const working = sending || busy;

  useEffect(() => {
    if (focusKey) box?.focus();
  }, [focusKey, box]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || working) return;
    setFailure(null);
    setBusy(true);
    const error = await onSend(body, replyTo?.id);
    setBusy(false);
    if (error) {
      // The draft stays: a message that did not send is one nobody should
      // have to type twice.
      setFailure(error);
      return;
    }
    setDraft("");
    onCancelReply();
  };

  return (
    <>
      {replyTo && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-[var(--fl-muted)]">
          <span className="min-w-0 flex-1 truncate">
            Replying to @{replyTo.author?.login ?? "ghost"}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel the reply"
            className="rounded px-1 hover:text-[var(--fl-text)]"
          >
            ✕
          </button>
        </div>
      )}

      <textarea
        ref={setBox}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter is a new line, because a message is Markdown and Markdown
          // is written in lines; ⌘↵ sends, as on GitHub.
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
          if (event.key === "Escape" && replyTo) onCancelReply();
        }}
        rows={3}
        placeholder={replyTo ? "Write a reply…" : placeholder}
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
          disabled={!draft.trim() || working}
          className="fl-btn fl-btn-primary disabled:opacity-50"
        >
          {working ? "Sending…" : replyTo ? "Reply" : "Send"}
        </button>
      </div>
    </>
  );
}
