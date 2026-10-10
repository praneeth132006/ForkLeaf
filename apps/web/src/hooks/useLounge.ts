"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DiscussionRepoDto,
  NoteDiscussionDto,
  ThreadSummaryDto,
} from "@forkleaf/github-client";
import {
  ApiGatewayError,
  listLounge,
  readLoungeThread,
  replyInThread,
  setThreadAnswer,
  startThread,
} from "@/lib/gateway";
import {
  isThreadUnread,
  latestMessageAt,
  loungeBaseline,
  markSeenUpTo,
  seenUpTo,
  startLoungeBaseline,
  withMessage,
} from "@/lib/conversation";
import { latestVersion, type LiveActivity } from "@/hooks/useLiveActivity";

/**
 * Every conversation in the notebook, kept fresh while the Lounge is open.
 *
 * Two things are read, on two clocks: the list of threads every thirty
 * seconds, and the thread being read every fifteen — the same pace as a
 * note's conversation. Neither is read while the tab is in the background,
 * and both are read at once when it comes back.
 */

export const LIST_POLL_MS = 30_000;
export const THREAD_POLL_MS = 15_000;
/** While the live stream is connected, the timers are only a safety net. */
export const LIVE_POLL_MS = 120_000;

/** Failures that asking again on a timer will not fix. */
const STOPPING = new Set(["unauthorized", "forbidden", "discussions-forbidden", "not-found"]);

export interface LoungeError {
  code: string;
  message: string;
}

function asError(error: unknown): LoungeError {
  if (error instanceof ApiGatewayError) return { code: error.code, message: error.message };
  return { code: "unknown", message: "Could not reach GitHub. Try again." };
}

export type LoungeFilter = "all" | "unanswered";

interface ListState {
  key: string | null;
  status: "loading" | "ready" | "error";
  repo: DiscussionRepoDto | null;
  threads: ThreadSummaryDto[];
  nextCursor: string | null;
  error: LoungeError | null;
}

interface ThreadState {
  key: string | null;
  status: "loading" | "ready" | "error";
  discussion: NoteDiscussionDto | null;
  error: LoungeError | null;
}

/**
 * The newest first page, followed by anything older that was already loaded.
 * A poll refreshes what is on top without throwing away the pages somebody
 * scrolled down to read.
 */
function mergeFirstPage(fresh: ThreadSummaryDto[], loaded: ThreadSummaryDto[]): ThreadSummaryDto[] {
  const seen = new Set(fresh.map((thread) => thread.number));
  return [...fresh, ...loaded.filter((thread) => !seen.has(thread.number))];
}

export function useLounge(options: {
  target: { owner: string; repo: string } | null;
  /** Whether the Lounge is on screen. Nothing is read while it is not. */
  open: boolean;
  /** The repository's live stream, when there is one. */
  live?: LiveActivity;
}) {
  const { target, open, live } = options;
  const owner = target?.owner ?? "";
  const repo = target?.repo ?? "";

  const [channel, setChannelState] = useState<string | null>(null);
  const [filter, setFilter] = useState<LoungeFilter>("all");
  const [selected, setSelected] = useState<number | null>(null);
  /** Where the "new since you were last here" line goes, fixed when a thread is opened. */
  const [since, setSince] = useState<string | null>(null);
  const [list, setList] = useState<ListState>({
    key: null,
    status: "loading",
    repo: null,
    threads: [],
    nextCursor: null,
    error: null,
  });
  const [thread, setThread] = useState<ThreadState>({
    key: null,
    status: "loading",
    discussion: null,
    error: null,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [listTick, setListTick] = useState(0);
  const [threadTick, setThreadTick] = useState(0);

  const isLive = live?.status === "live";
  // Anything at all changes the list; only the open thread's news re-reads it.
  const listLive = latestVersion(live?.entries ?? []);

  const listKey = target && open ? `${owner}/${repo}#${channel ?? "all"}` : null;
  const threadKey = target && open && selected !== null ? `${owner}/${repo}#${selected}` : null;
  const threadLive = latestVersion(live?.entries ?? [], (entry) => entry.n === selected);

  // ── The list ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (listKey === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        const page = await listLounge({ owner, repo, ...(channel ? { category: channel } : {}) });
        if (cancelled) return;
        startLoungeBaseline(owner, repo, new Date().toISOString());
        setList((previous) => ({
          key: listKey,
          status: "ready",
          repo: page.repo,
          threads:
            previous.key === listKey
              ? mergeFirstPage(page.threads, previous.threads)
              : page.threads,
          nextCursor:
            previous.key === listKey && previous.threads.length > page.threads.length
              ? previous.nextCursor
              : page.nextCursor,
          error: null,
        }));
      } catch (error) {
        if (cancelled) return;
        const failure = asError(error);
        setList((previous) => ({
          ...(previous.key === listKey ? previous : { repo: null, threads: [], nextCursor: null }),
          key: listKey,
          status: "error",
          error: failure,
        }));
        if (STOPPING.has(failure.code)) return;
      }
      if (!cancelled) timer = setTimeout(() => void load(), isLive ? LIVE_POLL_MS : LIST_POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void load();
    };

    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [listKey, owner, repo, channel, listTick, listLive, isLive]);

  // ── The open thread ───────────────────────────────────────────────────────
  useEffect(() => {
    if (threadKey === null || selected === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        const found = await readLoungeThread({ owner, repo, number: selected });
        if (cancelled) return;
        const discussion = found.discussion;
        // Read because it is on screen — and only while the tab is visible,
        // which `load` has already checked.
        if (discussion) {
          markSeenUpTo(
            owner,
            repo,
            discussion.number,
            latestMessageAt(discussion) ?? discussion.createdAt,
          );
        }
        setThread({ key: threadKey, status: "ready", discussion, error: null });
      } catch (error) {
        if (cancelled) return;
        const failure = asError(error);
        setThread((previous) => ({
          key: threadKey,
          status: "error",
          discussion: previous.key === threadKey ? previous.discussion : null,
          error: failure,
        }));
        if (STOPPING.has(failure.code)) return;
      }
      if (!cancelled) timer = setTimeout(() => void load(), isLive ? LIVE_POLL_MS : THREAD_POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void load();
    };

    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [threadKey, owner, repo, selected, threadTick, threadLive, isLive]);

  // ── What the screen shows ─────────────────────────────────────────────────
  const listShown: ListState =
    list.key === listKey && listKey !== null
      ? list
      : { key: listKey, status: "loading", repo: null, threads: [], nextCursor: null, error: null };
  const threadShown: ThreadState =
    thread.key === threadKey && threadKey !== null
      ? thread
      : { key: threadKey, status: "loading", discussion: null, error: null };

  const baseline = target ? loungeBaseline(owner, repo) : null;
  const unread = new Set(
    listShown.threads
      .filter((t) => t.number !== selected)
      .filter((t) => isThreadUnread(t, seenUpTo(owner, repo, t.number), baseline))
      .map((t) => t.number),
  );
  const threads =
    filter === "unanswered"
      ? listShown.threads.filter((t) => t.category.answerable && !t.answered)
      : listShown.threads;

  // ── What the reader can do ────────────────────────────────────────────────
  const setChannel = useCallback((next: string | null) => {
    setChannelState(next);
  }, []);

  const select = useCallback(
    (number: number | null) => {
      // Fixed now, before opening the thread marks it read: the line has to
      // stay where the news started for as long as the thread is open.
      setSince(
        number === null ? null : (seenUpTo(owner, repo, number) ?? loungeBaseline(owner, repo)),
      );
      setSelected(number);
    },
    [owner, repo],
  );

  const loadMore = useCallback(async () => {
    if (!listShown.nextCursor || loadingMore || listKey === null) return;
    setLoadingMore(true);
    try {
      const page = await listLounge({
        owner,
        repo,
        after: listShown.nextCursor,
        ...(channel ? { category: channel } : {}),
      });
      setList((previous) =>
        previous.key !== listKey
          ? previous
          : {
              ...previous,
              threads: mergeFirstPage(previous.threads, page.threads),
              nextCursor: page.nextCursor,
            },
      );
    } catch (error) {
      setList((previous) => ({ ...previous, error: asError(error) }));
    } finally {
      setLoadingMore(false);
    }
  }, [listShown.nextCursor, loadingMore, listKey, owner, repo, channel]);

  const reply = useCallback(
    async (body: string, replyTo?: string): Promise<LoungeError | null> => {
      const discussion = threadShown.discussion;
      if (!discussion) return { code: "validation", message: "Open a thread first." };
      try {
        const { comment } = await replyInThread({
          owner,
          repo,
          discussionId: discussion.id,
          body,
          ...(replyTo ? { replyTo } : {}),
        });
        markSeenUpTo(owner, repo, discussion.number, comment.createdAt);
        setThread((previous) =>
          previous.key === threadKey && previous.discussion
            ? { ...previous, discussion: withMessage(previous.discussion, comment, replyTo) }
            : previous,
        );
        return null;
      } catch (error) {
        return asError(error);
      }
    },
    [threadShown.discussion, owner, repo, threadKey],
  );

  const setAnswer = useCallback(
    async (commentId: string, answer: boolean): Promise<LoungeError | null> => {
      try {
        await setThreadAnswer({ owner, repo, commentId, answer });
        // Marking one answer unmarks any other, and only GitHub knows which.
        setThreadTick((value) => value + 1);
        setListTick((value) => value + 1);
        return null;
      } catch (error) {
        return asError(error);
      }
    },
    [owner, repo],
  );

  const start = useCallback(
    async (input: {
      categoryId: string;
      title: string;
      body: string;
    }): Promise<LoungeError | null> => {
      const repository = listShown.repo;
      if (!repository) return { code: "validation", message: "The Lounge has not loaded yet." };
      try {
        const { number } = await startThread({
          owner,
          repo,
          repositoryId: repository.id,
          ...input,
        });
        setSince(null);
        setSelected(number);
        setListTick((value) => value + 1);
        return null;
      } catch (error) {
        return asError(error);
      }
    },
    [listShown.repo, owner, repo],
  );

  const refresh = useCallback(() => {
    setListTick((value) => value + 1);
    setThreadTick((value) => value + 1);
  }, []);

  return {
    list: listShown,
    threads,
    unread,
    channel,
    setChannel,
    filter,
    setFilter,
    selected,
    select,
    thread: threadShown,
    since,
    loadMore,
    loadingMore,
    reply,
    setAnswer,
    start,
    refresh,
  };
}

export type Lounge = ReturnType<typeof useLounge>;
