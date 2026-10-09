export {
  GitHubClient,
  buildTree,
  type RepoSummary,
  type FileContent,
  type NoteCommit,
  type FileChange,
  type ContentEncoding,
  type CommitOptions,
  type CommitResult,
  type DirectoryEntry,
  type PagesSite,
  type PullRequestSummary,
  type PullRequestDetail,
  type ReviewCommentDto,
  type SubmittedReviewDto,
  type IssueCommentDto,
  type PullRequestFile,
  type CommitFile,
  type BranchComparison,
} from "./client";

export { Transport, type RateLimit, type TransportConfig, type HttpResponse } from "./http";
export { GitHubError, asGitHubError, errorCodeForStatus } from "./errors";
export { encodeBase64, decodeBase64 } from "./base64";

export {
  noteMarker,
  isNoteDiscussion,
  notePathOf,
  emojiFromHtml,
  pickCategory,
  discussionBody,
  MAX_DISCUSSION_TITLE,
  MAX_DISCUSSION_BODY,
  type DiscussionAuthorDto,
  type DiscussionCommentDto,
  type NoteDiscussionDto,
  type DiscussionCategoryDto,
  type DiscussionRepoDto,
  type NoteConversationDto,
  type ThreadSummaryDto,
  type LoungeDto,
} from "./discussions";
