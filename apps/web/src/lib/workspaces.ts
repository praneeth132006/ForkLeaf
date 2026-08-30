import type { LocalDatabase, NoteRepository } from "@forkleaf/store";
import type { Workspace } from "@forkleaf/types";

/**
 * The workspace that exists before any repository is connected.
 *
 * Notes written here live in this browser's IndexedDB and nowhere else, which
 * is what makes ForkLeaf usable without a GitHub account at all — and what
 * gives someone who has just signed in somewhere to write while they decide
 * which repository their notes belong in.
 *
 * Defined once and shared, because the editor and the dashboard both create it
 * on first run and two copies with different ids would be two notebooks.
 */
export const LOCAL_WORKSPACE: Workspace = {
  id: "local",
  name: "On this device",
  repo: { owner: "local", repo: "local", branch: "local", directory: "" },
  isDefault: true,
  isLocal: true,
  createdAt: new Date(0).toISOString(),
  lastOpenedAt: new Date(0).toISOString(),
};

/**
 * One repository, however many branches it has been read on.
 *
 * A workspace id is `owner/repo@branch:directory`, and it has to be: notes,
 * queued commits and the cached tree are all filed under it, and a note read
 * on `main` is not the same file as the note at that path on a draft branch.
 * Sharing one id across branches would show whichever copy happened to be
 * cached, which is worse than showing nothing.
 *
 * But that made switching branches *look* like connecting a repository twice:
 * every branch ever opened left a row behind in the workspace switcher, so a
 * repository read on three branches appeared three times under one name, and
 * disconnecting the wrong one threw away notes that were never pushed. This is
 * the other half of that identity — the repository, without the branch — which
 * is what the switcher is actually a list of.
 */
export function repositoryKey(workspace: Workspace): string {
  if (workspace.isLocal) return `local:${workspace.id}`;
  return `${workspace.repo.owner}/${workspace.repo.repo}:${workspace.repo.directory}`;
}

/**
 * Retires the workspace rows left behind by branch switches.
 *
 * Only rows for the same repository as `keep`, and only rows with an empty
 * queue. That second condition is not a nicety: a branch left with unpushed
 * edits is somebody's unsaved writing, and `removeWorkspace` deletes the notes
 * along with the row. Those stay listed — a second entry for a branch holding
 * work that never left this device is a true statement, and the only way to
 * get back to it.
 *
 * Returns the workspaces that survive, in the order they came in.
 */
export async function collapseBranchDuplicates(options: {
  workspaces: Workspace[];
  /** The row that speaks for this repository — normally the one just opened. */
  keep: Workspace;
  notes: NoteRepository;
  db: LocalDatabase;
  /** Dropped from the gateway's lookup table too, so nothing can still call it. */
  unregister?: (workspaceId: string) => void;
}): Promise<Workspace[]> {
  const { workspaces, keep, notes, db, unregister } = options;
  if (keep.isLocal) return workspaces;

  const key = repositoryKey(keep);
  const stale = workspaces.filter(
    (workspace) =>
      !workspace.isLocal && workspace.id !== keep.id && repositoryKey(workspace) === key,
  );
  if (stale.length === 0) return workspaces;

  const removed = new Set<string>();

  for (const workspace of stale) {
    const pending = await db.listQueue(workspace.id).catch(() => []);
    if (pending.length > 0) continue;

    await notes.removeWorkspace(workspace.id);
    unregister?.(workspace.id);
    removed.add(workspace.id);
  }

  return workspaces.filter((workspace) => !removed.has(workspace.id));
}

// ─── Whose notebook is this? ────────────────────────────────────────────────

/**
 * Which of these workspaces the signed-in account is allowed to see.
 *
 * IndexedDB is per-browser, not per-person. Before this, signing out and
 * signing in as somebody else left every workspace and every cached note from
 * the previous account sitting there: their repository names, their folder
 * structure, the full text of every note they had opened, and an editor
 * perfectly willing to let the new arrival type into them.
 *
 * GitHub itself was never exposed — every request is authorised server-side by
 * the session cookie, which is why a repository the new account cannot read
 * showed "Not Found" rather than its contents. The leak was the local copy,
 * and the local copy is where the words are.
 *
 * So a repository workspace now belongs to the account that connected it, and
 * is listed for nobody else. The on-device workspace is deliberately exempt:
 * it belongs to the browser, has no account behind it, and hiding it from a
 * signed-in user would hide notes that exist nowhere else.
 */
export function visibleWorkspaces(
  workspaces: readonly Workspace[],
  /** GitHub's numeric account id, or null when signed out. */
  accountId: number | null,
): Workspace[] {
  return workspaces.filter((workspace) => {
    if (workspace.isLocal) return true;
    // Unowned rows are pre-migration and are handled by `claimUnowned`, which
    // runs before this. Anything still unowned here belongs to a signed-out
    // browser, and a repository workspace is not usable signed out anyway.
    if (workspace.ownerId == null) return false;
    return workspace.ownerId === accountId;
  });
}

/**
 * Stamps the workspaces an upgrade left without an owner.
 *
 * Everything connected before this field existed has no `ownerId`, and there
 * is no way to work out from the data which account connected it. Refusing to
 * show them would mean everybody losing their notebooks on upgrade, so they
 * are claimed once, by the first account to open the app afterwards.
 *
 * `alreadyClaimed` is what keeps that "once" honest: after the first signed-in
 * boot the database records who claimed it, and a later, different account
 * claims nothing. The one-time window is real and unavoidable — it is the
 * upgrade itself — and it is far narrower than the behaviour it replaces,
 * which was every account seeing every other account's notes for ever.
 */
export function claimUnowned(
  workspaces: readonly Workspace[],
  accountId: number | null,
  alreadyClaimed: boolean,
): Workspace[] {
  if (accountId == null || alreadyClaimed) return [];

  return workspaces
    .filter((workspace) => !workspace.isLocal && workspace.ownerId == null)
    .map((workspace) => ({ ...workspace, ownerId: accountId }));
}

/**
 * Stamps a workspace with the account connecting it.
 *
 * Applied at the one place each screen adds a workspace, rather than asked of
 * every caller that builds one: the connect dialog, the repository chooser and
 * the branch switcher all construct `Workspace` objects, and an ownership
 * field that three call sites have to remember is a field that will be missing
 * from the fourth.
 *
 * The on-device workspace is returned untouched — it belongs to the browser.
 */
export function ownedBy(workspace: Workspace, accountId: number | null): Workspace {
  if (workspace.isLocal || accountId == null) return workspace;
  return { ...workspace, ownerId: accountId };
}
