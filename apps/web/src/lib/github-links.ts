import type { Workspace } from "@forkleaf/types";

/**
 * Links back to github.com.
 *
 * ForkLeaf's whole claim is that your notes are ordinary files in a repository
 * you own. That claim is invisible unless the app will actually show you the
 * repository, so these power "Open on GitHub" links in the editor.
 *
 * Every helper returns `null` for the local workspace, which has no remote.
 */

function base(workspace: Workspace | null): string | null {
  if (!workspace || workspace.isLocal) return null;
  const { owner, repo } = workspace.repo;
  if (!owner || !repo) return null;
  return `https://github.com/${owner}/${repo}`;
}

/** The repository home page. */
export function repoUrl(workspace: Workspace | null): string | null {
  return base(workspace);
}

/** A single note, rendered by GitHub — diagrams included, since they are ```mermaid fences. */
export function fileUrl(workspace: Workspace | null, path: string | null): string | null {
  const root = base(workspace);
  if (!root || !path) return null;

  const { branch, directory } = workspace!.repo;
  const full = directory ? `${directory.replace(/\/$/, "")}/${path}` : path;
  return `${root}/blob/${encodeURIComponent(branch)}/${full.split("/").map(encodeURIComponent).join("/")}`;
}

/** The commit history for a single note — the version history of that note. */
export function historyUrl(workspace: Workspace | null, path: string | null): string | null {
  const root = base(workspace);
  if (!root || !path) return null;

  const { branch, directory } = workspace!.repo;
  const full = directory ? `${directory.replace(/\/$/, "")}/${path}` : path;
  return `${root}/commits/${encodeURIComponent(branch)}/${full.split("/").map(encodeURIComponent).join("/")}`;
}

/** Every commit on the branch — what ForkLeaf has been writing on your behalf. */
export function commitsUrl(workspace: Workspace | null): string | null {
  const root = base(workspace);
  if (!root) return null;
  return `${root}/commits/${encodeURIComponent(workspace!.repo.branch)}`;
}
