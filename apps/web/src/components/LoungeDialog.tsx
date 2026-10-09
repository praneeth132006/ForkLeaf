"use client";

import { useState } from "react";
import type {
  DiscussionCategoryDto,
  DiscussionCommentDto,
  NoteDiscussionDto,
  ThreadSummaryDto,
} from "@forkleaf/github-client";
import { Dialog } from "@/components/Dialog";
import { Composer, ThreadMessages } from "@/components/DiscussionThread";
import { DiscussionsOff, Empty } from "@/components/ConversationPanel";
import type { Lounge } from "@/hooks/useLounge";
import { relativeTime } from "@/lib/relative-time";

/**
 * The Lounge: every conversation in the notebook, in one place.
 *
 * A channel is a GitHub Discussions category and a thread is a discussion —
 * the ones opened about notes and the ones people started on github.com, side
 * by side. Channels on the left, threads in the middle, the thread being read
 * on the right; on a phone, one of those at a time.
 */

export interface LoungeDialogProps {
  lounge: Lounge;
  /** `owner/repo`, for the subtitle and the empty states. */
  repoName: string;
  onClose: () => void;
  /** Opens the note a thread is about. */
  onOpenNote: (path: string) => void;
  /** Keeps a thread as a note. */
  onSaveAsNote: (discussion: NoteDiscussionDto) => void;
}

/** Categories a thread can be started in: GitHub will not let the API open a poll. */
function startable(categories: DiscussionCategoryDto[]): DiscussionCategoryDto[] {
  return categories.filter((c) => c.slug !== "polls");
}

export function LoungeDialog({
  lounge,
  repoName,
  onClose,
  onOpenNote,
  onSaveAsNote,
}: LoungeDialogProps) {
  const [composing, setComposing] = useState(false);
  const { list, threads, unread, channel, filter, selected, thread } = lounge;
  const repo = list.repo;

  const unreadIn = (categoryId: string | null) =>
    list.threads.filter(
      (t) => unread.has(t.number) && (categoryId === null || t.category.id === categoryId),
    ).length;

  // Which pane a narrow screen shows: the thread once one is open, or the
  // form once one is being written, and the list otherwise.
  const narrowShowsDetail = composing || selected !== null;

  const body = (() => {
    if (list.status === "loading" && !repo) return <Empty>Opening the Lounge…</Empty>;
    if (!repo) {
      return (
        <Empty>
          <span className="block text-[var(--fl-text)]">
            {list.error?.message ?? "Could not open the Lounge."}
          </span>
          <button type="button" onClick={lounge.refresh} className="fl-btn fl-btn-ghost mt-3">
            Try again
          </button>
        </Empty>
      );
    }
    if (!repo.enabled) {
      return <DiscussionsOff repoName={repoName} url={repo.url} onCheck={lounge.refresh} />;
    }
    return null;
  })();

  return (
    <Dialog
      title="Lounge"
      subtitle={`Every conversation in ${repoName}, kept in its GitHub Discussions`}
      onClose={onClose}
      full
    >
      {body ? (
        <div className="flex-1 overflow-y-auto">{body}</div>
      ) : (
        <div className="flex min-h-0 w-full flex-col md:flex-row">
          {/* ── Channels ─────────────────────────────────────────────────── */}
          <nav
            aria-label="Channels"
            className={`shrink-0 border-[var(--fl-border)] md:flex md:w-52 md:flex-col md:border-r ${
              narrowShowsDetail ? "hidden" : "flex"
            } overflow-x-auto border-b p-2 md:overflow-y-auto md:border-b-0`}
          >
            <ul className="flex gap-1 md:flex-col">
              <ChannelItem
                label="All threads"
                emoji="#"
                active={channel === null && filter === "all"}
                unread={unreadIn(null)}
                onClick={() => {
                  lounge.setFilter("all");
                  lounge.setChannel(null);
                }}
              />
              <ChannelItem
                label="Unanswered"
                emoji="?"
                active={filter === "unanswered"}
                unread={0}
                onClick={() => {
                  lounge.setChannel(null);
                  lounge.setFilter("unanswered");
                }}
              />
              {repo!.categories.map((category) => (
                <ChannelItem
                  key={category.id}
                  label={category.name}
                  emoji={category.emoji || "#"}
                  active={channel === category.id && filter === "all"}
                  unread={unreadIn(category.id)}
                  onClick={() => {
                    lounge.setFilter("all");
                    lounge.setChannel(category.id);
                  }}
                />
              ))}
            </ul>
            {repo!.canComment && (
              <button
                type="button"
                onClick={() => {
                  lounge.select(null);
                  setComposing(true);
                }}
                className="fl-btn fl-btn-primary ml-2 shrink-0 md:mt-3 md:ml-0"
              >
                New thread
              </button>
            )}
          </nav>

          {/* ── Threads ──────────────────────────────────────────────────── */}
          <section
            aria-label="Threads"
            className={`min-h-0 flex-col border-[var(--fl-border)] md:flex md:w-80 md:shrink-0 md:border-r ${
              narrowShowsDetail ? "hidden" : "flex flex-1"
            }`}
          >
            {list.error && (
              <p
                role="status"
                className="border-b border-[var(--fl-border)] px-3 py-2 text-[11.5px] text-[var(--fl-muted)]"
              >
                Could not check for new threads: {list.error.message}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.status === "loading" && list.threads.length === 0 ? (
                <Empty>Loading threads…</Empty>
              ) : threads.length === 0 ? (
                <Empty>
                  {filter === "unanswered"
                    ? "Every question has an answer."
                    : "Nothing here yet. Start a thread, or talk about a note from its Chat tab."}
                </Empty>
              ) : (
                <ul>
                  {threads.map((item) => (
                    <ThreadItem
                      key={item.number}
                      thread={item}
                      active={item.number === selected}
                      unread={unread.has(item.number)}
                      onClick={() => {
                        setComposing(false);
                        lounge.select(item.number);
                      }}
                    />
                  ))}
                </ul>
              )}
              {list.nextCursor && (
                <div className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => void lounge.loadMore()}
                    disabled={lounge.loadingMore}
                    className="fl-btn fl-btn-ghost disabled:opacity-50"
                  >
                    {lounge.loadingMore ? "Loading…" : "Older threads"}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ── The thread, or a new one ─────────────────────────────────── */}
          <section
            aria-label="Thread"
            className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${narrowShowsDetail ? "flex" : "hidden"}`}
          >
            {composing ? (
              <NewThread
                categories={startable(repo!.categories)}
                initialCategory={channel}
                onBack={() => setComposing(false)}
                onStart={async (input) => {
                  const error = await lounge.start(input);
                  if (!error) setComposing(false);
                  return error?.message ?? null;
                }}
              />
            ) : selected === null ? (
              <div className="hidden flex-1 items-center md:flex">
                <Empty>Pick a thread to read it.</Empty>
              </div>
            ) : (
              <OpenThread
                // A reply half-started in one thread is not one for the next.
                key={selected}
                lounge={lounge}
                canWrite={repo!.canComment}
                onBack={() => lounge.select(null)}
                onOpenNote={onOpenNote}
                onSaveAsNote={onSaveAsNote}
                fallbackTitle={threads.find((t) => t.number === selected)?.title ?? ""}
                discussion={thread.discussion}
              />
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

function ChannelItem({
  label,
  emoji,
  active,
  unread,
  onClick,
}: {
  label: string;
  emoji: string;
  active: boolean;
  unread: number;
  onClick: () => void;
}) {
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors ${
          active
            ? "bg-[var(--fl-elevated)] font-medium text-[var(--fl-text)]"
            : "text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        }`}
      >
        <span aria-hidden="true" className="w-4 text-center">
          {emoji}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {unread > 0 && (
          <span
            aria-label={`${unread} unread`}
            className="min-w-[1.1rem] rounded-full bg-[var(--fl-accent)] px-1 text-center text-[10px] leading-[1.1rem] font-semibold text-[var(--fl-accent-contrast)]"
          >
            {unread}
          </span>
        )}
      </button>
    </li>
  );
}

function ThreadItem({
  thread,
  active,
  unread,
  onClick,
}: {
  thread: ThreadSummaryDto;
  active: boolean;
  unread: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={`flex w-full gap-2 border-b border-[var(--fl-border)] px-3 py-2.5 text-left transition-colors ${
          active ? "bg-[var(--fl-elevated)]" : "hover:bg-[var(--fl-elevated)]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-[var(--fl-accent)]" : ""}`}
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[13px] ${
              unread ? "font-semibold text-[var(--fl-text)]" : "text-[var(--fl-text)]"
            }`}
          >
            {thread.title}
            {unread && <span className="sr-only"> (unread)</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--fl-muted)]">
            <span>
              {thread.category.emoji ? `${thread.category.emoji} ` : ""}
              {thread.category.name}
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={thread.lastActivityAt}>{relativeTime(thread.lastActivityAt)}</time>
            <span aria-hidden="true">·</span>
            <span>
              {thread.commentCount} {thread.commentCount === 1 ? "reply" : "replies"}
            </span>
            {thread.answered && <span className="text-[var(--fl-accent)]">✓ Answered</span>}
            {thread.notePath && <span title={thread.notePath}>📝 Note</span>}
            {thread.locked && <span>🔒</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function OpenThread({
  lounge,
  discussion,
  fallbackTitle,
  canWrite,
  onBack,
  onOpenNote,
  onSaveAsNote,
}: {
  lounge: Lounge;
  discussion: NoteDiscussionDto | null;
  fallbackTitle: string;
  canWrite: boolean;
  onBack: () => void;
  onOpenNote: (path: string) => void;
  onSaveAsNote: (discussion: NoteDiscussionDto) => void;
}) {
  const [replyTo, setReplyTo] = useState<DiscussionCommentDto | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const writable = canWrite && discussion !== null && !discussion.locked;

  return (
    <>
      <header className="flex shrink-0 items-start gap-2 border-b border-[var(--fl-border)] px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to threads"
          className="-ml-1 rounded p-1 text-[var(--fl-muted)] hover:text-[var(--fl-text)] md:hidden"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-[var(--fl-text)]">
            {discussion?.title ?? fallbackTitle}
          </h3>
          {discussion && (
            <p className="mt-0.5 text-[11.5px] text-[var(--fl-muted)]">
              {discussion.category} ·{" "}
              <a href={discussion.url} target="_blank" rel="noreferrer" className="hover:underline">
                #{discussion.number} on GitHub ↗
              </a>
            </p>
          )}
        </div>
        {discussion?.notePath && (
          <button
            type="button"
            onClick={() => onOpenNote(discussion.notePath!)}
            className="fl-btn fl-btn-ghost shrink-0"
          >
            Open note
          </button>
        )}
        {discussion && (
          <button
            type="button"
            onClick={() => onSaveAsNote(discussion)}
            className="fl-btn fl-btn-ghost shrink-0"
          >
            Save as note
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[13px]">
        {lounge.thread.status === "loading" && !discussion ? (
          <Empty>Loading the thread…</Empty>
        ) : !discussion ? (
          <Empty>
            <span className="block text-[var(--fl-text)]">
              {lounge.thread.error?.message ?? "Could not load this thread."}
            </span>
            <button type="button" onClick={lounge.refresh} className="fl-btn fl-btn-ghost mt-3">
              Try again
            </button>
          </Empty>
        ) : (
          <ThreadMessages
            discussion={discussion}
            since={lounge.since}
            showOpening={!discussion.notePath}
            onReply={
              writable
                ? (comment) => {
                    setReplyTo(comment);
                    setFocusKey((key) => key + 1);
                  }
                : undefined
            }
            onAnswer={async (comment, answer) =>
              (await lounge.setAnswer(comment.id, answer))?.message ?? null
            }
          />
        )}
      </div>

      {discussion && (
        <div className="shrink-0 border-t border-[var(--fl-border)] px-4 py-2.5">
          {lounge.thread.status === "error" && lounge.thread.error && (
            <p role="status" className="mb-2 text-[11.5px] text-[var(--fl-muted)]">
              Could not check for new messages: {lounge.thread.error.message}
            </p>
          )}
          {writable ? (
            <Composer
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              focusKey={focusKey}
              onSend={async (body, to) => (await lounge.reply(body, to))?.message ?? null}
            />
          ) : (
            <p className="text-[12px] text-[var(--fl-muted)]">
              {discussion.locked
                ? "This thread has been locked on GitHub."
                : "Only this repository's collaborators can reply here."}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function NewThread({
  categories,
  initialCategory,
  onStart,
  onBack,
}: {
  categories: DiscussionCategoryDto[];
  initialCategory: string | null;
  onStart: (input: { categoryId: string; title: string; body: string }) => Promise<string | null>;
  onBack: () => void;
}) {
  const fallback =
    categories.find((c) => c.id === initialCategory) ??
    categories.find((c) => c.slug === "general") ??
    categories[0];
  const [categoryId, setCategoryId] = useState(fallback?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const ready = Boolean(categoryId && title.trim() && body.trim()) && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setFailure(null);
    const error = await onStart({ categoryId, title: title.trim(), body: body.trim() });
    setBusy(false);
    if (error) setFailure(error);
  };

  if (categories.length === 0) {
    return (
      <Empty>
        This repository has no Discussions category a thread can be started in. Add one on GitHub.
      </Empty>
    );
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to threads"
          className="-ml-1 rounded p-1 text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
        >
          ‹
        </button>
        <h3 className="text-[14px] font-semibold text-[var(--fl-text)]">New thread</h3>
      </div>

      <label className="block text-[12px] text-[var(--fl-muted)]">
        Channel
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="fl-input mt-1"
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.emoji ? `${category.emoji} ` : ""}
              {category.name}
              {category.answerable ? " — takes answers" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[12px] text-[var(--fl-muted)]">
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={256}
          placeholder="What is this about?"
          className="fl-input mt-1"
        />
      </label>

      <label className="block flex-1 text-[12px] text-[var(--fl-muted)]">
        Message
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          placeholder="Markdown works. [[Links to notes]] are kept as written."
          className="fl-input mt-1 resize-y"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
      </label>

      {failure && (
        <p role="alert" className="text-[11.5px] text-[var(--fl-danger)]">
          {failure}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className="fl-btn fl-btn-ghost">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!ready}
          className="fl-btn fl-btn-primary disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start thread"}
        </button>
      </div>
    </form>
  );
}
