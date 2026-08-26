"use client";

import type { TreeNode, Workspace } from "@forkleaf/types";
import { findOrphanAssets, type OrphanAsset } from "@/lib/orphan-assets";

/**
 * Scanning a repository for images no note uses, and removing them.
 *
 * The bug that made these is fixed — deleting or moving a folder now takes its
 * pictures with it — but a repository used by any earlier version is still
 * carrying the leftovers, in `assets` directories whose notes are gone. With
 * no note left in the folder, nothing in the sidebar can reach them, so
 * without this the only way to clear them is by hand on github.com.
 *
 * Two rules run through all of it, because the failure mode here is deleting a
 * picture out of a note somebody is still reading:
 *
 *   1. Every note is read, not the ones cached on this device.
 *   2. If one note cannot be read, the scan fails rather than reporting a
 *      result. A note whose text is unavailable is a note whose images cannot
 *      be accounted for, and skipping it silently would list the pictures it
 *      uses as unused.
 *
 * Nothing is deleted by scanning. The result is shown, and removing it is a
 * separate thing somebody has to ask for.
 */

/** How many notes to read at once. Enough to be quick, few enough to be polite. */
const READ_CONCURRENCY = 6;

export interface ScanResult {
  orphans: OrphanAsset[];
  /** How many notes were read to decide that, for saying what was checked. */
  notesRead: number;
}

export class ScanError extends Error {}

function repoParams(workspace: Workspace, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    owner: workspace.repo.owner,
    repo: workspace.repo.repo,
    branch: workspace.repo.branch,
    ...extra,
  });
  if (workspace.repo.directory) params.set("dir", workspace.repo.directory);
  return params.toString();
}

function flatten(nodes: TreeNode[]): { path: string; size?: number | null }[] {
  const files: { path: string; size?: number | null }[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.kind === "file") files.push({ path: node.path, size: node.size ?? null });
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return files;
}

async function tree(workspace: Workspace, all: boolean): Promise<TreeNode[]> {
  const response = await fetch(`/api/gh/tree?${repoParams(workspace, all ? { all: "1" } : {})}`);
  if (!response.ok) throw new ScanError("Could not read the repository.");
  const { tree: nodes } = (await response.json()) as { tree: TreeNode[] };
  return nodes;
}

async function readNote(workspace: Workspace, path: string): Promise<string> {
  const response = await fetch(`/api/gh/file?${repoParams(workspace, { path })}`);
  if (!response.ok) throw new ScanError(`Could not read ${path}.`);

  const { file } = (await response.json()) as { file: { content: string } | null };
  // A note listed in the tree and absent when asked for is not "an empty
  // note": something is out of step, and guessing would be guessing about
  // which images to delete.
  if (!file) throw new ScanError(`${path} is listed but could not be read.`);
  return file.content;
}

/**
 * Reads every note, a few at a time.
 *
 * Sequentially this is one round trip per note and unbearable on a real
 * notebook; all at once it is a burst that GitHub answers with a secondary
 * rate limit. `onProgress` exists because a scan of a few hundred notes is
 * long enough that a still screen reads as a hang.
 */
async function readAll(
  workspace: Workspace,
  paths: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++]!;
      contents.set(path, await readNote(workspace, path));
      onProgress?.(contents.size, paths.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, paths.length) }, worker));
  return contents;
}

/** Finds the images in a repository that no note refers to. */
export async function scanForUnusedImages(
  workspace: Workspace,
  onProgress?: (done: number, total: number) => void,
): Promise<ScanResult> {
  if (workspace.isLocal) {
    throw new ScanError("This workspace has no repository to scan.");
  }

  const [everything, markdown] = await Promise.all([tree(workspace, true), tree(workspace, false)]);

  const notePaths = flatten(markdown).map((file) => file.path);
  const contents = await readAll(workspace, notePaths, onProgress);

  return {
    orphans: findOrphanAssets(flatten(everything), contents),
    notesRead: contents.size,
  };
}

/**
 * Deletes the given paths in one commit.
 *
 * One commit, not one each: a hundred separate commits for a tidy-up is a
 * history nobody can read past, and it is the same batching every other write
 * in the app already goes through.
 */
export async function deleteUnusedImages(
  workspace: Workspace,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) return;

  const response = await fetch("/api/gh/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: workspace.repo.owner,
      repo: workspace.repo.repo,
      branch: workspace.repo.branch,
      dir: workspace.repo.directory,
      message:
        paths.length === 1
          ? `forkleaf: remove unused image ${paths[0]!.split("/").pop()}`
          : `forkleaf: remove ${paths.length} unused images`,
      // No squashing. This is a deliberate, explained commit, and folding it
      // into whatever note edit came before it would hide it.
      squashWindowMs: 0,
      changes: paths.map((path) => ({ op: "delete", path })),
    }),
  });

  if (!response.ok) {
    throw new ScanError("Those images could not be removed. Nothing was changed.");
  }
}
