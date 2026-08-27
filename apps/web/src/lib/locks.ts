/**
 * Which notes are locked against editing, and where that is remembered.
 *
 * A reference note is one you read far more often than you write. Reading it
 * means clicking around in it, which leaves the caret somewhere in the text —
 * and from there a stray keystroke is an edit that saves itself, commits
 * itself, and is found weeks later as a lone character in the middle of a
 * paragraph. Locking is the answer to that, and it is deliberately a small
 * idea: a list of paths that will not accept writes.
 *
 * Per device, beside the other per-device preferences, rather than in the
 * note's frontmatter. Locking protects your own hands rather than describing
 * the document, and writing it into the file would mean a commit every time
 * anybody locked or unlocked anything — history nobody asked for, from a
 * button that is supposed to prevent unasked-for changes.
 *
 * The rules live here, apart from the hook that holds the state, so that "is
 * this note locked" has one answer that can be tested on its own.
 */

/** Meta key the locked list is stored under, per workspace. */
export function lockedKey(workspaceId: string): string {
  return `locked:${workspaceId}`;
}

/** True when this path may not be written to. */
export function isPathLocked(locked: readonly string[], path: string | null | undefined): boolean {
  return path ? locked.includes(path) : false;
}

/**
 * The list with this path locked, or unlocked if it already was.
 *
 * Returns a new array rather than mutating, and never grows a duplicate: a
 * path listed twice would unlock on the first press and stay locked, which is
 * the kind of bug a toggle can hide for a long time.
 */
export function toggleLock(locked: readonly string[], path: string): string[] {
  return locked.includes(path) ? locked.filter((item) => item !== path) : [...locked, path];
}

/**
 * The list with a renamed note's lock carried over.
 *
 * Renaming a note is not unlocking it. Without this the lock would silently
 * fall off — and the reader, who has every reason to believe the note is still
 * protected, would find out by typing into it.
 */
export function renameLock(locked: readonly string[], from: string, to: string): string[] {
  if (!locked.includes(from)) return [...locked];
  return locked.map((item) => (item === from ? to : item));
}

/**
 * The list with notes that no longer exist dropped.
 *
 * A deleted note leaving its path behind would lock the next note created at
 * that path, which is a haunting rather than a feature.
 */
export function forgetLock(locked: readonly string[], path: string): string[] {
  return locked.filter((item) => item !== path && !item.startsWith(`${path}/`));
}
