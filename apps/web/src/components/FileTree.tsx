"use client";

import React, { useState, useMemo } from "react";
import type { TreeNode } from "@forkleaf/types";

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
  filter: string;
}

/**
 * The note tree.
 *
 * Folders come from the repository's own directory structure, so what the user
 * sees here is exactly what they would see cloning the repo — no hidden
 * database mapping between the two.
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
  filter,
}: FileTreeProps) {
  const visible = useMemo(
    () => (filter ? filterTree(nodes, filter.toLowerCase()) : nodes),
    [nodes, filter],
  );

  if (visible.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-[var(--fl-muted)]">
        {filter ? `Nothing matches “${filter}”.` : "No notes yet."}
      </p>
    );
  }

  return (
    <ul role="tree" aria-label="Notes" className="py-1">
      {visible.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          activePath={activePath}
          onOpen={onOpen}
          onDelete={onDelete}
          onRename={onRename}
          onCreateIn={onCreateIn}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          // A search should reveal matches inside collapsed folders.
          forceOpen={filter.length > 0}
        />
      ))}
    </ul>
  );
}

interface TreeItemProps extends Omit<FileTreeProps, "nodes" | "filter"> {
  node: TreeNode;
  depth: number;
  forceOpen: boolean;
}

function TreeItem({
  node,
  depth,
  activePath,
  onOpen,
  onDelete,
  onRename,
  onCreateIn,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  forceOpen,
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const open = forceOpen || expanded;
  const indent = { paddingLeft: `${0.5 + depth * 0.75}rem` };

  if (node.kind === "folder") {
    return (
      // A folder is never the "selected" note, but the ARIA treeitem role
      // requires the attribute to be present on every item in the tree.
      <li role="treeitem" aria-expanded={open} aria-selected={false}>
        <div className="group flex items-center">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            style={indent}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
          >
            <span
              aria-hidden="true"
              className={`shrink-0 text-[0.6rem] text-[var(--fl-muted)] transition-transform ${open ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            <span className="truncate font-medium">{node.name}</span>
          </button>

          {/* Every folder operation, on the folder itself. Reaching them only
              through a menu at the top of the sidebar is what made nested
              folders feel impossible rather than merely undiscovered. */}
          <div className="mr-1 flex shrink-0 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
            <RowButton
              onClick={() => {
                setExpanded(true);
                onCreateIn(node.path);
              }}
              title={`New note in ${node.name}`}
            >
              <NoteGlyph />
            </RowButton>
            <RowButton
              onClick={() => {
                setExpanded(true);
                onCreateFolder(node.path);
              }}
              title={`New folder in ${node.name}`}
            >
              <FolderPlusGlyph />
            </RowButton>
            <RowButton onClick={() => onRenameFolder(node.path)} title={`Rename ${node.name}`}>
              ✎
            </RowButton>
            <RowButton
              onClick={() => onDeleteFolder(node.path)}
              title={`Delete ${node.name} and everything in it`}
              danger
            >
              ✕
            </RowButton>
          </div>
        </div>

        {open && (node.children?.length ?? 0) === 0 && (
          <p
            style={{ paddingLeft: `${1.6 + depth * 0.75}rem` }}
            className="py-1 pr-2 text-[11.5px] italic text-[var(--fl-muted)]"
          >
            Empty
          </p>
        )}

        {open && node.children && (
          <ul role="group">
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                onOpen={onOpen}
                onDelete={onDelete}
                onRename={onRename}
                onCreateIn={onCreateIn}
                onCreateFolder={onCreateFolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                forceOpen={forceOpen}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const active = node.path === activePath;

  return (
    <li role="treeitem" aria-selected={active}>
      <div className="group flex items-center">
        <button
          type="button"
          onClick={() => onOpen(node.path)}
          style={indent}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm transition ${
            active
              ? "bg-[var(--fl-accent)]/12 font-medium text-[var(--fl-accent)]"
              : "text-[var(--fl-text)] hover:bg-[var(--fl-elevated)]"
          }`}
        >
          <span aria-hidden="true" className="shrink-0 text-[0.7rem] text-[var(--fl-muted)]">
            ◦
          </span>
          <span className="truncate">{node.name.replace(/\.mdx?$/i, "")}</span>
        </button>

        <div className="mr-1 flex shrink-0 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          <RowButton onClick={() => onRename(node.path)} title={`Rename ${node.name}`}>
            ✎
          </RowButton>
          <RowButton onClick={() => onDelete(node.path)} title={`Delete ${node.name}`} danger>
            ✕
          </RowButton>
        </div>
      </div>
    </li>
  );
}

/**
 * One of the small actions on a tree row.
 *
 * Hidden until the row is hovered or focused, so a full sidebar is a list of
 * names rather than a grid of icons — but always in the tab order, because a
 * control that only exists under a pointer does not exist for everyone.
 */
function RowButton({
  onClick,
  title,
  danger = false,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-6 w-6 items-center justify-center rounded text-xs text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] ${
        danger ? "hover:text-[var(--fl-danger)]" : "hover:text-[var(--fl-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function NoteGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M9 1.75H4.5A1.75 1.75 0 0 0 2.75 3.5v9c0 .97.78 1.75 1.75 1.75h7a1.75 1.75 0 0 0 1.75-1.75V6z" />
      <path d="M9 1.75V6h4.25M6 9.5h4M6 11.5h2.5" />
    </svg>
  );
}

function FolderPlusGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M1.75 4.25c0-.83.67-1.5 1.5-1.5h2.4c.5 0 .96.24 1.25.65l.6.85h5.25c.83 0 1.5.67 1.5 1.5v6.5c0 .83-.67 1.5-1.5 1.5H3.25c-.83 0-1.5-.67-1.5-1.5z" />
      <path d="M8 7.75v4M6 9.75h4" />
    </svg>
  );
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
