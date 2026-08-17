import type { RepoRef, TreeNode } from "@mdnotion/types";
import { Transport, type RateLimit, type TransportConfig } from "./http";
import { GitHubError } from "./errors";
import { encodeBase64, decodeBase64 } from "./base64";

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

interface ApiContent {
  content?: string;
  encoding?: string;
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
  /** False for repos the user can only read — mdnotion needs write access. */
  canPush: boolean;
  description: string | null;
  updatedAt: string;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
  size: number;
}

/** One file operation to include in a commit. */
export type FileChange =
  | { op: "upsert"; path: string; content: string }
  | { op: "delete"; path: string }
  | { op: "rename"; path: string; toPath: string; content: string };

export interface CommitOptions {
  message: string;
  /**
   * When set, a commit made by mdnotion within this many milliseconds is
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
const COMMIT_MARKER = "mdnotion:";

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
        description: options.description ?? "My notes, synced by mdnotion",
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
      console.warn("[mdnotion] Repository tree was truncated by GitHub; showing a partial list.");
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

    for (const change of changes) {
      if (change.op === "delete") {
        treeEntries.push({ path: change.path, mode: FILE_MODE, type: "blob", sha: null });
        continue;
      }

      const targetPath = change.op === "rename" ? change.toPath : change.path;
      const sha = await this.createBlob(repo, change.content);
      blobShas[targetPath] = sha;
      treeEntries.push({ path: targetPath, mode: FILE_MODE, type: "blob", sha });

      // A rename is an add at the new path plus a delete at the old one.
      if (change.op === "rename" && change.path !== change.toPath) {
        treeEntries.push({ path: change.path, mode: FILE_MODE, type: "blob", sha: null });
      }
    }

    const newTreeSha = await this.createTree(repo, baseTreeSha, treeEntries);

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
   * A commit is safe to rewrite only if mdnotion made it, it is recent, and it
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

  private async createBlob(repo: RepoRef, content: string): Promise<string> {
    const { data } = await this.transport.request<{ sha: string }>(
      `/repos/${repo.owner}/${repo.repo}/git/blobs`,
      { method: "POST", body: { content: encodeBase64(content), encoding: "base64" } },
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
