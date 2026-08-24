"use client";

import { flattenTree } from "@/lib/library";
import type { TreeNode, Workspace } from "@forkleaf/types";
import { repairRelativeLinks, type LinkRepair } from "@forkleaf/markdown-engine";

/**
 * Finding the images a note has lost track of.
 *
 * A note refers to its pictures by a path relative to itself. That is what
 * makes it render on github.com — and it means a note whose links were written
 * somewhere else, before it was moved or before this app filed images beside
 * the note using them, points at files that are not there. Every image in it is
 * a broken box, in this app and on GitHub, even though the files are still in
 * the repository a folder or two away.
 *
 * Repairing that needs to see the whole repository, not just the notes in it,
 * so this asks for the full tree rather than the markdown-only one the sidebar
 * is built from.
 */

/** True for a note that references at least one file of its own repository. */
export function hasRelativeImages(content: string): boolean {
  return /!\[[^\]]*\]\(\s*(?!<?[a-z][a-z0-9+.-]*:|<?\/\/|<?\/|#)/i.test(content);
}

interface CachedFiles {
  at: number;
  paths: string[];
}

/**
 * The repository's file list, remembered for a few minutes.
 *
 * Opening a note should not cost a full tree read, and a repository does not
 * gain files while somebody reads one note. Short enough that an image
 * committed from another device is found on the next note opened.
 */
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, CachedFiles>();

/** Forgets a workspace's file list, after something is added to it. */
export function forgetRepositoryFiles(workspaceId: string): void {
  cache.delete(workspaceId);
}

async function repositoryFiles(workspace: Workspace): Promise<string[]> {
  const cached = cache.get(workspace.id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.paths;

  const params = new URLSearchParams({
    owner: workspace.repo.owner,
    repo: workspace.repo.repo,
    branch: workspace.repo.branch,
    all: "1",
  });
  if (workspace.repo.directory) params.set("dir", workspace.repo.directory);

  const response = await fetch(`/api/gh/tree?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Could not read the repository to find those images.");
  }

  const { tree } = (await response.json()) as { tree: TreeNode[] };
  const paths = flattenTree(tree);
  cache.set(workspace.id, { at: Date.now(), paths });
  return paths;
}

/**
 * Repairs one note's broken links.
 *
 * The images held on this device are tried first, and for most notes that is
 * the whole answer with no request at all: a screenshot pasted in this app is
 * on this device whether or not it also reached GitHub. Only a note still
 * missing something goes on to read the repository.
 */
export async function repairNoteLinks(
  workspace: Workspace | null,
  notePath: string,
  content: string,
  /** Repository paths of the images held locally, from the asset store. */
  localPaths: Iterable<string>,
): Promise<LinkRepair> {
  const locally = repairRelativeLinks(content, notePath, localPaths);
  if (locally.unresolved.length === 0) return locally;
  if (!workspace || workspace.isLocal) return locally;

  const files = await repositoryFiles(workspace);
  // Run against everything at once rather than on the half-repaired text, so
  // one pass decides each link with the full picture available.
  return repairRelativeLinks(content, notePath, [...localPaths, ...files]);
}
