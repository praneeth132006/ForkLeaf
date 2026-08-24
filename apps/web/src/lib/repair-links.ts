"use client";

import { flattenTree } from "@/lib/library";
import type { TreeNode, Workspace } from "@forkleaf/types";
import { repairRelativeLinks, type LinkRepair } from "@forkleaf/markdown-engine";

/**
 * Finding the images a note has lost track of.
 *
 * A note refers to its pictures by a path relative to itself. That is what
 * makes it render on github.com — and it means a note whose links were written
 * somewhere else, before it was moved or before images were filed beside the
 * note that uses them, points at files that are not there. Every image in it is
 * a broken box, in this app and on GitHub, even though the files are still in
 * the repository a folder or two away.
 *
 * Repairing that needs to see the whole repository, not just the notes in it,
 * so this asks for the full tree rather than the markdown-only one the sidebar
 * is built from.
 */
export async function repairNoteLinks(
  workspace: Workspace,
  notePath: string,
  content: string,
): Promise<LinkRepair> {
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
  return repairRelativeLinks(content, notePath, flattenTree(tree));
}
