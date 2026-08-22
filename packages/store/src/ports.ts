import type { LocalAsset, Note, PendingChange, TreeNode, Workspace } from "@forkleaf/types";

/**
 * Ports the sync engine depends on.
 *
 * Keeping these as interfaces rather than concrete imports is what lets the
 * engine be tested in Node against in-memory fakes, while the browser wires it
 * to IndexedDB and to a server route that holds the GitHub token.
 */

/** Local durable storage. Implemented by IndexedDB in the browser. */
export interface LocalDatabase {
  getNote(id: string): Promise<Note | undefined>;
  putNote(note: Note): Promise<void>;
  deleteNote(id: string): Promise<void>;
  listNotes(workspaceId: string): Promise<Note[]>;

  getWorkspace(id: string): Promise<Workspace | undefined>;
  putWorkspace(workspace: Workspace): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  listWorkspaces(): Promise<Workspace[]>;

  listQueue(workspaceId?: string): Promise<PendingChange[]>;
  putQueueItem(item: PendingChange): Promise<void>;
  deleteQueueItem(id: string): Promise<void>;

  getTreeCache(workspaceId: string): Promise<TreeNode[] | undefined>;
  putTreeCache(workspaceId: string, tree: TreeNode[]): Promise<void>;

  getAsset(id: string): Promise<LocalAsset | undefined>;
  putAsset(asset: LocalAsset): Promise<void>;
  deleteAsset(id: string): Promise<void>;
  listAssets(workspaceId: string): Promise<LocalAsset[]>;

  getMeta<T>(key: string): Promise<T | undefined>;
  putMeta<T>(key: string, value: T): Promise<void>;
}

export interface RemoteCommitInput {
  workspaceId: string;
  message: string;
  squashWindowMs: number;
  changes: {
    op: "upsert" | "delete" | "rename";
    path: string;
    toPath?: string;
    content?: string;
  }[];
}

export interface RemoteCommitResult {
  sha: string;
  blobShas: Record<string, string>;
  squashed: boolean;
}

/**
 * The GitHub side, as seen from the browser.
 *
 * In the real app every method is an authenticated request to our own server,
 * which holds the OAuth token — the browser never sees it.
 */
export interface RemoteGateway {
  listTree(workspaceId: string): Promise<TreeNode[]>;
  readFile(workspaceId: string, path: string): Promise<{ content: string; sha: string } | null>;
  commit(input: RemoteCommitInput): Promise<RemoteCommitResult>;
}
