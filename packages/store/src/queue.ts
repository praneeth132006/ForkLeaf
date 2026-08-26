import type { PendingChange } from "@forkleaf/types";

/**
 * Coalescing rules for the outbound change queue.
 *
 * This is the first half of "don't make a thousand commits": before anything
 * reaches GitHub, repeated edits to the same note collapse into a single
 * pending change. The second half is commit squashing in the GitHub client.
 *
 * Pure functions, no I/O, so every rule below is directly testable.
 */

export interface CoalesceInput {
  workspaceId: string;
  path: string;
  op: "upsert" | "delete" | "rename" | "move";
  toPath?: string;
  content?: string;
  encoding?: "utf8" | "base64";
  baseSha: string | null;
  now: string;
  /**
   * True when the path is known to exist in the repository despite our having
   * no sha for it.
   *
   * A note that was created and deleted before it ever synced does not need to
   * reach GitHub at all, and "no base sha" is how that is normally recognised.
   * An image is the case that breaks the rule: it is committed directly rather
   * than through this queue, so it has no sha here and yet is very much on
   * GitHub — and the rule quietly threw away every request to remove one,
   * leaving orphaned screenshots behind for notes that no longer exist.
   */
  existsRemotely?: boolean;
}

/**
 * Folds a new change into the pending queue, returning the new queue.
 *
 * The queue is kept in insertion order so commits reflect the order the user
 * actually worked in.
 */
export function coalesce(queue: PendingChange[], input: CoalesceInput): PendingChange[] {
  const others = queue.filter(
    (item) => !(item.workspaceId === input.workspaceId && affectsPath(item, input.path)),
  );
  const existing = queue.filter(
    (item) => item.workspaceId === input.workspaceId && affectsPath(item, input.path),
  );

  switch (input.op) {
    case "upsert":
      return upsert(others, existing, input);
    case "delete":
      return remove(others, existing, input);
    case "rename":
      return rename(others, existing, input);
    case "move":
      return move(others, existing, input);
  }
}

/** True when a queued change reads or writes `path` on either end of a rename. */
function affectsPath(item: PendingChange, path: string): boolean {
  return item.path === path || item.toPath === path;
}

function upsert(
  others: PendingChange[],
  existing: PendingChange[],
  input: CoalesceInput,
): PendingChange[] {
  const prior = existing[0];

  // An edit on top of a pending rename keeps the rename and updates its body,
  // so we still move the file rather than leaving a copy at the old path.
  if (prior?.op === "rename") {
    return [
      ...others,
      { ...prior, content: input.content ?? "", queuedAt: input.now, attempts: 0 },
    ];
  }

  return [
    ...others,
    {
      id: changeId(input.workspaceId, input.path),
      workspaceId: input.workspaceId,
      path: input.path,
      op: "upsert",
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.encoding !== undefined ? { encoding: input.encoding } : {}),
      // Keep the SHA we originally branched from. Adopting a newer one would
      // silently mask a remote edit that landed while we were typing.
      baseSha: prior ? prior.baseSha : input.baseSha,
      queuedAt: input.now,
      attempts: 0,
    },
  ];
}

function remove(
  others: PendingChange[],
  existing: PendingChange[],
  input: CoalesceInput,
): PendingChange[] {
  const prior = existing[0];

  // A note created offline and deleted before it ever synced never needs to
  // reach GitHub at all — drop it from the queue entirely.
  const neverPushed = prior ? prior.baseSha === null : input.baseSha === null;
  if (neverPushed && !input.existsRemotely) return others;

  return [
    ...others,
    {
      id: changeId(input.workspaceId, input.path),
      workspaceId: input.workspaceId,
      path: input.path,
      op: "delete",
      baseSha: prior ? prior.baseSha : input.baseSha,
      queuedAt: input.now,
      attempts: 0,
    },
  ];
}

function rename(
  others: PendingChange[],
  existing: PendingChange[],
  input: CoalesceInput,
): PendingChange[] {
  const prior = existing[0];
  const toPath = input.toPath ?? input.path;

  /**
   * Renaming a note that was created offline is just an upsert at the new
   * path: there is nothing at the old path on GitHub to move.
   *
   * Both shas have to be absent for that to be true. The queued change having
   * none is not enough on its own — a note pushed once and edited since can
   * carry a queued change with no sha of its own while the note itself knows
   * exactly what it is based on. Taking the shortcut there wrote a second copy
   * at the new path and left the original sitting in the repository, which is
   * the duplicate that appears after a rename. A real rename deletes the old
   * path, and a delete of a path the repository does not have is dropped
   * before the commit rather than failing it.
   */
  if (prior && prior.baseSha === null && input.baseSha === null) {
    return [
      ...others,
      {
        ...prior,
        id: changeId(input.workspaceId, toPath),
        op: "upsert",
        path: toPath,
        content: input.content ?? prior.content ?? "",
        queuedAt: input.now,
      },
    ];
  }

  // Chained renames (a → b → c) collapse to a single a → c move.
  const from = prior?.op === "rename" ? prior.path : input.path;

  return [
    ...others,
    {
      id: changeId(input.workspaceId, from),
      workspaceId: input.workspaceId,
      path: from,
      op: "rename",
      toPath,
      content: input.content ?? prior?.content ?? "",
      baseSha: prior ? prior.baseSha : input.baseSha,
      queuedAt: input.now,
      attempts: 0,
    },
  ];
}

/**
 * A move: a rename that carries no content.
 *
 * Images travel this way. Nothing about the file changes, so there is nothing
 * to upload — the commit reuses the blob already in the repository — but the
 * same queue rules apply as for a note, because a move made offline still has
 * to survive a restart and still has to arrive in the commit that moved the
 * note beside it.
 */
function move(
  others: PendingChange[],
  existing: PendingChange[],
  input: CoalesceInput,
): PendingChange[] {
  const prior = existing[0];
  const toPath = input.toPath ?? input.path;

  // Never reached GitHub, so there is nothing there to move. If bytes are
  // still queued for the old path, redirect them to the new one; otherwise the
  // whole thing is moot.
  if (prior && prior.baseSha === null && prior.op === "upsert") {
    return [
      ...others,
      { ...prior, id: changeId(input.workspaceId, toPath), path: toPath, queuedAt: input.now },
    ];
  }

  // Chained moves (a → b → c) collapse to a single a → c.
  const from = prior?.op === "move" || prior?.op === "rename" ? prior.path : input.path;
  if (from === toPath) return others;

  return [
    ...others,
    {
      id: changeId(input.workspaceId, from),
      workspaceId: input.workspaceId,
      path: from,
      op: "move",
      toPath,
      baseSha: prior ? prior.baseSha : input.baseSha,
      queuedAt: input.now,
      attempts: 0,
    },
  ];
}

export function changeId(workspaceId: string, path: string): string {
  return `${workspaceId}::${path}`;
}

/**
 * Builds a human-readable commit message for a batch.
 *
 * Single-file batches name the file, which is what makes the GitHub history
 * readable; larger batches summarise so the subject line stays short.
 */
export function describeChanges(changes: PendingChange[]): string {
  if (changes.length === 0) return "no changes";

  if (changes.length === 1) {
    const change = changes[0]!;
    const name = fileName(change.path);
    switch (change.op) {
      case "upsert":
        return change.baseSha === null ? `create ${name}` : `update ${name}`;
      case "delete":
        return `delete ${name}`;
      case "rename":
        return `rename ${name} to ${fileName(change.toPath ?? "")}`;
      case "move":
        return `move ${name} to ${fileName(change.toPath ?? "")}`;
    }
  }

  const counts = { upsert: 0, delete: 0, rename: 0, move: 0 };
  for (const change of changes) counts[change.op] += 1;

  const parts: string[] = [];
  if (counts.upsert) parts.push(`update ${counts.upsert} note${counts.upsert === 1 ? "" : "s"}`);
  if (counts.delete) parts.push(`delete ${counts.delete}`);
  if (counts.rename) parts.push(`rename ${counts.rename}`);
  if (counts.move) parts.push(`move ${counts.move}`);

  return parts.join(", ");
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
