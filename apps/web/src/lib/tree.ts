import type { TreeNode } from "@forkleaf/types";

/**
 * Every folder path in a tree, depth-first, so nesting reads in order.
 *
 * Shared because three places need the same list and the same order: the
 * sidebar's "new note in…" menu, the folder picker in the new-folder dialog,
 * and any test that wants to assert against what those offer. Two independent
 * copies of a depth-first walk is two chances for them to disagree about
 * whether `a/b` comes before `a/c`.
 */
export function collectFolders(nodes: readonly TreeNode[]): string[] {
  const paths: string[] = [];

  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      if (node.kind !== "folder") continue;
      paths.push(node.path);
      walk(node.children ?? []);
    }
  };

  walk(nodes);
  return paths;
}

/** Every note path in a tree, for checking a remembered path still exists. */
export function collectFilePaths(nodes: readonly TreeNode[]): string[] {
  const paths: string[] = [];

  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      if (node.kind === "file") paths.push(node.path);
      walk(node.children ?? []);
    }
  };

  walk(nodes);
  return paths;
}
