"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TreeNode } from "@forkleaf/types";
import { ContextMenu, useContextMenu, type MenuItem } from "./ContextMenu";

/** What a drag in the tree is carrying. */
export interface DragPayload {
  kind: "file" | "folder";
  path: string;
}

export interface FileTreeProps {
  nodes: TreeNode[];
  activePath: string | null;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string) => void;
  onCreateIn: (folder: string) => void;
  /** Make a folder inside `parent`. An empty string means the repository root. */
  onCreateFolder: (parent: string) => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  /** Moves a note to another folder. Called by drag-and-drop within the tree. */
  onMoveNote?: (path: string, toFolder: string) => void;
  /**
   * Moves a folder, and everything under it, into another folder.
   *
   * Notes could be dragged from the start; folders could not, so the one
   * reorganisation people actually want — "this whole subject belongs under
   * that one" — meant making the destination by hand and dragging the notes
   * across one at a time.
   */
  onMoveFolder?: (path: string, toFolder: string) => void;
  /** Pins a note to the top of the sidebar, or unpins one already there. */
  onTogglePin?: (path: string) => void;
  /** Paths currently pinned, so the menu can say which way it will go. */
  pinnedPaths?: readonly string[];
  /**
   * Folders to open on arrival, in the order the reader opened them.
   *
   * Undefined means nothing has been remembered for this workspace, which is a
   * first visit rather than a deliberately empty sidebar.
   */
  openFolders?: readonly string[];
  /** Called whenever that set changes, so it can be kept for the next visit. */
  onOpenFoldersChange?: (paths: string[]) => void;
  filter: string;
}

/**
 * The note tree.
 *
 * Folders come from the repository's own directory structure, so what the user
 * sees here is exactly what they would see cloning the repo — no hidden
 * database mapping between the two.
 *
 * Every row is the same shape: a disclosure triangle, an icon, a name. That
 * regularity is the point. The previous version drew four hover buttons on
 * every folder row and two on every file row, which meant the moment a pointer
 * crossed the sidebar the names were pushed aside by a grid of glyphs, and a
 * deep tree — the case folders exist for — was unreadable. The actions all
 * moved to the right-click menu, where they take no space at rest.
 */
export function FileTree({
  nodes,
  activePath,
  onOpen,
  onDelete,
  onRename,
  onCreateIn,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
  onTogglePin,
  pinnedPaths,
  openFolders,
  onOpenFoldersChange,
  filter,
}: FileTreeProps) {
  /**
   * Which folders are open, by full path.
   *
   * By path, so opening `a/b` says nothing about `a/c`, and so the state
   * survives the tree being rebuilt underneath it by a refresh from GitHub.
   * Holding it here rather than in each row is also what lets a folder stay
   * open across a re-render that replaces every node object.
   *
   * Seeded from what the reader had open last time, in the order they opened
   * it — a sidebar that forgets is one you have to re-navigate on every visit.
   * Only a workspace with no record at all falls back to opening the top level,
   * because that is a first visit rather than somebody who closed everything.
   */
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(openFolders ?? rootFolders(nodes)),
  );

  /**
   * Records a new open set and reports it outwards, so it can be remembered
   * for next time.
   *
   * Both together, and never from inside a `setExpanded` updater: React is
   * free to run an updater during a later render pass rather than where it was
   * queued, and a parent's `setState` reached from there is an update to one
   * component while another is rendering — which React refuses, and which it
   * only started refusing out loud once anything else in here set state during
   * render.
   */
  const remember = useCallback(
    (next: Set<string>) => {
      setExpanded(next);
      onOpenFoldersChange?.([...next]);
    },
    [onOpenFoldersChange],
  );
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /**
   * What is currently being dragged.
   *
   * Held here rather than read from the drag event because `dataTransfer` is
   * write-only during `dragover` — the browser will not let a page read the
   * payload until the drop, precisely so a page cannot snoop on a drag from
   * another application. Without it, a folder row cannot tell whether the
   * thing hovering over it is one of its own descendants, and so cannot refuse
   * a move that would rename a folder to a path inside itself.
   */
  const [dragging, setDragging] = useState<DragPayload | null>(null);

  const canDropOn = useCallback(
    (folder: string) => {
      if (!dragging) return false;
      if (dragging.kind === "file")
        return Boolean(onMoveNote) && dirnameOf(dragging.path) !== folder;
      if (!onMoveFolder) return false;
      // Not into itself, not into its own descendant, not where it already is.
      return (
        folder !== dragging.path &&
        !folder.startsWith(`${dragging.path}/`) &&
        dirnameOf(dragging.path) !== folder
      );
    },
    [dragging, onMoveNote, onMoveFolder],
  );

  const drop = useCallback(
    (folder: string) => {
      const payload = dragging;
      setDragging(null);
      setDropTarget(null);
      if (!payload || !canDropOn(folder)) return;

      if (payload.kind === "file") onMoveNote?.(payload.path, folder);
      else onMoveFolder?.(payload.path, folder);
    },
    [dragging, canDropOn, onMoveNote, onMoveFolder],
  );
  const { menu, open: openMenu, close: closeMenu } = useContextMenu<TreeNode>();

  const visible = useMemo(
    () => (filter ? filterTree(nodes, filter.toLowerCase()) : nodes),
    [nodes, filter],
  );

  const toggle = useCallback(
    (path: string) => {
      const next = new Set(expanded);
      // Deleted and re-added rather than left in place, so the record keeps
      // the order folders were opened in.
      next.delete(path);
      if (!expanded.has(path)) next.add(path);
      remember(next);
    },
    [expanded, remember],
  );

  /** Opening a folder before creating something in it, so the result is visible. */
  const reveal = useCallback(
    (path: string) => {
      remember(new Set(expanded).add(path));
    },
    [expanded, remember],
  );

  /**
   * Opens every folder above whichever note is selected.
   *
   * A note made from the "New note" button, the ⌘⇧N shortcut or the folder
   * menu became the selected note and was then invisible: it had landed inside
   * a folder that was shut, and nothing in the sidebar said so. People went
   * looking for a file they had just watched the app claim to create. Only the
   * right-click menu opened its folder first, and only the one folder it was
   * aimed at.
   *
   * Selecting a note is the moment to show where it lives, whether it arrived
   * by being created, opened from ⌘K, or followed through a link.
   *
   * Adjusted during render against the last path revealed, rather than in an
   * effect, so the tree is drawn open on the first pass — an effect would draw
   * the shut tree first and open it a frame later. It is deliberately not
   * reported through `onOpenFoldersChange`: what is remembered for next time
   * is the set of folders the reader chose to open, and this is the app
   * pointing at something rather than the reader opening it. Closing a
   * revealed folder therefore sticks, which it would not if the open state
   * were simply derived from the selection.
   */
  const [revealedFor, setRevealedFor] = useState<string | null>(null);

  if (activePath !== revealedFor) {
    setRevealedFor(activePath);
    const ancestors = ancestorsOf(activePath ?? "");

    if (ancestors.some((folder) => !expanded.has(folder))) {
      const next = new Set(expanded);
      // Re-added rather than left where they were, so the set still reads as
      // "most recently opened last".
      for (const folder of ancestors) {
        next.delete(folder);
        next.add(folder);
      }
      setExpanded(next);
    }
  }

  const menuItems = useMemo((): MenuItem[] => {
    if (!menu) return [];
    const node = menu.target;

    if (node.kind === "folder") {
      return [
        {
          label: "New note here",
          onSelect: () => {
            reveal(node.path);
            onCreateIn(node.path);
          },
        },
        {
          label: "New subfolder",
          onSelect: () => {
            reveal(node.path);
            onCreateFolder(node.path);
          },
        },
        { label: "Rename folder…", onSelect: () => onRenameFolder(node.path) },
        {
          label: "Delete folder",
          destructive: true,
          onSelect: () => onDeleteFolder(node.path),
        },
      ];
    }

    const pinned = pinnedPaths?.includes(node.path) ?? false;

    return [
      { label: "Open", onSelect: () => onOpen(node.path) },
      ...(onTogglePin
        ? [
            {
              label: pinned ? "Unpin from top" : "Pin to top",
              onSelect: () => onTogglePin(node.path),
            },
          ]
        : []),
      { label: "Rename…", onSelect: () => onRename(node.path) },
      { label: "Delete note", destructive: true, onSelect: () => onDelete(node.path) },
    ];
  }, [
    menu,
    reveal,
    onCreateIn,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onOpen,
    onRename,
    onDelete,
    onTogglePin,
    pinnedPaths,
  ]);

  if (visible.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-[var(--fl-muted)]">
        {filter ? `Nothing matches “${filter}”.` : "No notes yet."}
      </p>
    );
  }

  return (
    <>
      <ul
        role="tree"
        aria-label="Notes"
        // Dropping on the empty space below the tree moves the dragged thing
        // to the root, which is otherwise only reachable by dragging onto a
        // folder that happens to be at the top level. It grows a ring while a
        // drag is in flight, because an invisible drop target is one nobody
        // finds — the space below the tree looks like padding, not a
        // destination.
        className={`min-h-full py-1 ${
          dragging && dropTarget === "" && canDropOn("")
            ? "rounded-lg bg-[var(--fl-elevated)]/40 ring-1 ring-inset ring-[var(--fl-accent)]"
            : ""
        }`}
        // Only what was aimed at the empty space itself. Rows stop their own
        // events, but a row that refuses a drop never calls `preventDefault`,
        // so without the target check the browser would deliver that drop here
        // instead and the tree's own refusal would be overturned by its parent.
        onDragOver={(event) => {
          if (event.target !== event.currentTarget || !canDropOn("")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropTarget("");
        }}
        onDragLeave={(event) => {
          if (event.target === event.currentTarget) setDropTarget(null);
        }}
        onDrop={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          drop("");
        }}
      >
        {visible.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            expanded={expanded}
            onToggle={toggle}
            onOpen={onOpen}
            onContextMenu={openMenu}
            dragging={dragging}
            onDragging={setDragging}
            canDropOn={canDropOn}
            onDrop={drop}
            dropTarget={dropTarget}
            onDropTarget={setDropTarget}
            // A search should reveal matches inside collapsed folders.
            forceOpen={filter.length > 0}
          />
        ))}
      </ul>

      {menu && <ContextMenu position={menu.position} items={menuItems} onClose={closeMenu} />}
    </>
  );
}

// ─── One row ────────────────────────────────────────────────────────────────

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onContextMenu: (
    event: { clientX: number; clientY: number; preventDefault: () => void },
    node: TreeNode,
  ) => void;
  dragging: DragPayload | null;
  onDragging: (payload: DragPayload | null) => void;
  canDropOn: (folder: string) => boolean;
  onDrop: (folder: string) => void;
  dropTarget: string | null;
  onDropTarget: (path: string | null) => void;
  forceOpen: boolean;
}

/**
 * Memoised on the node.
 *
 * A tree of a few hundred files re-rendered every row whenever anything in the
 * editor changed — the sync status ticking over was enough. Only the rows whose
 * node, selection or open state actually changed redraw now.
 */
const TreeItem = memo(function TreeItem({
  node,
  depth,
  activePath,
  expanded,
  onToggle,
  onOpen,
  onContextMenu,
  dragging,
  onDragging,
  canDropOn,
  onDrop,
  dropTarget,
  onDropTarget,
  forceOpen,
}: TreeItemProps) {
  const open = forceOpen || expanded.has(node.path);
  const isFolder = node.kind === "folder";
  const active = !isFolder && node.path === activePath;
  const dropping = isFolder && dropTarget === node.path && canDropOn(node.path);
  // Dimmed while it is the thing in flight, so a drag over a deep tree still
  // says which row left. A folder dims along with everything inside it.
  const lifted =
    dragging !== null && (dragging.path === node.path || node.path.startsWith(`${dragging.path}/`));
  const dropFolder = isFolder ? node.path : dirnameOf(node.path);

  /**
   * Brings the selected row into view.
   *
   * Opening its folders is only half of "show me where it is": in a repository
   * of any size the row it just revealed is as likely as not below the fold,
   * and a sidebar that has scrolled somewhere else entirely still looks like
   * nothing happened. `nearest` leaves the scroll alone when the row is
   * already on screen, so selecting a visible note does not jump the tree.
   * The call itself is optional because jsdom, where the tests run, has no
   * layout and so does not implement it.
   */
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  // The whole row is one indent step deeper than its parent. Every row reserves
  // the triangle's width whether or not it has one, so names line up in a
  // column instead of stepping raggedly in and out.
  //
  // The step grew along with the rows: at the old 0.75rem, a name set two
  // levels deep sat almost under its grandparent, and the nesting had to be
  // inferred from the chevrons rather than seen.
  const indent = 0.375 + depth * 0.85;

  return (
    <li role="treeitem" aria-expanded={isFolder ? open : undefined} aria-selected={active}>
      <div
        ref={rowRef}
        className={`relative flex items-center rounded-md pr-1.5 transition-colors ${
          lifted ? "opacity-40" : ""
        } ${
          dropping
            ? "bg-[var(--fl-elevated)] ring-1 ring-inset ring-[var(--fl-accent)]"
            : active
              ? "bg-[var(--fl-elevated)]"
              : "hover:bg-[var(--fl-elevated)]"
        }`}
        style={{ paddingLeft: `${indent}rem` }}
        // Both kinds drag. `dataTransfer` still carries the path, because a
        // drag that sets nothing is refused outright by some browsers and
        // because it makes the payload legible to anything else listening.
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData("text/plain", node.path);
          event.dataTransfer.effectAllowed = "move";
          onDragging({ kind: isFolder ? "folder" : "file", path: node.path });
        }}
        // Fires whether the drag ended in a drop, outside the window, or on
        // Escape — without it, a cancelled drag leaves every row dimmed.
        onDragEnd={() => {
          onDragging(null);
          onDropTarget(null);
        }}
        // Where a drop on this row lands. A folder takes things inside it; a
        // note stands for the folder it is in, which is what dropping "next to
        // this note" plainly means and what every file manager does.
        //
        // Both branches stop propagation whether or not the drop is allowed.
        // Without that, a drop this row refuses keeps bubbling to the tree's
        // root handler, which accepts everything — so dragging a note onto the
        // folder it already lives in quietly moved it to the top of the
        // repository instead of doing nothing.
        onDragOver={(event) => {
          event.stopPropagation();
          if (!canDropOn(dropFolder)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onDropTarget(dropFolder);
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          onDropTarget(null);
        }}
        onDrop={(event) => {
          event.stopPropagation();
          if (!canDropOn(dropFolder)) return;
          event.preventDefault();
          onDrop(dropFolder);
        }}
      >
        {/* The selected note gets a bar rather than a fill alone: at sidebar
            width, a slightly lighter row is easy to lose track of. */}
        {active && (
          <span
            aria-hidden="true"
            className="absolute inset-y-[3px] left-0 w-[2.5px] rounded-full bg-[var(--fl-accent)]"
          />
        )}

        <button
          type="button"
          tabIndex={-1}
          aria-hidden={!isFolder}
          onClick={(event) => {
            event.stopPropagation();
            if (isFolder) onToggle(node.path);
          }}
          className={`flex h-[30px] w-[18px] shrink-0 items-center justify-center text-[var(--fl-muted)] ${
            isFolder ? "hover:text-[var(--fl-text)]" : "pointer-events-none opacity-0"
          }`}
        >
          {/* A stroked chevron. The solid triangle it replaces was the only
              filled glyph in the sidebar, so it read as heavier than the folder
              and the file beside it and pulled the eye to the least important
              thing in the row. */}
          <svg
            viewBox="0 0 12 12"
            className={`h-[11px] w-[11px] transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4.5 2.5 8 6l-3.5 3.5" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => (isFolder ? onToggle(node.path) : onOpen(node.path))}
          onContextMenu={(event) => onContextMenu(event, node)}
          title={node.path}
          className="flex min-w-0 flex-1 items-center gap-2 py-[5px] pl-0.5 text-left"
        >
          <span
            className={`shrink-0 ${active ? "text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"}`}
          >
            {isFolder ? <FolderGlyph open={open} /> : <FileGlyph />}
          </span>
          <span
            className={`truncate text-[14px] leading-[1.35] ${
              active
                ? "font-medium text-[var(--fl-text)]"
                : isFolder
                  ? "text-[var(--fl-text)]"
                  : "text-[var(--fl-muted)]"
            }`}
          >
            {isFolder ? node.name : node.name.replace(/\.mdx?$/i, "")}
          </span>
        </button>
      </div>

      {isFolder && open && (node.children?.length ?? 0) === 0 && (
        <p
          style={{ paddingLeft: `${indent + 1.5}rem` }}
          className="py-[5px] text-[12.5px] italic text-[var(--fl-muted)]"
        >
          Empty
        </p>
      )}

      {isFolder && open && node.children && node.children.length > 0 && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
              onContextMenu={onContextMenu}
              dragging={dragging}
              onDragging={onDragging}
              canDropOn={canDropOn}
              onDrop={onDrop}
              dropTarget={dropTarget}
              onDropTarget={onDropTarget}
              forceOpen={forceOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
});

// ─── Glyphs ─────────────────────────────────────────────────────────────────

function FolderGlyph({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* One tab-and-body folder, drawn the same whether it is open or shut.
          The old open state was a splayed perspective shape with a different
          silhouette and a different optical weight, so expanding a folder made
          the row visibly jump. The chevron beside it already says which state
          it is in; the icon only has to say "folder". */}
      <path d="M2 12.4V4.4a.9.9 0 0 1 .9-.9h2.7l1.4 1.6h6.1a.9.9 0 0 1 .9.9v6.4a.9.9 0 0 1-.9.9H2.9a.9.9 0 0 1-.9-.9Z" />
      {open && <path d="M2.3 6.9h11.4" />}
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* A page with writing on it. The previous glyph was an empty sheet with
          a folded corner — the icon for "a file", in a sidebar where every row
          is a file and the only useful thing an icon can say is what kind. Two
          ruled lines say "a note" at 15px, which is the distinction that
          matters next to a folder. */}
      <path d="M3.6 2.6h5.3l3.5 3.5v7.3a.9.9 0 0 1-.9.9H3.6a.9.9 0 0 1-.9-.9V3.5a.9.9 0 0 1 .9-.9Z" />
      <path d="M8.9 2.6v3.5h3.5" />
      <path d="M5.4 9.1h5.2M5.4 11.4h3.4" />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** The folder a path sits in. `""` for anything at the repository root. */
function dirnameOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/** Every folder above a path, outermost first. `[]` for anything at the root. */
function ancestorsOf(path: string): string[] {
  const parts = path.split("/");
  parts.pop();
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

/** Top-level folders, which start open so the tree is never a single closed row. */
function rootFolders(nodes: TreeNode[]): string[] {
  return nodes.filter((node) => node.kind === "folder").map((node) => node.path);
}

/** Keeps folders that contain a match, and files whose name matches. */
function filterTree(nodes: TreeNode[], needle: string): TreeNode[] {
  const result: TreeNode[] = [];

  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.path.toLowerCase().includes(needle)) result.push(node);
      continue;
    }

    const children = filterTree(node.children ?? [], needle);
    if (children.length > 0 || node.name.toLowerCase().includes(needle)) {
      result.push({ ...node, children });
    }
  }

  return result;
}
