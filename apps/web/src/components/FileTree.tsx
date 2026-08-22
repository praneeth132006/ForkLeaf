"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import type { TreeNode } from "@forkleaf/types";
import { ContextMenu, useContextMenu, type MenuItem } from "./ContextMenu";

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
  filter,
}: FileTreeProps) {
  // Which folders are open, by full path — so opening `a/b` says nothing about
  // `a/c`, and the state survives the tree being rebuilt under it by a refresh
  // from GitHub. Holding it here rather than in each row is also what lets a
  // folder stay open across a re-render that replaces every node object.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rootFolders(nodes)));
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu<TreeNode>();

  const visible = useMemo(
    () => (filter ? filterTree(nodes, filter.toLowerCase()) : nodes),
    [nodes, filter],
  );

  const toggle = useCallback((path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  /** Opening a folder before creating something in it, so the result is visible. */
  const reveal = useCallback((path: string) => {
    setExpanded((current) => new Set(current).add(path));
  }, []);

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

    return [
      { label: "Open", onSelect: () => onOpen(node.path) },
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
        className="py-1"
        // Dropping on the empty space below the tree moves a note to the root,
        // which is otherwise only reachable by dragging onto a folder that
        // happens to be at the top level.
        onDragOver={onMoveNote ? (event) => event.preventDefault() : undefined}
        onDrop={
          onMoveNote
            ? (event) => {
                const path = event.dataTransfer.getData("text/plain");
                setDropTarget(null);
                if (path) onMoveNote(path, "");
              }
            : undefined
        }
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
            onMoveNote={onMoveNote}
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
  onMoveNote?: (path: string, toFolder: string) => void;
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
  onMoveNote,
  dropTarget,
  onDropTarget,
  forceOpen,
}: TreeItemProps) {
  const open = forceOpen || expanded.has(node.path);
  const isFolder = node.kind === "folder";
  const active = !isFolder && node.path === activePath;
  const dropping = dropTarget === node.path;

  // The whole row is one indent step deeper than its parent. Every row reserves
  // the triangle's width whether or not it has one, so names line up in a
  // column instead of stepping raggedly in and out.
  const indent = 0.375 + depth * 0.75;

  return (
    <li role="treeitem" aria-expanded={isFolder ? open : undefined} aria-selected={active}>
      <div
        className={`relative flex items-center rounded-md pr-1.5 transition-colors ${
          active
            ? "bg-[var(--fl-elevated)]"
            : dropping
              ? "bg-[var(--fl-elevated)] ring-1 ring-inset ring-[var(--fl-accent)]"
              : "hover:bg-[var(--fl-elevated)]"
        }`}
        style={{ paddingLeft: `${indent}rem` }}
        draggable={!isFolder && Boolean(onMoveNote)}
        onDragStart={
          !isFolder && onMoveNote
            ? (event) => {
                event.dataTransfer.setData("text/plain", node.path);
                event.dataTransfer.effectAllowed = "move";
              }
            : undefined
        }
        onDragOver={
          isFolder && onMoveNote
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                onDropTarget(node.path);
              }
            : undefined
        }
        onDragLeave={isFolder && onMoveNote ? () => onDropTarget(null) : undefined}
        onDrop={
          isFolder && onMoveNote
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onDropTarget(null);
                const path = event.dataTransfer.getData("text/plain");
                if (path) onMoveNote(path, node.path);
              }
            : undefined
        }
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
          className={`flex h-[26px] w-4 shrink-0 items-center justify-center text-[var(--fl-muted)] ${
            isFolder ? "hover:text-[var(--fl-text)]" : "pointer-events-none opacity-0"
          }`}
        >
          <svg
            viewBox="0 0 12 12"
            className={`h-[9px] w-[9px] transition-transform duration-100 ${open ? "rotate-90" : ""}`}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 2.5 8.5 6 4 9.5z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => (isFolder ? onToggle(node.path) : onOpen(node.path))}
          onContextMenu={(event) => onContextMenu(event, node)}
          title={node.path}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-[3px] pl-0.5 text-left"
        >
          <span
            className={`shrink-0 ${active ? "text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"}`}
          >
            {isFolder ? <FolderGlyph open={open} /> : <FileGlyph />}
          </span>
          <span
            className={`truncate text-[13px] ${
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
          style={{ paddingLeft: `${indent + 1.4}rem` }}
          className="py-[3px] text-[11.5px] italic text-[var(--fl-muted)]"
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
              onMoveNote={onMoveNote}
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
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    >
      {open ? (
        <path d="M1.9 12.4V4.3a.8.8 0 0 1 .8-.8h2.9l1.35 1.55h5.35a.8.8 0 0 1 .8.8v.85M1.9 12.4l1.5-4.85a.8.8 0 0 1 .77-.55h9.96a.5.5 0 0 1 .48.65l-1.4 4.75a.8.8 0 0 1-.77.55H2.7a.8.8 0 0 1-.8-.55Z" />
      ) : (
        <path d="M1.9 12.2V4.3a.8.8 0 0 1 .8-.8h2.9l1.35 1.55h6.35a.8.8 0 0 1 .8.8v6.35a.8.8 0 0 1-.8.8H2.7a.8.8 0 0 1-.8-.8Z" />
      )}
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M9.2 2.2H4.6a1.4 1.4 0 0 0-1.4 1.4v8.8a1.4 1.4 0 0 0 1.4 1.4h6.8a1.4 1.4 0 0 0 1.4-1.4V5.8z" />
      <path d="M9.2 2.2v3.6h3.6" />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
