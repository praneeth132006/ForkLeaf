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

          <button
            type="button"
            onClick={() => onCreateIn(node.path)}
            title={`New note in ${node.name}`}
            aria-label={`New note in ${node.name}`}
            className="mr-1 shrink-0 rounded px-1.5 text-[var(--fl-muted)] opacity-0 transition hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] focus:opacity-100 group-hover:opacity-100"
          >
            +
          </button>
        </div>

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
          <button
            type="button"
            onClick={() => onRename(node.path)}
            title="Rename"
            aria-label={`Rename ${node.name}`}
            className="rounded px-1.5 text-xs text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={() => onDelete(node.path)}
            title="Delete"
            aria-label={`Delete ${node.name}`}
            className="rounded px-1.5 text-xs text-[var(--fl-muted)] hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-danger)]"
          >
            ✕
          </button>
        </div>
      </div>
    </li>
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
