import { workspaceId, type RepoRef, type Workspace } from "@forkleaf/types";

/**
 * Where a workspace's published pages go.
 *
 * Publishing has always meant committing a rendered page to `docs/` in the
 * same repository the notes live in, and serving it with GitHub Pages. That is
 * the right default and it breaks in one specific, common case: a private
 * notebook. Pages on a private repository needs a paid plan, and even with
 * one, the published page sits in the repository you were keeping private —
 * so the only way to have private notes and a public page was two repositories
 * and copy-paste between them.
 *
 * A publish target fixes that without changing the default. Notes stay in the
 * private repository; the rendered page is committed to a public one. One
 * workspace, two audiences.
 */

/** The repository a workspace publishes into. */
export function publishTargetOf(workspace: Workspace): RepoRef {
  // The notes' own repository unless something else was chosen, which is what
  // every workspace made before this feature existed will answer.
  return workspace.publishRepo ?? workspace.repo;
}

/** True when pages go somewhere other than the notes themselves. */
export function isSplitPublishing(workspace: Workspace): boolean {
  const target = publishTargetOf(workspace);
  return target.owner !== workspace.repo.owner || target.repo !== workspace.repo.repo;
}

/** GitHub's rules for a repository name, which is what may be typed here. */
const NAME = /^(?=.*[^.])[A-Za-z0-9._-]+$/;

export interface TargetInput {
  owner: string;
  repo: string;
  branch?: string;
}

/**
 * Reads a typed `owner/name` into a repository reference, or null.
 *
 * The directory is always the repository root: a publish target holds rendered
 * pages, not notes, and inheriting the notes' subfolder would bury `docs/`
 * somewhere GitHub Pages does not look.
 */
export function parseTarget(value: string, branch = "main"): RepoRef | null {
  const trimmed = value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length !== 2) return null;

  const [owner, repo] = parts;
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return null;

  return { owner, repo, branch, directory: "" };
}

/** `owner/name`, for showing a target back to the person who chose it. */
export function describeTarget(repo: RepoRef): string {
  return `${repo.owner}/${repo.repo}`;
}

/**
 * Whether a target is a sensible place to publish, and what to say if not.
 *
 * Returns a reason rather than a boolean so the dialog can explain itself. The
 * one that matters is publishing into the notes repository *while it is
 * private*: it is not an error — it is what happens by default — but it is the
 * case where somebody thinks they have published something and has not.
 */
export function targetWarning(
  target: RepoRef,
  notes: RepoRef,
  options: { notesArePrivate?: boolean; targetIsPrivate?: boolean } = {},
): string | null {
  const sameRepo = target.owner === notes.owner && target.repo === notes.repo;

  if (sameRepo && options.notesArePrivate) {
    return "These notes are in a private repository, so GitHub Pages needs a paid plan to serve them. Publish to a public repository instead and the notes stay private.";
  }

  if (!sameRepo && options.targetIsPrivate) {
    return `${describeTarget(target)} is private, so GitHub will not serve pages from it on a free plan.`;
  }

  if (!sameRepo) {
    return `Pages will be committed to ${describeTarget(target)}, which is a different repository from your notes. Anything you publish is readable by anyone.`;
  }

  return null;
}

/** A workspace with its publish target changed, ready to be stored. */
export function withPublishTarget(workspace: Workspace, target: RepoRef | null): Workspace {
  if (!target) {
    // Explicitly cleared: back to publishing beside the notes. The key is
    // removed rather than set to undefined, so a workspace that has never been
    // split and one that has been un-split are the same shape in storage.
    const next = { ...workspace };
    delete next.publishRepo;
    return next;
  }

  return { ...workspace, publishRepo: target };
}

/**
 * The id a workspace has, which must not move when its publish target does.
 *
 * Exported mostly as a statement of intent: the id is derived from the notes
 * repository alone, so changing where pages go never orphans the notes stored
 * against it.
 */
export function idIsStableAcross(workspace: Workspace): boolean {
  return workspace.id === workspaceId(workspace.repo);
}
