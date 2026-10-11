import type {
  GitHubClient,
  LoungeDto,
  NoteConversationDto,
  ThreadSummaryDto,
} from "@forkleaf/github-client";
import type { RepoRef, TreeNode } from "@forkleaf/types";

/**
 * The notebook as the MCP tools see it: markdown files at paths.
 *
 * An interface, so the tools are tested against notes held in memory and run
 * against a GitHub repository through the same client ForkLeaf itself uses —
 * which means an assistant's write is an ordinary commit, in the history like
 * anything else, marked as ForkLeaf's.
 */

export interface NotebookFile {
  path: string;
  content: string;
}

/**
 * The notebook's conversations — its GitHub Discussions — as the tools see
 * them. Optional on a notebook: one that is not a GitHub repository has none.
 */
export interface NotebookConversations {
  /** A note's own conversation, and the threads about its passages. */
  forNote(
    path: string,
  ): Promise<{ conversation: NoteConversationDto; passages: ThreadSummaryDto[] }>;
  /** A page of every thread, newest activity first. */
  list(options?: { after?: string }): Promise<LoungeDto>;
  /** One thread by number. */
  read(number: number): Promise<NoteConversationDto>;
  /** Posts a message in a thread, and says where it went. */
  reply(number: number, body: string): Promise<{ url: string }>;
}

export interface Notebook {
  /** Every markdown path in the notebook. */
  paths(): Promise<string[]>;
  /** A note's full text, front matter included, or null when there is none. */
  read(path: string): Promise<string | null>;
  /** Every note, up to the notebook's limit. */
  readAll(): Promise<NotebookFile[]>;
  /** Creates or replaces a note as one commit. */
  write(path: string, content: string, message: string): Promise<void>;
  /** The notebook's conversations, where it has any. */
  readonly conversations?: NotebookConversations;
}

const MARKDOWN = /\.mdx?$/i;

export class MemoryNotebook implements Notebook {
  readonly files = new Map<string, string>();
  readonly commits: { path: string; content: string; message: string }[] = [];

  constructor(
    files: Record<string, string> = {},
    readonly conversations?: NotebookConversations,
  ) {
    for (const [path, content] of Object.entries(files)) this.files.set(path, content);
  }

  async paths() {
    return [...this.files.keys()].filter((path) => MARKDOWN.test(path)).sort();
  }

  async read(path: string) {
    return this.files.get(path) ?? null;
  }

  async readAll() {
    return (await this.paths()).map((path) => ({ path, content: this.files.get(path)! }));
  }

  async write(path: string, content: string, message: string) {
    this.files.set(path, content);
    this.commits.push({ path, content, message });
  }
}

function filesIn(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "file" ? [node.path] : filesIn(node.children ?? []),
  );
}

async function inPool<T, R>(items: readonly T[], limit: number, job: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await job(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface GitHubNotebookOptions {
  /** Notes read for search and backlinks. Past this, the rest are not searched. */
  maxNotes?: number;
  /** How long a read is trusted before it is fetched again. */
  cacheMs?: number;
  now?: () => number;
}

export class GitHubNotebook implements Notebook {
  private readonly maxNotes: number;
  private readonly cacheMs: number;
  private readonly now: () => number;
  private listing: { at: number; paths: string[] } | null = null;
  private readonly texts = new Map<string, { at: number; content: string | null }>();
  readonly conversations: NotebookConversations;

  constructor(
    private readonly client: GitHubClient,
    private readonly repo: RepoRef,
    options: GitHubNotebookOptions = {},
  ) {
    this.maxNotes = options.maxNotes ?? 300;
    this.cacheMs = options.cacheMs ?? 30_000;
    this.now = options.now ?? Date.now;

    const { owner, repo: name } = repo;
    this.conversations = {
      forNote: async (path) => {
        const [conversation, passages] = await Promise.all([
          client.findNoteConversation({ owner, repo: name, path }),
          client.findPassageThreads({ owner, repo: name, path }).catch(() => []),
        ]);
        return { conversation, passages };
      },
      list: (options = {}) =>
        client.listDiscussions({
          owner,
          repo: name,
          ...(options.after ? { after: options.after } : {}),
        }),
      read: (number) => client.readDiscussion({ owner, repo: name, number }),
      reply: async (number, body) => {
        const found = await client.readDiscussion({ owner, repo: name, number });
        if (!found.discussion) throw new Error(`Discussion #${number} is not there.`);
        const comment = await client.addDiscussionComment({
          discussionId: found.discussion.id,
          body,
        });
        return { url: comment.url };
      },
    };
  }

  private fresh(at: number) {
    return this.now() - at < this.cacheMs;
  }

  async paths() {
    if (this.listing && this.fresh(this.listing.at)) return this.listing.paths;
    const tree = await this.client.listTree(this.repo);
    const paths = filesIn(tree)
      .filter((path) => MARKDOWN.test(path))
      .sort();
    this.listing = { at: this.now(), paths };
    return paths;
  }

  async read(path: string) {
    const cached = this.texts.get(path);
    if (cached && this.fresh(cached.at)) return cached.content;
    const file = await this.client.readFile(this.repo, path);
    const content = file?.content ?? null;
    this.texts.set(path, { at: this.now(), content });
    return content;
  }

  async readAll() {
    const paths = (await this.paths()).slice(0, this.maxNotes);
    const contents = await inPool(paths, 6, (path) => this.read(path));
    return paths.flatMap((path, index) => {
      const content = contents[index];
      return content === null || content === undefined ? [] : [{ path, content }];
    });
  }

  async write(path: string, content: string, message: string) {
    // The marker every ForkLeaf commit carries, so the history says where it came
    // from. No squash window: an assistant's edit is its own commit.
    await this.client.commitChanges(this.repo, [{ op: "upsert", path, content }], {
      message: `forkleaf: ${message}`,
    });
    this.listing = null;
    this.texts.set(path, { at: this.now(), content });
  }
}
