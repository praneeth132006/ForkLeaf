import type { DiscussionCommentDto, NoteDiscussionDto } from "@forkleaf/github-client";

/**
 * The bookkeeping behind a note's conversation that is not a network call:
 * what counts as unread, and what this device remembers between visits.
 *
 * Both memories are per device and disposable. The discussion number is only
 * a hint the server checks; the "seen up to" time only decides a badge. Losing
 * either costs one extra request or one stale badge, never a message.
 */

/** Every message in a discussion, replies included, in no particular order. */
export function allMessages(discussion: NoteDiscussionDto): DiscussionCommentDto[] {
  return discussion.comments.flatMap((comment) => [comment, ...comment.replies]);
}

/** When the newest message was posted, or null for a discussion with none. */
export function latestMessageAt(discussion: NoteDiscussionDto): string | null {
  let latest: string | null = null;
  for (const message of allMessages(discussion)) {
    if (latest === null || message.createdAt > latest) latest = message.createdAt;
  }
  return latest;
}

/**
 * Messages from other people posted after `seenAt`.
 *
 * Your own messages are never unread — you wrote them. A conversation never
 * opened on this device counts everybody else's messages, which is what
 * "unread" means.
 */
export function countUnread(discussion: NoteDiscussionDto, seenAt: string | null): number {
  return allMessages(discussion).filter(
    (message) => !message.viewerDidAuthor && (seenAt === null || message.createdAt > seenAt),
  ).length;
}

/**
 * Puts a just-posted message where the next read would put it.
 *
 * GitHub answers the post with the comment itself, so it can be shown at once
 * instead of after the next poll. A duplicate — the poll got there first — is
 * dropped rather than shown twice.
 */
export function withMessage(
  discussion: NoteDiscussionDto,
  message: DiscussionCommentDto,
  replyTo: string | undefined,
): NoteDiscussionDto {
  if (allMessages(discussion).some((existing) => existing.id === message.id)) return discussion;

  if (replyTo) {
    return {
      ...discussion,
      comments: discussion.comments.map((comment) =>
        comment.id === replyTo
          ? {
              ...comment,
              replies: [...comment.replies, message],
              replyCount: comment.replyCount + 1,
            }
          : comment,
      ),
    };
  }

  return {
    ...discussion,
    comments: [...discussion.comments, message],
    commentCount: discussion.commentCount + 1,
  };
}

// ─── What this device remembers ─────────────────────────────────────────────

function numberKey(owner: string, repo: string, path: string): string {
  return `forkleaf:conversation:${owner}/${repo}:${path}`;
}

function seenKey(owner: string, repo: string, number: number): string {
  return `forkleaf:conversation-seen:${owner}/${repo}#${number}`;
}

/** Storage can be refused outright — private windows, blocked site data. */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A badge that resets is the whole cost of a device that will not store.
  }
}

export function rememberedNumber(owner: string, repo: string, path: string): number | undefined {
  const value = Number(read(numberKey(owner, repo, path)));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function rememberNumber(owner: string, repo: string, path: string, number: number): void {
  write(numberKey(owner, repo, path), String(number));
}

export function seenUpTo(owner: string, repo: string, number: number): string | null {
  return read(seenKey(owner, repo, number));
}

/** Moves the "seen" mark forward. Never back: two tabs must not fight over it. */
export function markSeenUpTo(owner: string, repo: string, number: number, at: string): void {
  const current = seenUpTo(owner, repo, number);
  if (current === null || at > current) write(seenKey(owner, repo, number), at);
}
