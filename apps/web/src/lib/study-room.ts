/**
 * Study rooms: a leaderboard for everybody studying the same shared deck.
 *
 * A deck shared from ForkLeaf is a public GitHub repository, and everybody who
 * copied it can find it again. The room is one discussion in that repository,
 * called "Study room"; each member keeps one comment in it saying how their
 * studying is going, which ForkLeaf rewrites in place whenever they bring it
 * up to date. The leaderboard is read from those comments.
 *
 * So there is no server, no sign-up and nothing to moderate that GitHub does
 * not already moderate — and the room reads as a perfectly good conversation
 * on github.com, because every progress line is written for people first and
 * carries its numbers in a comment only ForkLeaf reads.
 */

export const ROOM_TITLE = "Study room";
const ROOM_MARKER = "<!-- forkleaf:study-room -->";
const PROGRESS = /<!--\s*forkleaf:study-progress v1 (\{[^}]*\})\s*-->/;

export interface StudyProgress {
  /** Cards reviewed in the last seven days, across the member's notebook. */
  week: number;
  /** Days in a row with at least one review. */
  streak: number;
  /** Cards from this deck the member has learned well (three weeks between reviews). */
  mastered: number;
  /** Cards from this deck in the member's note. */
  cards: number;
  /** `YYYY-MM-DD` the line was last brought up to date. */
  on: string;
}

export interface RoomMember extends StudyProgress {
  login: string;
  avatarUrl: string | null;
  isViewer: boolean;
  commentId: string;
}

/** What opens the room, written for whoever reads it on GitHub. */
export function roomBody(deck: string): string {
  return [
    `Everyone studying **${deck}** keeps one comment here saying how it is going: cards reviewed this week, their streak, and how much of the deck they have mastered.`,
    "",
    "ForkLeaf keeps your line up to date when you press *Share my progress* in the deck. Say hello below too — anything that is not a progress line is just conversation.",
    "",
    ROOM_MARKER,
  ].join("\n");
}

export function isRoom(thread: { title: string; body?: string | null }): boolean {
  return thread.title === ROOM_TITLE && (thread.body == null || thread.body.includes(ROOM_MARKER));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** A member's progress line: readable on GitHub, with the numbers kept for ForkLeaf. */
export function progressComment(progress: StudyProgress): string {
  const numbers = JSON.stringify({
    week: progress.week,
    streak: progress.streak,
    mastered: progress.mastered,
    cards: progress.cards,
    on: progress.on,
  });
  return [
    `Reviewed ${plural(progress.week, "card")} this week · ${progress.streak}-day streak · ${progress.mastered} of ${plural(progress.cards, "card")} mastered`,
    "",
    `<sub>Updated ${progress.on} from ForkLeaf</sub>`,
    "",
    `<!-- forkleaf:study-progress v1 ${numbers} -->`,
  ].join("\n");
}

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

/** The numbers in a progress line, or null for an ordinary comment. */
export function readProgress(body: string): StudyProgress | null {
  const match = PROGRESS.exec(body);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]!) as Record<string, unknown>;
    return {
      week: count(data.week),
      streak: count(data.streak),
      mastered: count(data.mastered),
      cards: count(data.cards),
      on: typeof data.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.on) ? data.on : "",
    };
  } catch {
    return null;
  }
}

export interface RoomComment {
  id: string;
  body: string;
  createdAt: string;
  viewerDidAuthor: boolean;
  author: { login: string; avatarUrl: string } | null;
}

/**
 * The leaderboard: one row per member, from their newest progress line, most
 * reviewed this week first, then the longer streak, then the more mastered.
 */
export function leaderboard(comments: readonly RoomComment[]): RoomMember[] {
  const newest = new Map<string, RoomMember & { at: string }>();
  for (const comment of comments) {
    const login = comment.author?.login;
    const progress = readProgress(comment.body);
    if (!login || !progress) continue;
    const previous = newest.get(login);
    if (previous && previous.at >= comment.createdAt) continue;
    newest.set(login, {
      ...progress,
      login,
      avatarUrl: comment.author?.avatarUrl ?? null,
      isViewer: comment.viewerDidAuthor,
      commentId: comment.id,
      at: comment.createdAt,
    });
  }
  return [...newest.values()]
    .sort(
      (a, b) =>
        b.week - a.week ||
        b.streak - a.streak ||
        b.mastered - a.mastered ||
        a.login.localeCompare(b.login),
    )
    .map((entry) => {
      const { at, ...member } = entry;
      void at;
      return member;
    });
}

/** The viewer's own progress comment, to rewrite rather than add another. */
export function viewersProgressComment(comments: readonly RoomComment[]): RoomComment | null {
  const mine = comments
    .filter((comment) => comment.viewerDidAuthor && readProgress(comment.body))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return mine[0] ?? null;
}

/** How long ago a progress line was updated, said plainly. */
export function freshness(on: string, today: string): string {
  if (!on) return "";
  const days = Math.round((Date.parse(today) - Date.parse(on)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
