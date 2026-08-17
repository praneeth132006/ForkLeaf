/**
 * Shared domain model for ForkLeaf.
 *
 * Everything in here is deliberately serialisable: these objects travel between
 * the browser, IndexedDB and the GitHub API, so no class instances and no `Date`
 * objects (ISO strings only) — `structuredClone` must be able to round-trip them
 * for IndexedDB storage.
 */

// ─── Identity ───────────────────────────────────────────────────────────────

/** The signed-in GitHub user, as exposed to the browser. Never contains a token. */
export interface SessionUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** GitHub's numeric account id — stable even if the user renames themselves. */
  id: number;
}

/**
 * How the current session talks to GitHub.
 * - `github`  — real OAuth session, token held server-side in an encrypted cookie.
 * - `local`   — no GitHub account; notes live only in IndexedDB on this device.
 */
export type SessionMode = "github" | "local";

export interface Session {
  mode: SessionMode;
  user: SessionUser | null;
}

// ─── Workspaces and repositories ────────────────────────────────────────────

/** A pointer to a GitHub repository, and the subfolder within it that holds notes. */
export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
  /** Subfolder inside the repo that notes are stored under. "" means repo root. */
  directory: string;
}

/**
 * A workspace is one connected repository plus local presentation state.
 * Users can have several and switch between them.
 */
export interface Workspace {
  /** Stable local id: `${owner}/${repo}@${branch}:${directory}`. */
  id: string;
  name: string;
  repo: RepoRef;
  /** True for the repo ForkLeaf created on the user's behalf. */
  isDefault: boolean;
  /** True for the offline-only workspace used in local mode. */
  isLocal: boolean;
  createdAt: string;
  lastOpenedAt: string;
}

/** Builds the canonical workspace id for a repo reference. */
export function workspaceId(repo: RepoRef): string {
  return `${repo.owner}/${repo.repo}@${repo.branch}:${repo.directory}`;
}

// ─── The file tree ──────────────────────────────────────────────────────────

export type TreeNodeKind = "file" | "folder";

/**
 * One entry in the note tree. Paths are always repo-relative, POSIX-style, and
 * never start with a slash — e.g. `projects/roadmap.md`.
 */
export interface TreeNode {
  path: string;
  name: string;
  kind: TreeNodeKind;
  /** Blob SHA from GitHub. Absent for folders and for notes never yet pushed. */
  sha?: string;
  /** Byte size of the blob, when GitHub reported one. */
  size?: number;
  children?: TreeNode[];
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export interface NoteFrontmatter {
  title?: string;
  tags?: string[];
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

/** A markdown note as held in the local store. */
export interface Note {
  /** `${workspaceId}::${path}` — unique across workspaces. */
  id: string;
  workspaceId: string;
  path: string;
  /** Markdown body, excluding the frontmatter block. */
  content: string;
  frontmatter: NoteFrontmatter;
  /**
   * Blob SHA of the version this note was last known to match on GitHub.
   * `null` for a note that has never been pushed. Used for conflict detection.
   */
  baseSha: string | null;
  /** ISO timestamp of the last local edit. */
  updatedAt: string;
  /** True when the local copy has edits not yet pushed to GitHub. */
  dirty: boolean;
  /** Per-note editor mode preference. Falls back to the global default. */
  viewMode?: EditorViewMode;
}

// ─── Sync ───────────────────────────────────────────────────────────────────

export type EditorViewMode = "wysiwyg" | "split" | "source";

export type SyncStatus =
  | "local" // local-only workspace; nothing to sync
  | "idle" // everything pushed, nothing pending
  | "pending" // local edits waiting for the debounce window to close
  | "syncing" // a push is in flight
  | "offline" // no network; changes are queued
  | "conflict" // remote moved on; needs user resolution
  | "error";

export interface SyncState {
  status: SyncStatus;
  /** Number of notes with unpushed changes. */
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  conflicts: Conflict[];
}

/** A queued change waiting to be written to GitHub. */
export interface PendingChange {
  id: string;
  workspaceId: string;
  path: string;
  op: "upsert" | "delete" | "rename";
  /** Destination path for renames. */
  toPath?: string;
  /** Full file text including frontmatter. Absent for deletes. */
  content?: string;
  baseSha: string | null;
  queuedAt: string;
  attempts: number;
}

/** A remote change that collides with an unpushed local change. */
export interface Conflict {
  workspaceId: string;
  path: string;
  localContent: string;
  remoteContent: string;
  remoteSha: string;
  detectedAt: string;
}

export type ConflictResolution = "keep-local" | "keep-remote" | "keep-both";

// ─── Export ─────────────────────────────────────────────────────────────────

export type ExportFormat = "md" | "html" | "pdf" | "docx" | "txt" | "json";

export type DiagramExportFormat = "svg" | "png";

export interface ExportOptions {
  format: ExportFormat;
  /** Document title used for headings, metadata and the download filename. */
  title: string;
  /** Emit the YAML frontmatter block in formats that can carry it. */
  includeFrontmatter: boolean;
  /** Render Mermaid blocks as images rather than leaving them as code. */
  renderDiagrams: boolean;
  /** Light or dark styling for HTML/PDF output. */
  theme: "light" | "dark";
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export type GitHubErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "validation"
  | "network"
  | "unknown";

export interface SerializedError {
  code: GitHubErrorCode;
  message: string;
  /** Unix seconds at which a rate limit resets, when the API told us. */
  retryAt?: number;
}
