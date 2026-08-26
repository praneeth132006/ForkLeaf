import type { RepoRef, TreeNode } from "@forkleaf/types";
import { Transport, type RateLimit, type TransportConfig } from "./http";
import { GitHubError } from "./errors";
import { encodeBase64, decodeBase64 } from "./base64";

/** A repository's GitHub Pages site, as the publish flow needs it. */
/** One file in a directory listing — name and size, never the bytes. */
export interface DirectoryEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
}

export interface PagesSite {
  /** Where the site is served from, e.g. `https://you.github.io/notes/`. */
  url: string;
  /** GitHub's build state: `built`, `building`, `errored`, or null. */
  status: string | null;
  source?: { branch: string; path: string };
  /** False for a Pages site behind repository access. */
  isPublic: boolean;
}

// ─── API response shapes (only the fields we actually consume) ──────────────

interface ApiUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

interface ApiRepo {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  permissions?: { push?: boolean; admin?: boolean };
  owner: { login: string };
  updated_at: string;
  description: string | null;
}

interface ApiRef {
  object: { sha: string };
}

interface ApiPages {
  url: string;
  status: string | null;
  cname: string | null;
  html_url: string;
  source?: { branch: string; path: string };
  public: boolean;
  build_type?: string;
}

interface ApiPullRequest {
  number: number;
  html_url: string;
  state: string;
  title: string;
  draft?: boolean;
  head: { ref: string; sha?: string };
  base: { ref: string; sha?: string };
  user?: { login: string } | null;
  merged?: boolean;
}

interface ApiCommitDetail {
  files?: { filename: string; status: string; previous_filename?: string }[];
}

interface ApiPullRequestFile {
  filename: string;
  status: string;
  previous_filename?: string;
}

interface ApiCommit {
  sha: string;
  tree: { sha: string };
  parents: { sha: string }[];
  message: string;
  committer: { date: string };
}

interface ApiTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

interface ApiTree {
  sha: string;
  tree: ApiTreeEntry[];
  truncated: boolean;
}

interface ApiCommitListEntry {
  sha: string;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
    committer: { date?: string } | null;
  };
  author: { login: string; avatar_url: string } | null;
}

interface ApiContent {
  content?: string;
  encoding?: string;
  sha: string;
  size: number;
  type: string;
}

/** One row of a directory listing. The contents API omits bodies for these. */
interface ApiDirectoryEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: string;
}

// ─── Public shapes ──────────────────────────────────────────────────────────

export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  /** False for repos the user can only read — ForkLeaf needs write access. */
  canPush: boolean;
  description: string | null;
  updatedAt: string;
}

/** A branch, with enough context to show it in a picker. */
export interface BranchSummary {
  name: string;
  sha: string;
  isDefault: boolean;
  protected: boolean;
}

/** An opened pull request, as much of it as the UI needs. */
export interface PullRequestSummary {
  number: number;
  url: string;
  state: string;
  title: string;
  draft: boolean;
  head: string;
  base: string;
}

/**
 * A pull request as a diagram review needs it: the two commits to compare.
 *
 * `PullRequestSummary` is what the "propose changes" flow gets back after
 * opening one, and it deliberately carries only branch names. Reviewing needs
 * the commits those branches pointed at when the request was opened — a branch
 * name resolves to whatever it points at *now*, which is not the revision the
 * request is about.
 */
export interface PullRequestDetail extends PullRequestSummary {
  headSha: string;
  baseSha: string;
  author: string | null;
  merged: boolean;
}

/** A file a pull request touches. */
export interface PullRequestFile {
  path: string;
  /** GitHub's own word: added, removed, modified, renamed, copied, changed. */
  status: string;
  /** Where the file was before a rename, so the two sides can be paired. */
  previousPath: string | null;
}

/** One entry in a note's history, flattened for display. */
/**
 * One file a commit touched, beyond the note being blamed.
 *
 * The interesting half of "when did I write this?" is what else you were doing
 * at the time: a paragraph committed alongside four other notes from the same
 * engagement carries a context the date alone does not.
 */
export interface CommitFile {
  path: string;
  /** GitHub's own word: added, modified, removed, renamed. */
  status: string;
  previousPath: string | null;
}

export interface NoteCommit {
  sha: string;
  /** The commit subject line only. */
  message: string;
  authorName: string;
  authorLogin: string | null;
  avatarUrl: string | null;
  /** ISO 8601. */
  date: string;
  /** True when ForkLeaf wrote this commit, rather than a person or a CI job. */
  byForkLeaf: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
  size: number;
}

/**
 * How `content` is expressed.
 *
 * Notes are text, so `utf8` is the default and everything that existed before
 * binary uploads keeps working untouched. An image, though, has no meaningful
 * UTF-8 form: re-encoding its bytes as a string corrupts them. Those arrive
 * already base64-encoded and are handed to GitHub as-is.
 */
export type ContentEncoding = "utf8" | "base64";

/** One file operation to include in a commit. */
export type FileChange =
  | { op: "upsert"; path: string; content: string; encoding?: ContentEncoding }
  | { op: "delete"; path: string }
  | { op: "rename"; path: string; toPath: string; content: string; encoding?: ContentEncoding }
  /**
   * A rename that sends no bytes.
   *
   * Git renames by writing the same blob under a new path, so a file whose
   * content is not changing does not need uploading again — which for an image
   * being carried along with the folder it lives in is the difference between
   * a commit and a re-upload of every screenshot in the folder.
   */
  | { op: "move"; path: string; toPath: string };

export interface CommitOptions {
  message: string;
  /**
   * When set, a commit made by ForkLeaf within this many milliseconds is
   * rewritten to absorb these changes instead of stacking a new commit on top.
   * This is what keeps autosave from producing thousands of commits.
   */
  squashWindowMs?: number;
}

export interface CommitResult {
  sha: string;
  /** Blob SHA of each written path, so the local store can update its baseSha. */
  blobShas: Record<string, string>;
  /** True when an existing commit was rewritten rather than a new one added. */
  squashed: boolean;
}

/** Prefix that marks a commit as ours, so we only ever rewrite our own. */
const COMMIT_MARKER = "forkleaf:";

/** Regular non-executable file mode. */
const FILE_MODE = "100644";

export class GitHubClient {
  private readonly transport: Transport;
  /** ETags keyed by request path, so unchanged trees cost no rate-limit quota. */
  private readonly etags = new Map<string, string>();
  private readonly etagCache = new Map<string, unknown>();

  constructor(config: TransportConfig) {
    this.transport = new Transport(config);
  }

  get rateLimit(): RateLimit | null {
    return this.transport.rateLimit;
  }

  // ─── Identity ─────────────────────────────────────────────────────────────

  async getAuthenticatedUser(): Promise<ApiUser> {
    const { data } = await this.transport.request<ApiUser>("/user");
    if (!data) throw new GitHubError("unknown", "Empty user response");
    return data;
  }

  // ─── Repositories ─────────────────────────────────────────────────────────

  /** Lists repos the user can write to, most recently updated first. */
  async listRepos(): Promise<RepoSummary[]> {
    const repos = await this.transport.paginate<ApiRepo>(
      "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    );

    return repos
      .filter((r) => r.permissions?.push !== false)
      .map((r) => ({
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        canPush: r.permissions?.push !== false,
        description: r.description,
        updatedAt: r.updated_at,
      }));
  }

  async getRepo(owner: string, repo: string): Promise<RepoSummary | null> {
    try {
      const { data } = await this.transport.request<ApiRepo>(`/repos/${owner}/${repo}`);
      if (!data) return null;
      return {
        owner: data.owner.login,
        name: data.name,
        fullName: data.full_name,
        private: data.private,
        defaultBranch: data.default_branch,
        canPush: data.permissions?.push !== false,
        description: data.description,
        updatedAt: data.updated_at,
      };
    } catch (err) {
      if (err instanceof GitHubError && err.code === "not-found") return null;
      throw err;
    }
  }

  /**
   * Creates the user's notes repository.
   *
   * `auto_init` is essential: an empty repo has no default branch and no commit
   * to build a tree from, which would make the very first save fail.
   */
  async createRepo(options: {
    name: string;
    description?: string;
    private?: boolean;
  }): Promise<RepoSummary> {
    const { data } = await this.transport.request<ApiRepo>("/user/repos", {
      method: "POST",
      body: {
        name: options.name,
        description: options.description ?? "My notes, synced by ForkLeaf",
        private: options.private ?? true,
        auto_init: true,
      },
    });

    if (!data) throw new GitHubError("unknown", "Empty repo creation response");

    return {
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      private: data.private,
      defaultBranch: data.default_branch,
      canPush: true,
      description: data.description,
      updatedAt: data.updated_at,
    };
  }

  /** Returns the existing repo, creating it only if it is missing. */
  async ensureRepo(options: {
    owner: string;
    name: string;
    private?: boolean;
  }): Promise<RepoSummary> {
    const existing = await this.getRepo(options.owner, options.name);
    if (existing) {
      if (!existing.canPush) {
        throw new GitHubError("forbidden", `You don't have write access to ${existing.fullName}.`);
      }
      return existing;
    }
    return this.createRepo({
      name: options.name,
      ...(options.private !== undefined ? { private: options.private } : {}),
    });
  }

  async listBranches(owner: string, repo: string): Promise<string[]> {
    const branches = await this.transport.paginate<{ name: string }>(
      `/repos/${owner}/${repo}/branches?per_page=100`,
    );
    return branches.map((b) => b.name);
  }

  /**
   * Branches with their head SHAs and which one is the default.
   *
   * A bare list of names is not enough to build a branch picker: the default
   * needs marking, and protected branches need flagging so the UI can steer
   * someone towards a pull request before they discover the push is rejected.
   */
  async listBranchSummaries(owner: string, repo: string): Promise<BranchSummary[]> {
    const [branches, repository] = await Promise.all([
      this.transport.paginate<{ name: string; commit: { sha: string }; protected?: boolean }>(
        `/repos/${owner}/${repo}/branches?per_page=100`,
      ),
      this.getRepo(owner, repo),
    ]);

    const defaultBranch = repository?.defaultBranch;

    return (
      branches
        .map((branch) => ({
          name: branch.name,
          sha: branch.commit.sha,
          isDefault: branch.name === defaultBranch,
          protected: branch.protected === true,
        }))
        // The default first, then alphabetically — the order a picker wants.
        .sort((a, b) => {
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
    );
  }

  /**
   * Creates a branch pointing at another branch's head.
   *
   * Idempotent by design: an existing branch of the same name is returned
   * rather than treated as an error, because the common case is coming back to
   * a branch you started earlier in the session.
   */
  async createBranch(
    owner: string,
    repo: string,
    name: string,
    fromBranch: string,
  ): Promise<BranchSummary> {
    const existing = await this.getBranch(owner, repo, name);
    if (existing) return existing;

    const from = await this.getBranch(owner, repo, fromBranch);
    if (!from) {
      throw new GitHubError("not-found", `Cannot branch from ${fromBranch}: it does not exist.`);
    }

    await this.transport.request(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${name}`, sha: from.sha },
    });

    return { name, sha: from.sha, isDefault: false, protected: false };
  }

  async getBranch(owner: string, repo: string, name: string): Promise<BranchSummary | null> {
    try {
      const { data } = await this.transport.request<{
        name: string;
        commit: { sha: string };
        protected?: boolean;
      }>(`/repos/${owner}/${repo}/branches/${encodeURIComponent(name)}`);

      if (!data) return null;
      return {
        name: data.name,
        sha: data.commit.sha,
        isDefault: false,
        protected: data.protected === true,
      };
    } catch (err) {
      if (err instanceof GitHubError && err.code === "not-found") return null;
      throw err;
    }
  }

  /**
   * Forks a repository into the user's account, waiting until it is usable.
   *
   * This is what lets someone edit documentation in a repository they cannot
   * push to. GitHub's fork call returns 202 immediately and creates the
   * repository asynchronously, so a commit issued straight afterwards fails
   * with a confusing 404 — hence the poll.
   */
  async forkRepo(owner: string, repo: string): Promise<RepoSummary> {
    const { data } = await this.transport.request<ApiRepo>(`/repos/${owner}/${repo}/forks`, {
      method: "POST",
      body: {},
    });

    if (!data) throw new GitHubError("unknown", "Empty fork response");

    const forkOwner = data.owner.login;
    const forkName = data.name;

    // Up to ~20s. Forking a small docs repo is usually ready within two or
    // three, and giving up is better than hanging forever on a large one.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const fork = await this.getRepo(forkOwner, forkName);
      // A fork with a default branch has finished copying refs.
      if (fork?.defaultBranch) return fork;
      await delay(2000);
    }

    throw new GitHubError(
      "unknown",
      "The fork is taking longer than expected to become available. It was created — try again in a moment.",
    );
  }

  /**
   * Opens a pull request, or returns the one already open for this branch.
   *
   * Re-running the same "propose these changes" action should not litter the
   * repository with duplicate pull requests, and GitHub rejects the second one
   * with a validation error rather than something actionable.
   */
  async createPullRequest(options: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    /** Branch containing the changes. Cross-fork takes the form `owner:branch`. */
    head: string;
    base: string;
    draft?: boolean;
  }): Promise<PullRequestSummary> {
    const existing = await this.findOpenPullRequest(
      options.owner,
      options.repo,
      options.head,
      options.base,
    );
    if (existing) return existing;

    const { data } = await this.transport.request<ApiPullRequest>(
      `/repos/${options.owner}/${options.repo}/pulls`,
      {
        method: "POST",
        body: {
          title: options.title,
          head: options.head,
          base: options.base,
          ...(options.body ? { body: options.body } : {}),
          ...(options.draft ? { draft: true } : {}),
        },
      },
    );

    if (!data) throw new GitHubError("unknown", "Empty pull request response");
    return toPullRequest(data);
  }

  async findOpenPullRequest(
    owner: string,
    repo: string,
    head: string,
    base: string,
  ): Promise<PullRequestSummary | null> {
    // `head` is qualified with an owner for cross-fork requests; the list
    // endpoint expects the same qualified form.
    const qualified = head.includes(":") ? head : `${owner}:${head}`;
    const pulls = await this.transport.paginate<ApiPullRequest>(
      `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(qualified)}&base=${encodeURIComponent(base)}&per_page=10`,
    );

    return pulls[0] ? toPullRequest(pulls[0]) : null;
  }

  /**
   * Reads one pull request, including the commits it is actually about.
   *
   * The base SHA GitHub reports here is the tip of the base branch, which is
   * not necessarily the merge base — but it is the revision the request is
   * stated against, and comparing against anything else would show the
   * reviewer changes that came from other people's merges.
   */
  async getPullRequest(owner: string, repo: string, number: number): Promise<PullRequestDetail> {
    const { data } = await this.transport.request<ApiPullRequest>(
      `/repos/${owner}/${repo}/pulls/${number}`,
    );
    if (!data) throw new GitHubError("not-found", `Pull request #${number} not found`);

    return {
      ...toPullRequest(data),
      headSha: data.head.sha ?? data.head.ref,
      baseSha: data.base.sha ?? data.base.ref,
      author: data.user?.login ?? null,
      merged: data.merged === true,
    };
  }

  /**
   * Every file a pull request touches.
   *
   * Paginated, because the endpoint caps at 100 per page and a request that
   * touches more files than that is exactly the one where finding the changed
   * diagrams by hand is hopeless.
   */
  async listPullRequestFiles(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PullRequestFile[]> {
    const files = await this.transport.paginate<ApiPullRequestFile>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
    );

    return files.map((file) => ({
      path: file.filename,
      status: file.status,
      previousPath: file.previous_filename ?? null,
    }));
  }

  // ─── Reading ──────────────────────────────────────────────────────────────

  /** Resolves a branch name to its head commit SHA. */
  async getBranchHead(repo: RepoRef): Promise<string> {
    const { data } = await this.transport.request<ApiRef>(
      `/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(repo.branch)}`,
    );
    if (!data) throw new GitHubError("not-found", `Branch ${repo.branch} not found`);
    return data.object.sha;
  }

  /**
   * Reads the full markdown file tree for a workspace.
   *
   * Uses one recursive tree call rather than walking directories, so a repo with
   * hundreds of notes costs a single request. Conditional via ETag, so polling
   * for remote changes is nearly free.
   */
  async listTree(repo: RepoRef, options: { markdownOnly?: boolean } = {}): Promise<TreeNode[]> {
    const head = await this.getBranchHead(repo);
    const path = `/repos/${repo.owner}/${repo.repo}/git/trees/${head}?recursive=1`;

    const cached = this.etags.get(path);
    const response = await this.transport.request<ApiTree>(path, {
      ...(cached ? { etag: cached } : {}),
    });

    let tree: ApiTree;
    if (response.status === 304) {
      tree = this.etagCache.get(path) as ApiTree;
    } else {
      if (!response.data) throw new GitHubError("unknown", "Empty tree response");
      tree = response.data;
      if (response.etag) {
        this.etags.set(path, response.etag);
        this.etagCache.set(path, tree);
      }
    }

    if (tree.truncated) {
      // >100k entries. We still show what came back rather than failing outright.
      console.warn("[forkleaf] Repository tree was truncated by GitHub; showing a partial list.");
    }

    const inDirectory = (p: string) =>
      repo.directory === "" || p === repo.directory || p.startsWith(`${repo.directory}/`);

    const flat = tree.tree.filter((entry) => {
      if (entry.type !== "blob") return false;
      if (!inDirectory(entry.path)) return false;
      if (options.markdownOnly !== false && !/\.mdx?$/i.test(entry.path)) return false;
      return true;
    });

    return buildTree(flat);
  }

  /**
   * The files directly inside one directory, without their contents.
   *
   * The contents API answers a directory with a list of names, sizes and
   * SHAs and no bodies, which is what makes this the right way to ask "what
   * is in here" — `readFile` on each would download every byte, and
   * `listTree` answers for the whole repository and is scoped to the
   * workspace's own subfolder, which published pages are not in.
   *
   * A directory that does not exist is an empty list, not an error: "nothing
   * has been published yet" and "the folder is missing" are the same answer
   * to the only question being asked.
   */
  async listDirectory(
    owner: string,
    repo: string,
    branch: string,
    path: string,
  ): Promise<DirectoryEntry[]> {
    const url =
      `/repos/${owner}/${repo}/contents/${encodePath(path)}` + `?ref=${encodeURIComponent(branch)}`;

    try {
      const { data } = await this.transport.request<ApiDirectoryEntry[]>(url);
      if (!Array.isArray(data)) return [];

      return data
        .filter((entry) => entry.type === "file")
        .map((entry) => ({
          name: entry.name,
          path: entry.path,
          sha: entry.sha,
          size: entry.size,
        }));
    } catch (error) {
      if (error instanceof GitHubError && error.code === "not-found") return [];
      throw error;
    }
  }

  /** Reads one file's decoded text plus its blob SHA. */
  async readFile(repo: RepoRef, path: string): Promise<FileContent | null> {
    const url =
      `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}` +
      `?ref=${encodeURIComponent(repo.branch)}`;

    try {
      const { data } = await this.transport.request<ApiContent>(url);
      if (!data) throw new GitHubError("unknown", "Empty file response");

      if (data.type !== "file" || data.content === undefined) {
        throw new GitHubError("validation", `${path} is not a regular file`);
      }

      // Files over 1MB come back with empty content and must be fetched as a blob.
      const content =
        data.content === "" ? await this.readBlob(repo, data.sha) : decodeBase64(data.content);

      return { path, content, sha: data.sha, size: data.size };
    } catch (err) {
      if (err instanceof GitHubError && err.code === "not-found") return null;
      throw err;
    }
  }

  /**
   * One file's raw bytes, still base64-encoded.
   *
   * Separate from `readFile` because that decodes as UTF-8, which is right for
   * a note and destroys an image. The caller turns these bytes into whatever
   * it needs — for the app that is an HTTP response the browser can render.
   */
  /**
   * A file's bytes, base64 as GitHub hands them over.
   *
   * `options.etag` makes it a conditional request. GitHub answers an unchanged
   * file with a bare 304 — no body, and no charge against the hourly rate
   * limit — which is what lets the image proxy revalidate a note full of
   * screenshots without re-downloading any of them.
   */
  async readFileBase64(
    repo: RepoRef,
    path: string,
    options: { etag?: string } = {},
  ): Promise<{ base64: string; sha: string; size: number; notModified?: boolean } | null> {
    const url =
      `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}` +
      `?ref=${encodeURIComponent(repo.branch)}`;

    try {
      const { data, status } = await this.transport.request<ApiContent>(
        url,
        options.etag ? { etag: options.etag } : {},
      );

      // Unchanged since the caller last saw it. There is no body to read and
      // none is wanted — that is the entire point of having asked.
      if (status === 304) return { base64: "", sha: "", size: 0, notModified: true };

      if (!data) throw new GitHubError("unknown", "Empty file response");

      if (data.type !== "file" || data.content === undefined) {
        throw new GitHubError("validation", `${path} is not a regular file`);
      }

      // Anything over 1MB comes back with an empty `content`, and has to be
      // fetched through the blob API instead.
      const base64 = data.content === "" ? await this.readBlobBase64(repo, data.sha) : data.content;

      return { base64: base64.replace(/\s/g, ""), sha: data.sha, size: data.size };
    } catch (err) {
      if (err instanceof GitHubError && err.code === "not-found") return null;
      throw err;
    }
  }

  /**
   * The commit history of one file, newest first.
   *
   * Exists so ForkLeaf can show a note's history inside the app rather than
   * bouncing the reader out to github.com. The `path` filter is applied by
   * GitHub, so this stays one request regardless of how large the repo is.
   */
  async listFileCommits(repo: RepoRef, path: string, limit = 30): Promise<NoteCommit[]> {
    const url =
      `/repos/${repo.owner}/${repo.repo}/commits` +
      `?path=${encodePath(path)}` +
      `&sha=${encodeURIComponent(repo.branch)}` +
      `&per_page=${Math.min(Math.max(limit, 1), 100)}`;

    const { data } = await this.transport.request<ApiCommitListEntry[]>(url);
    if (!data) return [];

    return data.map((entry) => ({
      sha: entry.sha,
      // GitHub commit messages are "subject\n\nbody"; only the subject is
      // useful in a list.
      message: (entry.commit.message ?? "").split("\n")[0] ?? "",
      authorName: entry.commit.author?.name ?? entry.author?.login ?? "Unknown",
      authorLogin: entry.author?.login ?? null,
      avatarUrl: entry.author?.avatar_url ?? null,
      date: entry.commit.author?.date ?? entry.commit.committer?.date ?? "",
      // True when ForkLeaf itself wrote it, so the UI can distinguish an
      // autosave from an edit someone made elsewhere.
      byForkLeaf: (entry.commit.message ?? "").startsWith(COMMIT_MARKER),
    }));
  }

  /**
   * The other files one commit touched.
   *
   * Capped, because a commit can legitimately touch a thousand files — an
   * import, a bulk rename — and the caller wants the flavour of what else was
   * going on, not a directory listing. `truncated` says when there was more.
   */
  async getCommitFiles(
    repo: RepoRef,
    sha: string,
    limit = 20,
  ): Promise<{ files: CommitFile[]; truncated: boolean }> {
    const { data } = await this.transport.request<ApiCommitDetail>(
      `/repos/${repo.owner}/${repo.repo}/commits/${encodeURIComponent(sha)}`,
    );

    const all = data?.files ?? [];
    return {
      files: all.slice(0, limit).map((file) => ({
        path: file.filename,
        status: file.status,
        previousPath: file.previous_filename ?? null,
      })),
      truncated: all.length > limit,
    };
  }

  /** The content of one file at one commit, for previewing an old version. */
  async readFileAtCommit(repo: RepoRef, path: string, sha: string): Promise<string | null> {
    const url =
      `/repos/${repo.owner}/${repo.repo}/contents/${encodePath(path)}` +
      `?ref=${encodeURIComponent(sha)}`;

    try {
      const { data } = await this.transport.request<ApiContent>(url);
      if (!data || data.type !== "file" || data.content === undefined) return null;

      return data.content === "" ? await this.readBlob(repo, data.sha) : decodeBase64(data.content);
    } catch (err) {
      if (err instanceof GitHubError && err.code === "not-found") return null;
      throw err;
    }
  }

  private async readBlobBase64(repo: RepoRef, sha: string): Promise<string> {
    const { data } = await this.transport.request<{ content: string; encoding: string }>(
      `/repos/${repo.owner}/${repo.repo}/git/blobs/${sha}`,
    );
    if (!data) throw new GitHubError("unknown", "Empty blob response");
    if (data.encoding !== "base64") {
      throw new GitHubError("validation", "Unexpected blob encoding");
    }
    return data.content;
  }

  private async readBlob(repo: RepoRef, sha: string): Promise<string> {
    const { data } = await this.transport.request<{ content: string; encoding: string }>(
      `/repos/${repo.owner}/${repo.repo}/git/blobs/${sha}`,
    );
    if (!data) throw new GitHubError("unknown", "Empty blob response");
    return data.encoding === "base64" ? decodeBase64(data.content) : data.content;
  }

  // ─── Writing ──────────────────────────────────────────────────────────────

  /**
   * Writes a batch of file changes as a single commit.
   *
   * Everything goes through the git data API (blob → tree → commit → ref) rather
   * than the contents API, because the contents API can only touch one file per
   * commit. Batching means "renamed a note and edited two others" is one commit,
   * not three, and it is atomic: either all of it lands or none of it does.
   */
  async commitChanges(
    repo: RepoRef,
    changes: FileChange[],
    options: CommitOptions,
  ): Promise<CommitResult> {
    if (changes.length === 0) {
      throw new GitHubError("validation", "No changes to commit");
    }

    const headSha = await this.getBranchHead(repo);
    const headCommit = await this.getCommit(repo, headSha);

    // Decide whether to rewrite the previous commit or add a new one.
    const squash = this.canSquash(headCommit, options.squashWindowMs);

    // When squashing we keep HEAD's tree as the base (so nothing HEAD added is
    // lost) but adopt HEAD's parent, which collapses the two into one commit.
    const baseTreeSha = headCommit.tree.sha;
    const parents = squash ? headCommit.parents.map((p) => p.sha) : [headSha];

    // Upload each new file body as a blob.
    const blobShas: Record<string, string> = {};
    const treeEntries: {
      path: string;
      mode: string;
      type: "blob";
      sha: string | null;
    }[] = [];

    // Only read for a move, and only once: the source blobs have to be looked
    // up somewhere, and every other kind of change carries its own content.
    const sourceBlobs = changes.some((change) => change.op === "move")
      ? await this.blobShas(repo, baseTreeSha)
      : null;

    for (const change of changes) {
      if (change.op === "delete") {
        treeEntries.push({ path: change.path, mode: FILE_MODE, type: "blob", sha: null });
        continue;
      }

      if (change.op === "move") {
        const sha = sourceBlobs?.get(change.path);
        // Nothing there to move: already moved from another device, or never
        // reached the repository. Asking git to delete a path it does not have
        // fails the whole commit, so the safe answer is to do nothing.
        if (!sha || change.path === change.toPath) continue;

        blobShas[change.toPath] = sha;
        treeEntries.push({ path: change.toPath, mode: FILE_MODE, type: "blob", sha });
        treeEntries.push({ path: change.path, mode: FILE_MODE, type: "blob", sha: null });
        continue;
      }

      const targetPath = change.op === "rename" ? change.toPath : change.path;
      const sha = await this.createBlob(repo, change.content, change.encoding ?? "utf8");
      blobShas[targetPath] = sha;
      treeEntries.push({ path: targetPath, mode: FILE_MODE, type: "blob", sha });

      // A rename is an add at the new path plus a delete at the old one.
      if (change.op === "rename" && change.path !== change.toPath) {
        treeEntries.push({ path: change.path, mode: FILE_MODE, type: "blob", sha: null });
      }
    }

    const entries = await this.withoutPhantomDeletes(repo, baseTreeSha, treeEntries);

    /**
     * Nothing left to write.
     *
     * Every change in this batch turned out to be the removal of something the
     * repository does not have — an image that never reached it, a file
     * already deleted from another device. There is no commit to make, and
     * making an empty one would be noise in the history. Reporting HEAD is
     * honest: the requested state is the state the branch is in.
     */
    if (entries.length === 0) {
      return { sha: headSha, blobShas: {}, squashed: false };
    }

    const newTreeSha = await this.createTree(repo, baseTreeSha, entries);

    const commitSha = await this.createCommit(repo, {
      message: `${COMMIT_MARKER} ${options.message}`,
      tree: newTreeSha,
      parents,
    });

    // Re-check the branch head immediately before a force update. If someone
    // else pushed while we were building the commit, a rewrite would discard
    // their work, so fall back to a normal non-squashed commit instead.
    if (squash) {
      const currentHead = await this.getBranchHead(repo);
      if (currentHead !== headSha) {
        return this.commitChanges(repo, changes, { ...options, squashWindowMs: 0 });
      }
    }

    await this.updateRef(repo, commitSha, squash);

    return { sha: commitSha, blobShas, squashed: squash };
  }

  /**
   * A commit is safe to rewrite only if ForkLeaf made it, it is recent, and it
   * has a parent to reattach to. Rewriting anyone else's commit — or the repo's
   * initial commit — is never acceptable.
   */
  private canSquash(head: ApiCommit, windowMs: number | undefined): boolean {
    if (!windowMs || windowMs <= 0) return false;
    if (!head.message.startsWith(COMMIT_MARKER)) return false;
    if (head.parents.length !== 1) return false;

    const age = Date.now() - new Date(head.committer.date).getTime();
    return age >= 0 && age <= windowMs;
  }

  private async getCommit(repo: RepoRef, sha: string): Promise<ApiCommit> {
    const { data } = await this.transport.request<ApiCommit>(
      `/repos/${repo.owner}/${repo.repo}/git/commits/${sha}`,
    );
    if (!data) throw new GitHubError("not-found", `Commit ${sha} not found`);
    return data;
  }

  private async createBlob(
    repo: RepoRef,
    content: string,
    encoding: ContentEncoding = "utf8",
  ): Promise<string> {
    // Either way GitHub is told the payload is base64 — the difference is
    // whether we do the encoding or the caller already did.
    const payload = encoding === "base64" ? content.replace(/\s/g, "") : encodeBase64(content);

    const { data } = await this.transport.request<{ sha: string }>(
      `/repos/${repo.owner}/${repo.repo}/git/blobs`,
      { method: "POST", body: { content: payload, encoding: "base64" } },
    );
    if (!data) throw new GitHubError("unknown", "Empty blob creation response");
    return data.sha;
  }

  private async createTree(
    repo: RepoRef,
    baseTree: string,
    entries: { path: string; mode: string; type: "blob"; sha: string | null }[],
  ): Promise<string> {
    const { data } = await this.transport.request<{ sha: string }>(
      `/repos/${repo.owner}/${repo.repo}/git/trees`,
      { method: "POST", body: { base_tree: baseTree, tree: entries } },
    );
    if (!data) throw new GitHubError("unknown", "Empty tree creation response");
    return data.sha;
  }

  /**
   * Drops deletions of paths the repository does not actually have.
   *
   * Asking the tree API to remove a path that is not in the base tree is not
   * ignored — GitHub answers 422 `GitRPC::BadObjectState` and refuses the
   * whole commit. Since a commit here carries every queued change at once,
   * one stale deletion — an image that was only ever stored on the device, a
   * file already removed from another machine — was enough to stop a
   * repository syncing at all, and to keep stopping it on every retry.
   *
   * The tree is read once, and only when there is a deletion to check.
   */
  private async withoutPhantomDeletes(
    repo: RepoRef,
    baseTree: string,
    entries: { path: string; mode: string; type: "blob"; sha: string | null }[],
  ): Promise<{ path: string; mode: string; type: "blob"; sha: string | null }[]> {
    if (!entries.some((entry) => entry.sha === null)) return entries;

    const existing = await this.blobPaths(repo, baseTree);
    // Unknown — a tree too large for one response — means no filtering. A
    // commit that might fail beats dropping a deletion the user asked for.
    if (!existing) return entries;

    return entries.filter((entry) => entry.sha !== null || existing.has(entry.path));
  }

  /**
   * Every blob path in a tree, or null when it cannot be known.
   *
   * Null for a tree GitHub truncated, and null if the read itself fails: this
   * is a guard, and a guard that cannot run must not become a second way for
   * the commit to fail.
   */
  private async blobPaths(repo: RepoRef, treeSha: string): Promise<Set<string> | null> {
    const blobs = await this.blobShas(repo, treeSha);
    return blobs && new Set(blobs.keys());
  }

  /** The same read, keeping the shas, which is what a move needs. */
  private async blobShas(repo: RepoRef, treeSha: string): Promise<Map<string, string> | null> {
    try {
      const { data } = await this.transport.request<{
        tree: { path: string; type: string; sha: string }[];
        truncated?: boolean;
      }>(`/repos/${repo.owner}/${repo.repo}/git/trees/${treeSha}?recursive=1`);

      if (!data || data.truncated) return null;

      return new Map(
        data.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]),
      );
    } catch {
      return null;
    }
  }

  private async createCommit(
    repo: RepoRef,
    body: { message: string; tree: string; parents: string[] },
  ): Promise<string> {
    const { data } = await this.transport.request<{ sha: string }>(
      `/repos/${repo.owner}/${repo.repo}/git/commits`,
      { method: "POST", body },
    );
    if (!data) throw new GitHubError("unknown", "Empty commit creation response");
    return data.sha;
  }

  private async updateRef(repo: RepoRef, sha: string, force: boolean): Promise<void> {
    await this.transport.request(
      `/repos/${repo.owner}/${repo.repo}/git/refs/heads/${encodeURIComponent(repo.branch)}`,
      { method: "PATCH", body: { sha, force } },
    );
  }

  // ─── GitHub Pages ─────────────────────────────────────────────────────────

  /**
   * The repository's Pages site, or null when it has none.
   *
   * A repository with Pages switched off answers 404 here, which is a fact
   * about the repository rather than a failure — so it comes back as null, the
   * same way `getRepo` treats a repository that is not there.
   */
  async getPages(owner: string, repo: string): Promise<PagesSite | null> {
    try {
      const { data } = await this.transport.request<ApiPages>(`/repos/${owner}/${repo}/pages`);
      return data ? toPagesSite(data) : null;
    } catch (error) {
      if (error instanceof GitHubError && error.code === "not-found") return null;
      throw error;
    }
  }

  /**
   * Switches Pages on for a branch and folder, or repoints an existing site.
   *
   * Two calls rather than one because GitHub uses different verbs for the two:
   * POST creates a site and fails with 409 if there already is one, PUT
   * repoints an existing site and fails with 404 if there is not. Which one is
   * needed depends on state this method is the only reasonable place to check.
   *
   * Pages on a private repository needs a paid plan. GitHub answers that with
   * a 403 whose message says so, which `errorCodeForStatus` turns into
   * `forbidden` — the caller shows GitHub's own wording rather than guessing
   * at which of several reasons applies.
   */
  async enablePages(
    owner: string,
    repo: string,
    source: { branch: string; path: "/" | "/docs" },
  ): Promise<PagesSite> {
    const existing = await this.getPages(owner, repo);

    if (existing) {
      // Already serving from the right place: repointing it would be a
      // needless write against someone else's repository settings.
      if (existing.source?.branch === source.branch && existing.source.path === source.path) {
        return existing;
      }

      await this.transport.request(`/repos/${owner}/${repo}/pages`, {
        method: "PUT",
        body: { source },
      });

      return (await this.getPages(owner, repo)) ?? existing;
    }

    const { data } = await this.transport.request<ApiPages>(`/repos/${owner}/${repo}/pages`, {
      method: "POST",
      body: { source },
    });

    // 201 carries the site; some responses are empty, so fall back to a read.
    return data ? toPagesSite(data) : ((await this.getPages(owner, repo)) as PagesSite);
  }

  // ─── Convenience wrappers ─────────────────────────────────────────────────

  async writeFile(
    repo: RepoRef,
    path: string,
    content: string,
    message: string,
    squashWindowMs?: number,
  ): Promise<CommitResult> {
    return this.commitChanges(repo, [{ op: "upsert", path, content }], {
      message,
      ...(squashWindowMs !== undefined ? { squashWindowMs } : {}),
    });
  }

  async deleteFile(repo: RepoRef, path: string, message: string): Promise<CommitResult> {
    return this.commitChanges(repo, [{ op: "delete", path }], { message });
  }

  async renameFile(
    repo: RepoRef,
    from: string,
    to: string,
    content: string,
    message: string,
  ): Promise<CommitResult> {
    return this.commitChanges(repo, [{ op: "rename", path: from, toPath: to, content }], {
      message,
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toPagesSite(data: ApiPages): PagesSite {
  return {
    url: data.html_url,
    status: data.status,
    ...(data.source ? { source: data.source } : {}),
    isPublic: data.public,
  };
}

function toPullRequest(data: ApiPullRequest): PullRequestSummary {
  return {
    number: data.number,
    url: data.html_url,
    state: data.state,
    title: data.title,
    draft: data.draft === true,
    head: data.head.ref,
    base: data.base.ref,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Encodes each path segment but keeps the slashes that GitHub expects. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Turns GitHub's flat recursive tree listing into the nested structure the
 * sidebar renders. Intermediate folders are synthesised from the blob paths, so
 * we never need the `tree` entries themselves.
 */
export function buildTree(entries: { path: string; sha: string; size?: number }[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folders = new Map<string, TreeNode>();

  const ensureFolder = (path: string): TreeNode[] => {
    if (path === "") return root;

    const existing = folders.get(path);
    if (existing?.children) return existing.children;

    const slash = path.lastIndexOf("/");
    const parentChildren = ensureFolder(slash === -1 ? "" : path.slice(0, slash));

    const node: TreeNode = {
      path,
      name: slash === -1 ? path : path.slice(slash + 1),
      kind: "folder",
      children: [],
    };
    folders.set(path, node);
    parentChildren.push(node);
    return node.children!;
  };

  for (const entry of entries) {
    const slash = entry.path.lastIndexOf("/");
    const siblings = ensureFolder(slash === -1 ? "" : entry.path.slice(0, slash));
    siblings.push({
      path: entry.path,
      name: slash === -1 ? entry.path : entry.path.slice(slash + 1),
      kind: "file",
      sha: entry.sha,
      ...(entry.size !== undefined ? { size: entry.size } : {}),
    });
  }

  sortTree(root);
  return root;
}

/** Folders first, then files, each alphabetical and case-insensitive. */
function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  for (const node of nodes) {
    if (node.children) sortTree(node.children);
  }
}
