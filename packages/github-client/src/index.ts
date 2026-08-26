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
} from "./client";

export { Transport, type RateLimit, type TransportConfig, type HttpResponse } from "./http";
export { GitHubError, asGitHubError, errorCodeForStatus } from "./errors";
export { encodeBase64, decodeBase64 } from "./base64";
