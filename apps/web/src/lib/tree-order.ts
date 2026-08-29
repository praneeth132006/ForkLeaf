import {
  compareTreeNames,
  serialNumberOf,
  type TreeNode,
  type TreeNodeKind,
} from "@forkleaf/types";

/**
 * The order the sidebar draws a folder's contents in.
 *
 * A git repository has no file order of its own — the tree is sorted, and
 * nothing in it records what somebody wanted to read first. So the order is a
 * per-device preference, alongside the pinned notes and the open folders,
 * rather than a manifest written into the repository that no other tool would
 * understand.
 *
 * `smart` is the default and does what a numbered notebook is asking for:
 *
 *   - Anything whose name starts with a serial number is in that number's
 *     order — `1. Introduction`, `2. Networking`, … `10. Attacking AD`, which
 *     is exactly the order a plain alphabetical sort was refusing to show.
 *   - Everything else falls back to the order it was created in, oldest first,
 *     because that is the order it was written in.
 *   - Anything ForkLeaf never watched being created — every file that was
 *     already in the repository when it was connected — has no creation date
 *     to sort by, so those keep natural name order at the end of the
 *     unnumbered run. Inventing a date for them would be a worse answer than
 *     admitting we do not know one.
 */
export type TreeSortMode = "smart" | "name" | "created";

export interface TreeOrder {
  mode: TreeSortMode;
  /**
   * Folders whose contents were arranged by hand: parent path (`""` for the
   * repository root) to the paths inside it, in the order somebody put them.
   *
   * Per folder rather than one flat list, so dragging one note in one folder
   * does not freeze the ordering of the entire repository.
   */
  manual: Record<string, string[]>;
}

export const DEFAULT_TREE_ORDER: TreeOrder = { mode: "smart", manual: {} };

/** When each path was made, ISO 8601, for the folders ForkLeaf made itself. */
export type CreationTimes = Readonly<Record<string, string>>;

export const SORT_MODE_LABELS: Record<TreeSortMode, string> = {
  smart: "Numbered, then oldest first",
  name: "Name (A–Z)",
  created: "Date created",
};

/** The folder a path sits in. `""` for anything at the repository root. */
export function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/**
 * The tree in the order it should be drawn.
 *
 * Folders still come before files in every automatic mode — that is what makes
 * a deep tree scannable, and it is what every file manager does. A folder
 * arranged by hand is the one exception: somebody who dragged a note above a
 * folder meant it, and quietly putting it back would make the drag look broken.
 */
export function orderTree(
  nodes: readonly TreeNode[],
  order: TreeOrder,
  created: CreationTimes,
): TreeNode[] {
  const arrange = (list: readonly TreeNode[], parent: string): TreeNode[] => {
    const withChildren = list.map((node) =>
      node.children ? { ...node, children: arrange(node.children, node.path) } : node,
    );

    const automatic = [...withChildren].sort((a, b) =>
      compareAutomatically(a, b, order.mode, created),
    );
    return applyManual(automatic, order.manual[parent]);
  };

  return arrange(nodes, "");
}

/**
 * The hand-made order first, then anything it does not mention.
 *
 * A folder arranged by hand and then added to would otherwise have to be
 * re-arranged before the new note could be seen: the list is a record of what
 * somebody moved, not a claim to be exhaustive. New arrivals land after it, in
 * whichever automatic order is in force, which is where "and this one too"
 * belongs.
 */
function applyManual(nodes: TreeNode[], manual: readonly string[] | undefined): TreeNode[] {
  if (!manual || manual.length === 0) return nodes;

  const byPath = new Map(nodes.map((node) => [node.path, node]));
  const placed: TreeNode[] = [];
  const seen = new Set<string>();

  for (const path of manual) {
    const node = byPath.get(path);
    if (!node || seen.has(path)) continue;
    placed.push(node);
    seen.add(path);
  }

  return [...placed, ...nodes.filter((node) => !seen.has(node.path))];
}

function compareAutomatically(
  a: TreeNode,
  b: TreeNode,
  mode: TreeSortMode,
  created: CreationTimes,
): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;

  if (mode === "name") return compareTreeNames(a.name, b.name);
  if (mode === "created") return compareByCreation(a, b, created);

  const left = serialNumberOf(displayName(a));
  const right = serialNumberOf(displayName(b));

  // A numbered run sits above an unnumbered one. Mixing them by name would
  // scatter `1.`…`10.` through the alphabet, which is the whole complaint.
  if (left !== null && right !== null) {
    return left === right ? compareTreeNames(a.name, b.name) : left - right;
  }
  if (left !== null) return -1;
  if (right !== null) return 1;

  return compareByCreation(a, b, created);
}

/** Oldest first, with anything we have no date for kept in name order at the end. */
function compareByCreation(a: TreeNode, b: TreeNode, created: CreationTimes): number {
  const left = created[a.path];
  const right = created[b.path];

  if (left && right)
    return left === right ? compareTreeNames(a.name, b.name) : left < right ? -1 : 1;
  if (left) return -1;
  if (right) return 1;
  return compareTreeNames(a.name, b.name);
}

/** The name as the sidebar shows it — notes are drawn without their extension. */
function displayName(node: TreeNode): string {
  return node.kind === "folder" ? node.name : node.name.replace(/\.mdx?$/i, "");
}

// ─── Rearranging by hand ────────────────────────────────────────────────────

/**
 * One step up or down within its own folder.
 *
 * The whole run of siblings is written down, not just the two that swapped:
 * a list recording only "these two are out of order" would be undone by the
 * next automatic sort, and the reader would watch their move come apart.
 */
export function withMoved(
  order: TreeOrder,
  siblings: readonly TreeNode[],
  path: string,
  direction: -1 | 1,
): TreeOrder {
  const paths = siblings.map((node) => node.path);
  const index = paths.indexOf(path);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= paths.length) return order;

  const next = [...paths];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return withManual(order, parentOf(path), next);
}

/** Dropped onto the gap above or below another row in the same folder. */
export function withDropped(
  order: TreeOrder,
  siblings: readonly TreeNode[],
  path: string,
  target: string,
  position: "before" | "after",
): TreeOrder {
  if (path === target) return order;

  const paths = siblings.map((node) => node.path);
  if (!paths.includes(path) || !paths.includes(target)) return order;

  const without = paths.filter((candidate) => candidate !== path);
  const at = without.indexOf(target);
  if (at === -1) return order;

  without.splice(position === "before" ? at : at + 1, 0, path);
  return withManual(order, parentOf(path), without);
}

/** Forgets one folder's hand-made order, putting it back under the sort mode. */
export function withoutManual(order: TreeOrder, parent: string): TreeOrder {
  if (!order.manual[parent]) return order;

  const manual = { ...order.manual };
  delete manual[parent];
  return { ...order, manual };
}

/** True when this folder's contents were arranged by hand. */
export function isManual(order: TreeOrder, parent: string): boolean {
  return (order.manual[parent]?.length ?? 0) > 0;
}

/**
 * Carries a hand-made position across a rename or a move.
 *
 * Without it, renaming a note drops it out of its folder's order and it
 * reappears at the bottom — which reads as the app having thrown the
 * arrangement away because the file was given a better name.
 */
export function withPathRenamed(order: TreeOrder, from: string, to: string): TreeOrder {
  const rename = (path: string) =>
    path === from ? to : path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path;

  const manual: Record<string, string[]> = {};
  for (const [parent, paths] of Object.entries(order.manual)) {
    manual[rename(parent)] = paths.map(rename);
  }

  return { ...order, manual };
}

/**
 * Drops folders that no longer exist, so the record does not grow forever as
 * notes are deleted and folders emptied.
 */
export function prunedOrder(order: TreeOrder, tree: readonly TreeNode[]): TreeOrder {
  const folders = new Set<string>([""]);
  const walk = (nodes: readonly TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind !== "folder") continue;
      folders.add(node.path);
      walk(node.children ?? []);
    }
  };
  walk(tree);

  const manual: Record<string, string[]> = {};
  for (const [parent, paths] of Object.entries(order.manual)) {
    if (folders.has(parent)) manual[parent] = paths;
  }

  return Object.keys(manual).length === Object.keys(order.manual).length
    ? order
    : { ...order, manual };
}

function withManual(order: TreeOrder, parent: string, paths: string[]): TreeOrder {
  return { ...order, manual: { ...order.manual, [parent]: paths } };
}

// ─── Creation stamps ────────────────────────────────────────────────────────

/**
 * Records when a path was made, so `smart` and `created` have something to sort
 * unnumbered notes by.
 *
 * Kept here rather than read from each note's `created` front matter, because
 * folders have no front matter of their own and the sidebar has to order them
 * too — and because reading every note in a repository to draw a tree of names
 * would make opening the sidebar as expensive as opening the notebook.
 */
export function withCreated(created: CreationTimes, path: string, at: string): CreationTimes {
  if (created[path]) return created;
  return { ...created, [path]: at };
}

/** Moves the stamps for a path and everything under it, on a rename or move. */
export function withCreatedRenamed(
  created: CreationTimes,
  from: string,
  to: string,
): CreationTimes {
  const next: Record<string, string> = {};
  let changed = false;

  for (const [path, at] of Object.entries(created)) {
    if (path === from || path.startsWith(`${from}/`)) {
      next[`${to}${path.slice(from.length)}`] = at;
      changed = true;
    } else {
      next[path] = at;
    }
  }

  return changed ? next : created;
}

/** Drops the stamps for a deleted path and anything that was inside it. */
export function withoutCreated(created: CreationTimes, path: string): CreationTimes {
  const next: Record<string, string> = {};
  let changed = false;

  for (const [candidate, at] of Object.entries(created)) {
    if (candidate === path || candidate.startsWith(`${path}/`)) changed = true;
    else next[candidate] = at;
  }

  return changed ? next : created;
}

/** The kinds a row can be, spelled out for the menus that talk about them. */
export function nounFor(kind: TreeNodeKind): string {
  return kind === "folder" ? "folder" : "note";
}
