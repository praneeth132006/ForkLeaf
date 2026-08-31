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
  /**
   * The GitHub account this workspace was connected by.
   *
   * IndexedDB belongs to a browser, not to a person, so without this a
   * notebook cached by one account stays readable — and writable — by the next
   * account to sign in on the same machine. The repository itself was always
   * safe, because every request is authorised server-side by the session
   * cookie; what leaked was the *local cache* of it, which is the note bodies.
   *
   * GitHub's numeric id rather than the login, because a login is a display
   * name someone can change and reuse. The numeric id is the account.
   *
   * Absent on the on-device workspace, which belongs to the browser rather
   * than to an account, and on workspaces connected before this field existed
   * — see `claimUnowned`.
   */
  ownerId?: number;
  /**
   * Where published pages go, when that is not this workspace's own repository.
   *
   * Absent on every workspace that has not been split, which is all of them
   * until somebody asks — so no migration, and the fallback is the behaviour
   * that already existed.
   */
  publishRepo?: RepoRef;
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
  | "error"
  /**
   * Changes that have run out of retries and are parked.
   *
   * Distinct from `error`, which is a push that just failed and will be tried
   * again on its own. This one will not retry until somebody asks it to, so it
   * is the state that must never be mistaken for "saved".
   */
  | "blocked";

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

/** The failure kinds a push can end in, as the UI needs to tell them apart. */
export type SyncErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "conflict"
  | "validation"
  /**
   * The push was too big to send, whoever refused it.
   *
   * Its own kind because it is the one failure where every offer the app used
   * to make is wrong. Retrying sends the same oversized request; signing in
   * again changes nothing about how many bytes it is. It needs the file named
   * and taken out, and nothing else will do.
   */
  | "too-large"
  | "network"
  | "server"
  | "unknown";

export interface SyncState {
  status: SyncStatus;
  /** How this workspace is configured to push. */
  mode: SyncMode;
  /** Number of notes with unpushed changes, parked ones included. */
  pendingCount: number;
  /**
   * Changes that gave up retrying and are waiting to be asked again.
   *
   * Reported separately because it is the one number that means something is
   * wrong rather than merely in progress.
   */
  blockedCount: number;
  lastSyncedAt: string | null;
  /**
   * Why the last push failed, in words a reader can act on.
   *
   * Deliberately not the server's own text. GitHub answers a rejected commit
   * with things like `GitRPC::BadObjectState`, and putting that in front of
   * somebody who is trying to write notes tells them only that something is
   * broken and nothing about what to do.
   */
  lastError: string | null;
  /** The underlying message, for a tooltip and for bug reports. */
  lastErrorDetail: string | null;
  /**
   * What kind of failure it was, so the UI can offer the fix rather than
   * describe it.
   *
   * A message alone leaves every failure looking the same: one button that
   * says "retry", which for an expired sign-in retries into the same 401
   * forever. Carrying the code lets the status bar put "Sign in again" where
   * the retry would have been — the difference between a dead end and a way
   * out.
   */
  lastErrorCode: SyncErrorCode | null;
  /**
   * When the last push failed, so the UI can say how long this has been true.
   *
   * "Could not push" with no time on it reads as a thing that just happened,
   * every time it is read. It is worth knowing that the last attempt was four
   * seconds ago and the first one was an hour ago.
   */
  lastErrorAt: string | null;
  /**
   * Pushes that have failed in a row since the last success.
   *
   * The number behind "click to retry" not working: somebody pressing it a
   * fifth time deserves to be told that the previous four went the same way,
   * rather than watching the same sentence reappear and concluding the button
   * is dead.
   */
  failedAttempts: number;
  /**
   * Everything waiting to reach GitHub, named and sized.
   *
   * A count names no file, so there is nothing for the reader to go and look
   * at — and the failure they most need to act on, a file too big to send, is
   * always about one specific file they cannot otherwise find. It was not
   * enough to list only the changes that had already stopped trying: a push
   * that is still failing and retrying showed no files at all, which is the
   * state somebody is most likely to be looking at.
   */
  unpushed: {
    id: string;
    path: string;
    /** Roughly what it weighs on the wire. */
    bytes: number;
    /** True when it is too big to ever be sent, however often it is retried. */
    tooLarge: boolean;
    /** True once it has stopped retrying. */
    blocked: boolean;
    error: string | null;
  }[];
  conflicts: Conflict[];
}

/** A queued change waiting to be written to GitHub. */
export interface PendingChange {
  id: string;
  workspaceId: string;
  path: string;
  /**
   * `move` is a rename with no content of its own.
   *
   * A note is renamed by writing its text at the new path, because the text
   * changes — its relative links are rewritten to suit where it now sits. An
   * image has no links to rewrite and no text to send, and re-uploading a
   * megabyte of screenshot to change its name would be absurd, so a move
   * carries the path pair alone and the commit reuses the blob already in the
   * repository. Which is what a rename is in git.
   */
  op: "upsert" | "delete" | "rename" | "move";
  /** Destination path for renames and moves. */
  toPath?: string;
  /** Full file text including frontmatter. Absent for deletes. */
  content?: string;
  /**
   * How `content` is encoded.
   *
   * Images go through this queue exactly as notes do — that is what gives them
   * the same retries, the same offline behaviour and the same commit — and an
   * image is bytes, not text.
   */
  encoding?: "utf8" | "base64";
  baseSha: string | null;
  queuedAt: string;
  attempts: number;
  /**
   * True once this has exhausted its retries.
   *
   * It stays in the queue. A change that cannot be pushed used to be deleted
   * from the queue and from storage after five attempts — no record, nothing
   * shown — which emptied the queue, moved the status to "idle" and put "All
   * changes saved" on screen for a note that had never reached GitHub. Parking
   * it keeps the text and keeps the app honest.
   */
  blocked?: boolean;
  /** Why it stopped, for the message offering to try again. */
  lastError?: string;
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

// ─── Documents ──────────────────────────────────────────────────────────────

/**
 * The text of a PDF, kept after it has been read once.
 *
 * Extracting the text of a three-hundred-page paper takes seconds, and it was
 * being done on every open and thrown away on every close — so the words were
 * searchable inside the reader, for as long as the reader was looking at them,
 * and nowhere else. Keeping them is what lets the notebook's own search reach
 * inside documents, and what lets a citation be checked without opening the
 * paper it points at.
 *
 * The positioned runs are deliberately not kept. They exist to draw a
 * highlight on a page and are far larger than the text; anything that needs
 * them has the document open in front of it.
 */
export interface PdfTextEntry {
  /** `${workspaceId}::${path}`, like every other stored thing here. */
  id: string;
  workspaceId: string;
  /** Repository-relative path of the document the text came out of. */
  path: string;
  pages: { page: number; text: string }[];
  /** When it was read, so a stale copy can be recognised as one. */
  indexedAt: string;
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

// ─── Ordering ───────────────────────────────────────────────────────────────

export * from "./order";
