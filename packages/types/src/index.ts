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
  /**
   * ISO timestamp of the last edit made to this note in ForkLeaf.
   *
   * `null` for a note that has only ever been *read* — opened from GitHub,
   * or pulled in by the dashboard's background index. Reading is not editing,
   * and stamping a read with the current time is what used to make every note
   * in a freshly connected repository claim it had been touched a moment ago.
   */
  updatedAt: string | null;
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

/**
 * How eagerly changes are pushed to GitHub.
 *
 * `auto` is the default and the behaviour ForkLeaf shipped with: edits drain
 * to GitHub a few seconds after you stop typing. The others exist because that
 * is not always what someone wants — writing in another project's repository,
 * or wanting one deliberate commit per session rather than thirty automatic
 * ones — and every one of them still saves locally the instant you type.
 */
export type SyncMode =
  | "auto" // push a few seconds after the last keystroke (default)
  | "interval" // push on a timer, however much was written in between
  | "manual"; // push only when explicitly asked

/** Sync preferences for one workspace. */
export interface SyncPreference {
  mode: SyncMode;
  /** Minutes between pushes when the mode is `interval`. */
  intervalMinutes: number;
}

export const DEFAULT_SYNC_PREFERENCE: SyncPreference = {
  mode: "auto",
  intervalMinutes: 15,
};

export interface SyncState {
  status: SyncStatus;
  /** How this workspace is configured to push. */
  mode: SyncMode;
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

// ─── Images ─────────────────────────────────────────────────────────────────

/**
 * An image belonging to a note, held on this device.
 *
 * Notes reference images by repository-relative path — `../assets/chart.png` —
 * so the markdown renders on github.com and in any editor. That path needs a
 * file behind it, and there are two moments when there is not one yet: a
 * workspace with no repository, which has nowhere to commit to at all, and a
 * connected workspace that happens to be offline when a screenshot is pasted.
 *
 * The bytes live here in both cases. The note itself never carries them, which
 * is the whole point: the alternative — inlining the image as a `data:` URI —
 * turned a two-line note into a hundred kilobytes of base64 that no other tool
 * could read, and made the source view unusable.
 */
export interface LocalAsset {
  /** `${workspaceId}::${path}` — unique across workspaces. */
  id: string;
  workspaceId: string;
  /** Repository-relative path, e.g. `assets/2026-08-22-diagram-k3f9.png`. */
  path: string;
  /** MIME type, so the blob can be reconstructed for display. */
  mimeType: string;
  /** The file's bytes, base64-encoded without a `data:` prefix. */
  data: string;
  createdAt: string;
  /**
   * True once these bytes are known to be committed to GitHub.
   *
   * A workspace with no repository leaves this false forever, which is
   * correct: there is nothing to push to. For a connected one it is what
   * distinguishes a cached copy from an upload still waiting on a connection.
   */
  pushed: boolean;
}

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
