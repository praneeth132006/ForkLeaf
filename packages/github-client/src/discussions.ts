import type { GitHubErrorCode } from "@forkleaf/types";
import { GitHubError } from "./errors";

/**
 * A note's conversation, kept in the repository's GitHub Discussions.
 *
 * Discussions rather than a table of our own, because a notebook in ForkLeaf
 * is a repository the reader owns: the conversation about a note belongs
 * beside it, readable and answerable on github.com and in GitHub's phone app,
 * and still there if ForkLeaf is not. Nothing here stores a message anywhere
 * but GitHub.
 *
 * Discussions exist only in GitHub's GraphQL API, so this is the one corner of
 * the client that speaks it.
 */

/** One entry in GraphQL's `errors` array. */
export interface GraphQLErrorEntry {
  type?: string;
  message?: string;
  path?: (string | number)[];
}

/** Runs one GraphQL document. `write` marks a mutation that must not be retried. */
export type GraphQLRunner = <T>(
  query: string,
  variables: Record<string, unknown>,
  options?: { write?: boolean; allowPartial?: boolean },
) => Promise<T>;

export interface DiscussionAuthorDto {
  login: string;
  avatarUrl: string;
  url: string;
}

export interface DiscussionCommentDto {
  id: string;
  /** Null for a deleted account, which GitHub shows as "ghost". */
  author: DiscussionAuthorDto | null;
  body: string;
  createdAt: string;
  url: string;
  isAnswer: boolean;
  /** Hidden by a maintainer: shown collapsed, as GitHub does. */
  isMinimized: boolean;
  viewerDidAuthor: boolean;
  /** Replies to this comment, oldest first. Always empty on a reply. */
  replies: DiscussionCommentDto[];
  /** Every reply, including any too old to be in `replies`. */
  replyCount: number;
  /**
   * Whether the signed-in account may mark this as the answer, or take that
   * back. GitHub decides — the discussion's author and maintainers, in a
   * category that takes answers — and says so per comment.
   */
  canMarkAnswer: boolean;
  canUnmarkAnswer: boolean;
}

export interface NoteDiscussionDto {
  id: string;
  number: number;
  title: string;
  url: string;
  locked: boolean;
  category: string;
  /** Whether the category takes answers — Q&A, usually. */
  answerable: boolean;
  /** The opening post. For a conversation ForkLeaf opened, mostly the marker. */
  body: string;
  author: DiscussionAuthorDto | null;
  createdAt: string;
  viewerDidAuthor: boolean;
  /** The note this discussion is about, when ForkLeaf opened it for one. */
  notePath: string | null;
  /** The most recent comments, oldest first. */
  comments: DiscussionCommentDto[];
  /** Every top-level comment, including any too old to be in `comments`. */
  commentCount: number;
}

export interface DiscussionCategoryDto {
  id: string;
  name: string;
  slug: string;
  /** The category's emoji as a character, when GitHub gave one. */
  emoji?: string;
  /** Whether threads in it can have an answer marked. */
  answerable?: boolean;
}

/** One discussion in a list: enough to show it and to tell whether it is unread. */
export interface ThreadSummaryDto {
  id: string;
  number: number;
  title: string;
  url: string;
  category: DiscussionCategoryDto;
  author: DiscussionAuthorDto | null;
  createdAt: string;
  /**
   * When the newest message was posted — the opening post, the newest
   * comment or the newest reply to it. Not `updatedAt`, which an edit bumps.
   */
  lastActivityAt: string;
  /** Whether that newest message is the signed-in account's own. */
  lastByViewer: boolean;
  commentCount: number;
  answered: boolean;
  locked: boolean;
  notePath: string | null;
}

export interface LoungeDto {
  repo: DiscussionRepoDto;
  threads: ThreadSummaryDto[];
  /** Pass back as `after` for the next, older page. Null when there is none. */
  nextCursor: string | null;
}

export interface DiscussionRepoDto {
  id: string;
  url: string;
  private: boolean;
  /** Whether Discussions is switched on in the repository's settings. */
  enabled: boolean;
  /** Whether the signed-in account may start a conversation or reply. */
  canComment: boolean;
  categories: DiscussionCategoryDto[];
}

export interface NoteConversationDto {
  repo: DiscussionRepoDto;
  discussion: NoteDiscussionDto | null;
}

/** How many comments and replies one read brings back. */
const COMMENT_PAGE = 50;
const REPLY_PAGE = 30;

/** GitHub's own limits. */
export const MAX_DISCUSSION_TITLE = 256;
export const MAX_DISCUSSION_BODY = 65_536;

// ─── The marker ────────────────────────────────────────────────────────────

/**
 * The line in a discussion's body that says which note it is about.
 *
 * An HTML comment, so github.com renders nothing for it, and the path is
 * percent-encoded so no file name — not even one containing `-->` — can end
 * the comment early or spoof another note's marker.
 */
export function noteMarker(path: string): string {
  return `<!-- forkleaf:note ${encodeURIComponent(path)} -->`;
}

/** Whether a discussion body is the conversation about `path`. */
export function isNoteDiscussion(body: string, path: string): boolean {
  return body.includes(noteMarker(path));
}

/**
 * The note a discussion is about, read back out of its marker. Null for a
 * discussion somebody started on github.com, or a marker that does not decode.
 */
export function notePathOf(body: string): string | null {
  const match = /<!-- forkleaf:note (\S+) -->/.exec(body);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/** GitHub sends a category's emoji as markup around the character. */
export function emojiFromHtml(html: string | null | undefined): string {
  return (html ?? "").replace(/<[^>]*>/g, "").trim();
}

/**
 * The category a new conversation goes in.
 *
 * General first, because that is what a conversation about a note is. Never
 * Announcements, where only maintainers may post, or Polls, which GitHub will
 * not let the API create.
 */
export function pickCategory(categories: DiscussionCategoryDto[]): DiscussionCategoryDto | null {
  const usable = categories.filter((c) => !["announcements", "polls"].includes(c.slug));
  return (
    usable.find((c) => c.slug === "general") ??
    usable.find((c) => c.slug === "ideas") ??
    usable[0] ??
    null
  );
}

/** The opening post: a sentence for github.com, and the marker. */
export function discussionBody(options: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}): string {
  const file = `https://github.com/${options.owner}/${options.repo}/blob/${encodeURIComponent(
    options.branch,
  )}/${options.path.split("/").map(encodeURIComponent).join("/")}`;
  // Backticks in a file name would close the code span early.
  const shown = options.path.replace(/`/g, "'");
  return [
    `Conversation about the note [\`${shown}\`](${file}), started in [ForkLeaf](https://www.forkleaf.in).`,
    "",
    noteMarker(options.path),
  ].join("\n");
}

// ─── GraphQL ───────────────────────────────────────────────────────────────

const COMMENT_FIELDS = `
  id body createdAt url isAnswer isMinimized viewerDidAuthor
  viewerCanMarkAsAnswer viewerCanUnmarkAsAnswer
  author { login avatarUrl url }
`;

const CATEGORY_FIELDS = `id name slug emojiHTML isAnswerable`;

const REPO_FIELDS = `
  id url isPrivate hasDiscussionsEnabled viewerPermission
  discussionCategories(first: 25) { nodes { ${CATEGORY_FIELDS} } }
`;

const THREAD_FIELDS = `
  id number title url body locked createdAt viewerDidAuthor
  author { login avatarUrl url }
  category { name isAnswerable }
  comments(last: ${COMMENT_PAGE}) {
    totalCount
    nodes {
      ${COMMENT_FIELDS}
      replies(last: ${REPLY_PAGE}) { totalCount nodes { ${COMMENT_FIELDS} } }
    }
  }
`;

const THREAD_QUERY = `
  query ForkLeafNoteThread($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      ${REPO_FIELDS}
      discussion(number: $number) { ${THREAD_FIELDS} }
    }
  }
`;

/**
 * Finding a note's discussion when its number is not known.
 *
 * Two places to look, in one request. The most recently active discussions
 * catch a conversation started a moment ago, which GitHub's search index can
 * take a minute to learn about; search catches an old one that has drifted
 * past the first page. Search is allowed to fail on its own — an index that
 * is behind is not a reason to show nothing.
 */
const LOOKUP_QUERY = `
  query ForkLeafNoteLookup($owner: String!, $repo: String!, $search: String!) {
    repository(owner: $owner, name: $repo) {
      ${REPO_FIELDS}
      discussions(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes { number body }
      }
    }
    search(type: DISCUSSION, query: $search, first: 10) {
      nodes { ... on Discussion { number body repository { nameWithOwner } } }
    }
  }
`;

const CREATE_MUTATION = `
  mutation ForkLeafStartConversation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
    createDiscussion(input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }) {
      discussion { id number }
    }
  }
`;

/** Every discussion, newest activity first, optionally in one category. */
const LOUNGE_QUERY = `
  query ForkLeafLounge($owner: String!, $repo: String!, $categoryId: ID, $after: String) {
    repository(owner: $owner, name: $repo) {
      ${REPO_FIELDS}
      discussions(first: 40, after: $after, categoryId: $categoryId, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id number title url body createdAt locked isAnswered viewerDidAuthor
          author { login avatarUrl url }
          category { ${CATEGORY_FIELDS} }
          comments(last: 1) {
            totalCount
            nodes { createdAt viewerDidAuthor replies(last: 1) { nodes { createdAt viewerDidAuthor } } }
          }
        }
      }
    }
  }
`;

const MARK_ANSWER_MUTATION = `
  mutation ForkLeafMarkAnswer($id: ID!) {
    markDiscussionCommentAsAnswer(input: { id: $id }) { discussion { id } }
  }
`;

const UNMARK_ANSWER_MUTATION = `
  mutation ForkLeafUnmarkAnswer($id: ID!) {
    unmarkDiscussionCommentAsAnswer(input: { id: $id }) { discussion { id } }
  }
`;

const COMMENT_MUTATION = `
  mutation ForkLeafComment($discussionId: ID!, $body: String!, $replyToId: ID) {
    addDiscussionComment(input: { discussionId: $discussionId, body: $body, replyToId: $replyToId }) {
      comment { ${COMMENT_FIELDS} }
    }
  }
`;

interface ApiAuthor {
  login: string;
  avatarUrl: string;
  url: string;
}

interface ApiComment {
  id: string;
  body: string;
  createdAt: string;
  url: string;
  isAnswer?: boolean;
  isMinimized: boolean;
  viewerDidAuthor: boolean;
  viewerCanMarkAsAnswer?: boolean;
  viewerCanUnmarkAsAnswer?: boolean;
  author: ApiAuthor | null;
  replies?: { totalCount: number; nodes: (ApiComment | null)[] };
}

interface ApiCategory {
  id: string;
  name: string;
  slug: string;
  emojiHTML?: string | null;
  isAnswerable?: boolean;
}

interface ApiActivity {
  createdAt: string;
  viewerDidAuthor: boolean;
}

interface ApiThreadSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  body: string;
  createdAt: string;
  locked: boolean;
  isAnswered: boolean | null;
  viewerDidAuthor: boolean;
  author: ApiAuthor | null;
  category: ApiCategory;
  comments: {
    totalCount: number;
    nodes: ((ApiActivity & { replies?: { nodes: (ApiActivity | null)[] } }) | null)[];
  };
}

interface LoungeResponse {
  repository:
    | (ApiRepo & {
        discussions: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: (ApiThreadSummary | null)[];
        };
      })
    | null;
}

interface ApiThread {
  id: string;
  number: number;
  title: string;
  url: string;
  body: string;
  locked: boolean;
  createdAt?: string;
  viewerDidAuthor?: boolean;
  author?: ApiAuthor | null;
  category: { name: string; isAnswerable?: boolean } | null;
  comments: { totalCount: number; nodes: (ApiComment | null)[] };
}

interface ApiRepo {
  id: string;
  url: string;
  isPrivate: boolean;
  hasDiscussionsEnabled: boolean;
  viewerPermission: string | null;
  discussionCategories: { nodes: (ApiCategory | null)[] };
}

interface ThreadResponse {
  repository: (ApiRepo & { discussion: ApiThread | null }) | null;
}

interface LookupResponse {
  repository:
    (ApiRepo & { discussions: { nodes: ({ number: number; body: string } | null)[] } }) | null;
  search: {
    nodes: ({ number?: number; body?: string; repository?: { nameWithOwner: string } } | null)[];
  } | null;
}

/** Maps GraphQL's error `type` onto the codes the rest of the app branches on. */
export function codeForGraphQLType(type: string | undefined): GitHubErrorCode {
  switch (type) {
    case "NOT_FOUND":
      return "not-found";
    case "FORBIDDEN":
      return "forbidden";
    case "RATE_LIMITED":
      return "rate-limited";
    case "UNPROCESSABLE":
    case "ARGUMENT_ERROR":
    case "BAD_USER_INPUT":
      return "validation";
    default:
      return "unknown";
  }
}

function toRepo(repo: ApiRepo): DiscussionRepoDto {
  return {
    id: repo.id,
    url: repo.url,
    private: repo.isPrivate,
    enabled: repo.hasDiscussionsEnabled,
    // Anyone signed in can take part in a public repository's discussions; a
    // private one is its collaborators' alone, and GitHub reports no
    // permission at all for an account that is not one.
    canComment: repo.hasDiscussionsEnabled && (repo.viewerPermission !== null || !repo.isPrivate),
    categories: repo.discussionCategories.nodes
      .filter((c): c is ApiCategory => c !== null)
      .map(toCategory),
  };
}

function toCategory(category: ApiCategory): DiscussionCategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    emoji: emojiFromHtml(category.emojiHTML),
    answerable: category.isAnswerable ?? false,
  };
}

function toAuthor(author: ApiAuthor | null | undefined): DiscussionAuthorDto | null {
  return author ? { login: author.login, avatarUrl: author.avatarUrl, url: author.url } : null;
}

function toComment(comment: ApiComment): DiscussionCommentDto {
  return {
    id: comment.id,
    author: toAuthor(comment.author),
    body: comment.body,
    createdAt: comment.createdAt,
    url: comment.url,
    isAnswer: comment.isAnswer ?? false,
    isMinimized: comment.isMinimized,
    viewerDidAuthor: comment.viewerDidAuthor,
    replies: (comment.replies?.nodes ?? [])
      .filter((r): r is ApiComment => r !== null)
      .map((r) => toComment({ ...r, replies: undefined })),
    replyCount: comment.replies?.totalCount ?? 0,
    canMarkAnswer: comment.viewerCanMarkAsAnswer ?? false,
    canUnmarkAnswer: comment.viewerCanUnmarkAsAnswer ?? false,
  };
}

function toThread(thread: ApiThread): NoteDiscussionDto {
  return {
    id: thread.id,
    number: thread.number,
    title: thread.title,
    url: thread.url,
    locked: thread.locked,
    category: thread.category?.name ?? "",
    answerable: thread.category?.isAnswerable ?? false,
    body: thread.body,
    author: toAuthor(thread.author),
    createdAt: thread.createdAt ?? "",
    viewerDidAuthor: thread.viewerDidAuthor ?? false,
    notePath: notePathOf(thread.body),
    comments: thread.comments.nodes.filter((c): c is ApiComment => c !== null).map(toComment),
    commentCount: thread.comments.totalCount,
  };
}

function missingRepository(owner: string, repo: string): GitHubError {
  return new GitHubError("not-found", `Could not find the repository ${owner}/${repo}.`, 404);
}

/** Reads one discussion, and the repository's discussion settings with it. */
async function readThread(
  gql: GraphQLRunner,
  owner: string,
  repo: string,
  number: number,
): Promise<{ repo: DiscussionRepoDto; thread: ApiThread | null }> {
  // Partial: a discussion that has been deleted comes back as a NOT_FOUND
  // error beside a perfectly good repository, and the caller decides what a
  // missing discussion means.
  const data = await gql<ThreadResponse>(
    THREAD_QUERY,
    { owner, repo, number },
    { allowPartial: true },
  );
  if (!data.repository) throw missingRepository(owner, repo);
  return { repo: toRepo(data.repository), thread: data.repository.discussion };
}

/**
 * The conversation about one note, or `discussion: null` if nobody has
 * started one.
 *
 * `knownNumber` is the discussion the browser found last time. It is checked
 * against the marker rather than trusted — a number is only a hint, and the
 * discussion behind it may have been deleted, or the hint may be stale from a
 * note that was renamed — and the slower lookup runs whenever it does not hold.
 */
export async function findNoteConversation(
  gql: GraphQLRunner,
  options: { owner: string; repo: string; path: string; knownNumber?: number },
): Promise<NoteConversationDto> {
  const { owner, repo, path, knownNumber } = options;

  if (knownNumber !== undefined) {
    const known = await readThread(gql, owner, repo, knownNumber);
    if (known.thread && isNoteDiscussion(known.thread.body, path)) {
      return { repo: known.repo, discussion: toThread(known.thread) };
    }
  }

  const search = `repo:${owner}/${repo} in:body "forkleaf:note ${encodeURIComponent(path)}"`;
  const data = await gql<LookupResponse>(
    LOOKUP_QUERY,
    { owner, repo, search },
    { allowPartial: true },
  );
  if (!data.repository) throw missingRepository(owner, repo);

  const fullName = `${owner}/${repo}`.toLowerCase();
  const candidates = [
    ...data.repository.discussions.nodes,
    ...(data.search?.nodes ?? []).filter(
      (n) => n?.repository?.nameWithOwner.toLowerCase() === fullName,
    ),
  ];

  // The oldest match wins, so that two people starting a conversation at the
  // same moment both end up reading the first one.
  const numbers = candidates
    .filter((n): n is { number: number; body: string } =>
      Boolean(n && typeof n.number === "number" && typeof n.body === "string"),
    )
    .filter((n) => isNoteDiscussion(n.body, path))
    .map((n) => n.number)
    .sort((a, b) => a - b);

  const repoDto = toRepo(data.repository);
  if (numbers.length === 0) return { repo: repoDto, discussion: null };

  const found = await readThread(gql, owner, repo, numbers[0]!);
  return {
    repo: found.repo,
    discussion: found.thread ? toThread(found.thread) : null,
  };
}

/** Opens the discussion for a note. Returns its node id and number. */
export async function createNoteDiscussion(
  gql: GraphQLRunner,
  input: { repositoryId: string; categoryId: string; title: string; body: string },
): Promise<{ id: string; number: number }> {
  const data = await gql<{ createDiscussion: { discussion: { id: string; number: number } } }>(
    CREATE_MUTATION,
    { ...input, title: input.title.slice(0, MAX_DISCUSSION_TITLE) },
    { write: true },
  );
  return data.createDiscussion.discussion;
}

/** Posts a comment, or a reply when `replyToId` names a top-level comment. */
export async function addDiscussionComment(
  gql: GraphQLRunner,
  input: { discussionId: string; body: string; replyToId?: string },
): Promise<DiscussionCommentDto> {
  const data = await gql<{ addDiscussionComment: { comment: ApiComment } }>(
    COMMENT_MUTATION,
    { discussionId: input.discussionId, body: input.body, replyToId: input.replyToId ?? null },
    { write: true },
  );
  return toComment(data.addDiscussionComment.comment);
}

// ─── The Lounge: every conversation in the notebook ─────────────────────────

/** The newest message in a listed thread, and whose it was. */
function lastActivity(thread: ApiThreadSummary): { at: string; byViewer: boolean } {
  let at = thread.createdAt;
  let byViewer = thread.viewerDidAuthor;
  const last = thread.comments.nodes.find((n) => n !== null) ?? null;
  const candidates: ApiActivity[] = last
    ? [last, ...(last.replies?.nodes ?? []).filter((r): r is ApiActivity => r !== null)]
    : [];
  for (const candidate of candidates) {
    if (candidate.createdAt > at) {
      at = candidate.createdAt;
      byViewer = candidate.viewerDidAuthor;
    }
  }
  return { at, byViewer };
}

function toSummary(thread: ApiThreadSummary): ThreadSummaryDto {
  const last = lastActivity(thread);
  return {
    id: thread.id,
    number: thread.number,
    title: thread.title,
    url: thread.url,
    category: toCategory(thread.category),
    author: toAuthor(thread.author),
    createdAt: thread.createdAt,
    lastActivityAt: last.at,
    lastByViewer: last.byViewer,
    commentCount: thread.comments.totalCount,
    answered: thread.isAnswered ?? false,
    locked: thread.locked,
    notePath: notePathOf(thread.body),
  };
}

/**
 * The notebook's discussions, most recently active first.
 *
 * Ordered by GitHub's `updatedAt`, which moves with any activity; each thread
 * also carries when its newest message was posted, which is what "unread"
 * is measured against, because an edit moves `updatedAt` too.
 */
export async function listDiscussions(
  gql: GraphQLRunner,
  options: { owner: string; repo: string; categoryId?: string; after?: string },
): Promise<LoungeDto> {
  const data = await gql<LoungeResponse>(LOUNGE_QUERY, {
    owner: options.owner,
    repo: options.repo,
    categoryId: options.categoryId ?? null,
    after: options.after ?? null,
  });
  if (!data.repository) throw missingRepository(options.owner, options.repo);

  const page = data.repository.discussions;
  return {
    repo: toRepo(data.repository),
    threads: page.nodes.filter((n): n is ApiThreadSummary => n !== null).map(toSummary),
    nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null,
  };
}

/** One discussion, whatever started it, with the repository's settings. */
export async function readDiscussion(
  gql: GraphQLRunner,
  options: { owner: string; repo: string; number: number },
): Promise<NoteConversationDto> {
  const found = await readThread(gql, options.owner, options.repo, options.number);
  if (!found.thread) {
    throw new GitHubError("not-found", `Discussion #${options.number} is not there any more.`, 404);
  }
  return { repo: found.repo, discussion: toThread(found.thread) };
}

/** Marks a comment as the answer to its discussion, or takes that back. */
export async function setDiscussionAnswer(
  gql: GraphQLRunner,
  input: { commentId: string; answer: boolean },
): Promise<void> {
  await gql(
    input.answer ? MARK_ANSWER_MUTATION : UNMARK_ANSWER_MUTATION,
    { id: input.commentId },
    { write: true },
  );
}
