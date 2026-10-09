"use client";

import { useCallback, useEffect, useState } from "react";
import type { ThreadSummaryDto } from "@forkleaf/github-client";
import {
  ApiGatewayError,
  readNoteConversation,
  type NoteConversationWithPassages,
  sendNoteMessage,
  setThreadAnswer,
} from "@/lib/gateway";
import {
  countUnread,
  isThreadUnread,
  latestMessageAt,
  markSeenUpTo,
  rememberNumber,
  rememberedNumber,
  seenUpTo,
  withMessage,
} from "@/lib/conversation";

/**
 * The conversation about the open note, kept fresh while it is open.
 *
 * GitHub has no way to push a new comment to a browser, so this asks: every
 * fifteen seconds while the conversation is on screen, every minute while it
 * is only a badge, and not at all while the tab is in the background. Coming
 * back to the tab asks at once. That is a handful of GraphQL points an hour
 * against a budget of five thousand.
 *
 * It lives with the editor rather than inside the panel, so the unread badge
 * on the Chat tab stays true while somebody is looking at something else.
 */

/** How often to look, by whether the conversation is on screen. */
export const POLL_ACTIVE_MS = 15_000;
export const POLL_IDLE_MS = 60_000;
/** After GitHub says "slow down". */
export const POLL_LIMITED_MS = 120_000;

/** Failures that asking again in fifteen seconds will not fix. */
const STOPPING = new Set(["unauthorized", "forbidden", "discussions-forbidden", "not-found"]);

export interface ConversationTarget {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  /** The note's title, used to name the discussion when it is first opened. */
  title: string;
}

export interface ConversationError {
  code: string;
  message: string;
}

export interface ConversationState {
  status: "loading" | "ready" | "error";
  conversation: NoteConversationWithPassages | null;
  error: ConversationError | null;
}

interface Stored extends ConversationState {
  /** Which note this state belongs to, so a stale answer is never shown for another. */
  key: string | null;
}

function asError(error: unknown): ConversationError {
  if (error instanceof ApiGatewayError) return { code: error.code, message: error.message };
  return { code: "unknown", message: "Could not reach the conversation. Try again." };
}

export function useNoteConversation(options: {
  /** Null when there is no conversation to have: no repository, no note. */
  target: ConversationTarget | null;
  /** Whether the conversation is on screen. */
  active: boolean;
}): {
  state: ConversationState;
  /** Messages from other people this device has not shown yet, passages included. */
  unread: number;
  /** Threads about passages of the note, newest activity first. */
  passages: ThreadSummaryDto[];
  /** Which of them have something new in them. */
  passageUnread: Set<number>;
  /** Opens a thread about a passage, with a first message. */
  sendPassage: (quote: string, body: string) => Promise<ConversationError | null>;
  sending: boolean;
  /** Posts a message. Resolves to an error to show, or null when it was sent. */
  send: (body: string, replyTo?: string) => Promise<ConversationError | null>;
  /**
   * Marks a message as the answer, or takes that back. Reads the conversation
   * again afterwards: marking one answer unmarks any other.
   */
  setAnswer: (commentId: string, answer: boolean) => Promise<ConversationError | null>;
  /** Asks GitHub again now. */
  refresh: () => void;
} {
  const { target, active } = options;
  const owner = target?.owner ?? "";
  const repo = target?.repo ?? "";
  const path = target?.path ?? "";
  const key = target ? `${owner}/${repo}:${path}` : null;

  const [stored, setStored] = useState<Stored>({
    key: null,
    status: "loading",
    conversation: null,
    error: null,
  });
  const [sending, setSending] = useState(false);
  /** Bumped to ask again at once — after a refresh, or a first message. */
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (key === null) return;

    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), ms);
    };

    const load = async () => {
      if (inFlight || cancelled) return;
      if (document.visibilityState === "hidden") return; // Picked up again on return.

      inFlight = true;
      let next = active ? POLL_ACTIVE_MS : POLL_IDLE_MS;
      try {
        const conversation = await readNoteConversation({
          owner,
          repo,
          path,
          number: rememberedNumber(owner, repo, path),
          passages: true,
        });
        if (cancelled) return;
        if (conversation.discussion) {
          rememberNumber(owner, repo, path, conversation.discussion.number);
        }
        // A passage search that failed this time keeps the list it found
        // last time, rather than emptying it.
        setStored((previous) => ({
          key,
          status: "ready",
          conversation:
            conversation.passages === null && previous.key === key && previous.conversation
              ? { ...conversation, passages: previous.conversation.passages ?? null }
              : conversation,
          error: null,
        }));
      } catch (error) {
        if (cancelled) return;
        const failure = asError(error);
        // What was last read stays on screen beneath the error: a dropped
        // connection is not a reason to blank a conversation.
        setStored((previous) => ({
          key,
          status: "error",
          conversation: previous.key === key ? previous.conversation : null,
          error: failure,
        }));
        if (STOPPING.has(failure.code)) return;
        if (failure.code === "rate-limited") next = POLL_LIMITED_MS;
      } finally {
        inFlight = false;
      }
      if (!cancelled) schedule(next);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };

    void load();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, owner, repo, path, active, tick]);

  // An answer for a different note is never shown — between switching notes
  // and the first read of the new one, this is a fresh "loading".
  const state: ConversationState =
    stored.key === key
      ? { status: stored.status, conversation: stored.conversation, error: stored.error }
      : { status: "loading", conversation: null, error: null };

  const discussion = state.conversation?.discussion ?? null;
  const latest = discussion ? latestMessageAt(discussion) : null;

  // On screen means read. Only while the tab is actually visible: a
  // conversation left open in a background tab has not been seen by anybody.
  useEffect(() => {
    if (!active || !discussion || latest === null) return;
    if (document.visibilityState !== "visible") return;
    markSeenUpTo(owner, repo, discussion.number, latest);
  }, [active, discussion, latest, owner, repo]);

  const passages = state.conversation?.passages ?? [];
  const passageUnread = new Set(
    passages
      .filter((thread) => isThreadUnread(thread, seenUpTo(owner, repo, thread.number), null))
      .map((thread) => thread.number),
  );
  const unread =
    (active || !discussion
      ? 0
      : countUnread(discussion, seenUpTo(owner, repo, discussion.number))) + passageUnread.size;

  const send = useCallback(
    async (body: string, replyTo?: string): Promise<ConversationError | null> => {
      if (!target) return { code: "validation", message: "Open a note first." };

      setSending(true);
      try {
        const known = discussion?.number ?? rememberedNumber(owner, repo, path);
        const { number, comment } = await sendNoteMessage({
          owner,
          repo,
          branch: target.branch,
          path,
          title: target.title,
          body,
          ...(known !== undefined ? { number: known } : {}),
          ...(replyTo ? { replyTo } : {}),
        });

        rememberNumber(owner, repo, path, number);
        markSeenUpTo(owner, repo, number, comment.createdAt);

        setStored((previous) => {
          const current = previous.key === key ? previous.conversation : null;
          if (!current?.discussion || current.discussion.number !== number) return previous;
          return {
            ...previous,
            conversation: {
              ...current,
              discussion: withMessage(current.discussion, comment, replyTo),
            },
          };
        });

        // The first message opened the discussion, which this page has not
        // read yet. Read it now rather than at the next poll.
        if (!discussion) setTick((value) => value + 1);
        return null;
      } catch (error) {
        return asError(error);
      } finally {
        setSending(false);
      }
    },
    [target, discussion, owner, repo, path, key],
  );

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  const setAnswer = useCallback(
    async (commentId: string, answer: boolean): Promise<ConversationError | null> => {
      try {
        await setThreadAnswer({ owner, repo, commentId, answer });
        setTick((value) => value + 1);
        return null;
      } catch (error) {
        return asError(error);
      }
    },
    [owner, repo],
  );

  const sendPassage = useCallback(
    async (quote: string, body: string): Promise<ConversationError | null> => {
      if (!target) return { code: "validation", message: "Open a note first." };
      setSending(true);
      try {
        const { number, comment } = await sendNoteMessage({
          owner,
          repo,
          branch: target.branch,
          path,
          title: target.title,
          body,
          passage: quote,
        });
        markSeenUpTo(owner, repo, number, comment.createdAt);
        // The new thread is in the next read of the passages, not this one.
        setTick((value) => value + 1);
        return null;
      } catch (error) {
        return asError(error);
      } finally {
        setSending(false);
      }
    },
    [target, owner, repo, path],
  );

  return {
    state,
    unread,
    passages,
    passageUnread,
    sending,
    send,
    sendPassage,
    setAnswer,
    refresh,
  };
}
