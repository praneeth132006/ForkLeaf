import type { GitHubClient, RepoSummary } from "@forkleaf/github-client";
import { GitHubNotebook, type Notebook } from "./notebook";
import { ToolInputError } from "./protocol";

/**
 * Which notebooks an assistant may use.
 *
 * A connection used to be one repository and nothing else: an assistant asked
 * to write in another of the person's repositories had no way to, and no way
 * to say why. A library is the repository chosen when connecting — the
 * default, used whenever a tool names none — plus, when the person allowed it,
 * any other repository their GitHub account can reach, opened by name.
 */

export interface RepositoryEntry {
  /** `owner/name`. */
  name: string;
  private: boolean;
  /** False for a repository this connection may only read. */
  writable: boolean;
  /** The repository chosen when connecting. */
  isDefault: boolean;
}

export interface OpenedNotebook {
  /** `owner/name`, or a label for a notebook that is not a repository. */
  repository: string;
  notebook: Notebook;
  /** The folder notes live under; every path must be inside it. "" is everything. */
  root: string;
  readOnly: boolean;
  /** Where a person can see a note, or null when there is nowhere to link to. */
  link(path: string): string | null;
}

export interface NotebookLibrary {
  /** The repository a tool uses when it does not name one. */
  readonly defaultRepository: string;
  /** True when tools may name a repository other than the default. */
  readonly multiple: boolean;
  /** Every repository a tool may name, the default first. */
  repositories(): Promise<RepositoryEntry[]>;
  /** The notebook for a repository, or the default for none. */
  open(repository?: string): Promise<OpenedNotebook>;
}

/** A library of exactly one notebook — what tests and simple servers use. */
export function singleNotebook(
  notebook: Notebook,
  options: { name?: string; root?: string; readOnly?: boolean } = {},
): NotebookLibrary {
  const name = options.name ?? "notebook";
  const opened: OpenedNotebook = {
    repository: name,
    notebook,
    root: options.root ?? "",
    readOnly: options.readOnly ?? false,
    link: () => null,
  };
  return {
    defaultRepository: name,
    multiple: false,
    repositories: async () => [
      { name, private: true, writable: !opened.readOnly, isDefault: true },
    ],
    open: async (repository) => {
      if (repository && !sameName(repository, name)) throw onlyOne(name);
      return opened;
    },
  };
}

export interface GitHubLibraryOptions {
  /** The repository chosen when connecting. */
  owner: string;
  repo: string;
  /** Null for the repository's default branch. */
  branch: string | null;
  /** The folder notes live under in that repository. */
  directory: string;
  /** Applies to every repository. */
  readOnly: boolean;
  /** Whether other repositories the token can reach may be opened by name. */
  allRepositories: boolean;
}

const NAME = /^[\w.-]{1,100}$/;

/** `owner/name` compared the way GitHub does — case-insensitively. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function onlyOne(name: string): ToolInputError {
  return new ToolInputError(
    `This connection only covers ${name}. To use other repositories too, remove ForkLeaf from ` +
      `your assistant and connect it again with "Also let it use my other repositories" ticked.`,
  );
}

/** A note's page on github.com, each path segment escaped on its own. */
export function githubBlobUrl(owner: string, repo: string, branch: string, path: string): string {
  const segments = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${segments}`;
}

export class GitHubLibrary implements NotebookLibrary {
  readonly defaultRepository: string;
  readonly multiple: boolean;
  private readonly opened = new Map<string, Promise<OpenedNotebook>>();
  private listing: Promise<RepoSummary[]> | null = null;

  constructor(
    private readonly client: GitHubClient,
    private readonly options: GitHubLibraryOptions,
  ) {
    this.defaultRepository = `${options.owner}/${options.repo}`;
    this.multiple = options.allRepositories;
  }

  private list(): Promise<RepoSummary[]> {
    this.listing ??= this.client.listRepos();
    return this.listing;
  }

  async repositories(): Promise<RepositoryEntry[]> {
    const own: RepositoryEntry = {
      name: this.defaultRepository,
      private: true,
      writable: !this.options.readOnly,
      isDefault: true,
    };
    if (!this.multiple) return [own];

    const others = (await this.list())
      .filter((repo) => !sameName(repo.fullName, this.defaultRepository))
      .map((repo) => ({
        name: repo.fullName,
        private: repo.private,
        writable: !this.options.readOnly && repo.canPush,
        isDefault: false,
      }));
    return [own, ...others];
  }

  open(repository?: string): Promise<OpenedNotebook> {
    const asked = repository?.trim() ?? "";
    const isDefault =
      asked === "" || sameName(asked, this.defaultRepository) || sameName(asked, this.options.repo);
    const key = isDefault ? "" : asked.toLowerCase();

    let opening = this.opened.get(key);
    if (!opening) {
      opening = isDefault ? this.openDefault() : this.openOther(asked);
      // A failure is not remembered: a mistyped name corrected on the next
      // call should not stay an error.
      opening.catch(() => this.opened.delete(key));
      this.opened.set(key, opening);
    }
    return opening;
  }

  private async openDefault(): Promise<OpenedNotebook> {
    const { owner, repo, directory, readOnly } = this.options;
    let branch = this.options.branch;
    if (!branch) {
      const found = await this.client.getRepo(owner, repo).catch(() => null);
      if (!found) {
        throw new ToolInputError(
          `${owner}/${repo} could not be read. It may have been renamed or deleted, or access was removed — connect again.`,
        );
      }
      branch = found.defaultBranch;
    }
    return this.notebookFor(owner, repo, branch, directory, readOnly);
  }

  private async openOther(asked: string): Promise<OpenedNotebook> {
    if (!this.multiple) throw onlyOne(this.defaultRepository);

    let owner: string;
    let name: string;
    if (asked.includes("/")) {
      [owner = "", name = ""] = asked.split("/");
    } else {
      // A bare name is accepted when exactly one of their repositories has it.
      const matches = (await this.list()).filter((repo) => sameName(repo.name, asked));
      if (matches.length !== 1) {
        throw new ToolInputError(
          matches.length === 0
            ? `There is no repository called ${asked}. Use list_repositories to see the names, written as owner/name.`
            : `More than one repository is called ${asked}: ${matches.map((repo) => repo.fullName).join(", ")}. Say which, as owner/name.`,
        );
      }
      owner = matches[0]!.owner;
      name = matches[0]!.name;
    }
    if (!NAME.test(owner) || !NAME.test(name) || asked.split("/").length > 2) {
      throw new ToolInputError(`${asked} is not a repository name. Write it as owner/name.`);
    }

    const found = await this.client.getRepo(owner, name).catch(() => null);
    if (!found) {
      throw new ToolInputError(
        `${owner}/${name} was not found, or this connection cannot read it. Use list_repositories to see the ones it can.`,
      );
    }
    return this.notebookFor(
      found.owner,
      found.name,
      found.defaultBranch,
      "",
      this.options.readOnly || !found.canPush,
    );
  }

  private notebookFor(
    owner: string,
    repo: string,
    branch: string,
    directory: string,
    readOnly: boolean,
  ): OpenedNotebook {
    return {
      repository: `${owner}/${repo}`,
      notebook: new GitHubNotebook(this.client, { owner, repo, branch, directory }),
      root: directory,
      readOnly,
      link: (path) => githubBlobUrl(owner, repo, branch, path),
    };
  }
}
