"use client";

import React, { useState } from "react";
import Link from "next/link";

// ─── Props ──────────────────────────────────────────────────────────────────
// collapsed: whether the sidebar is in its narrow icon-only rail state (48px)
// onToggle:  callback to flip the collapsed flag from the parent
interface EditorSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ─── Static page-tree data ──────────────────────────────────────────────────
// Each node can optionally have `children` for nested items.
// `icon` is rendered beside the label; we use compass-pin style glyphs.
interface PageNode {
  id: string;
  label: string;
  icon: string; // emoji / glyph rendered inline
  children?: PageNode[];
}

const PAGE_TREE: PageNode[] = [
  { id: "getting-started", label: "Getting Started", icon: "🧭" },
  { id: "architecture", label: "Architecture Notes", icon: "🧭" },
  { id: "api-ref", label: "API Reference", icon: "🧭" },
  {
    id: "meetings",
    label: "Meeting Notes",
    icon: "🧭",
    children: [
      {
        id: "standup-jan15",
        label: "Standup Jan 15",
        icon: "📌",
        children: [
          { id: "sprint-review", label: "Sprint Review", icon: "📌" },
        ],
      },
    ],
  },
];

// ─── Favorites list (pinned pages) ─────────────────────────────────────────
const FAVORITES = [
  { id: "fav-getting-started", label: "Getting Started" },
  { id: "fav-api-ref", label: "API Reference" },
];

// ─── Recursive PageTreeItem component ──────────────────────────────────────
// Renders a single node in the page tree. If the node has children, it shows
// an expand/collapse arrow and indents child nodes by one level.
function PageTreeItem({
  node,
  depth,
  collapsed,
}: {
  node: PageNode;
  depth: number;
  collapsed: boolean;
}) {
  // Track whether this tree node's children are expanded
  const [expanded, setExpanded] = useState(depth === 0);

  // Has nested pages?
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      {/* Row for this individual page item */}
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`
          flex items-center w-full gap-2 rounded-md text-sm font-medium
          hover:bg-[var(--color-chalk)] transition-colors cursor-pointer
          ${collapsed ? "justify-center px-1 py-2" : "px-2 py-1.5"}
        `}
        /* Indent nested items: 16px per depth level */
        style={!collapsed ? { paddingLeft: `${8 + depth * 16}px` } : undefined}
        title={node.label}
      >
        {/* Expand / collapse arrow for nodes with children */}
        {hasChildren && !collapsed && (
          <span
            className="text-[var(--color-mist)] text-xs transition-transform select-none"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ▶
          </span>
        )}

        {/* Compass-pin icon */}
        <span className="text-base leading-none shrink-0">{node.icon}</span>

        {/* Label – hidden in collapsed rail mode */}
        {!collapsed && (
          <span className="truncate text-[var(--color-ink)]">{node.label}</span>
        )}
      </button>

      {/* Render children recursively when expanded */}
      {hasChildren && expanded && !collapsed && (
        <div>
          {node.children!.map((child) => (
            <PageTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Sidebar Component ────────────────────────────────────────────────
export default function EditorSidebar({
  collapsed,
  onToggle,
}: EditorSidebarProps) {
  return (
    <aside
      className={`
        flex flex-col bg-[#f8f6f0] border-r border-[var(--color-chalk)]
        transition-[width] duration-200 ease-in-out overflow-hidden shrink-0
        ${collapsed ? "w-12" : "w-[260px]"}
      `}
    >
      {/* ── Header: "Expedition Log" + collapse toggle ─────────────────── */}
      <div className="h-14 border-b border-[var(--color-chalk)] flex items-center px-3 gap-2 shrink-0">
        {/* Hamburger / collapse toggle button */}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md hover:bg-[var(--color-chalk)] transition-colors text-[var(--color-mist)] cursor-pointer"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {/* Three-line hamburger icon (SVG) */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Title text – visible only when sidebar is expanded */}
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-[var(--color-ink)] whitespace-nowrap">
            Expedition Log
          </span>
        )}
      </div>

      {/* ── Repo switcher dropdown ──────────────────────────────────────── */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1 shrink-0">
          {/* Dropdown button styled as a select – shows current repo */}
          <button className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[var(--color-chalk)]/60 hover:bg-[var(--color-chalk)] text-sm transition-colors cursor-pointer">
            <span className="truncate font-medium text-[var(--color-ink)]">
              Local Notes
            </span>
            {/* Chevron down icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-mist)] shrink-0"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Quick-find (⌘K) search bar ─────────────────────────────────── */}
      {!collapsed && (
        <div className="px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[var(--color-chalk)] bg-white/40">
            {/* Magnifying glass icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-mist)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {/* Placeholder text with keyboard shortcut hint */}
            <span className="text-xs text-[var(--color-mist)] select-none">
              Quick find… ⌘K
            </span>
          </div>
        </div>
      )}

      {/* ── Page tree (scrollable middle area) ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {/* Section header – only when expanded */}
        {!collapsed && (
          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-widest font-bold text-[var(--color-mist)] select-none">
            Pages
          </div>
        )}

        {/* Render each top-level page node */}
        {PAGE_TREE.map((node) => (
          <PageTreeItem
            key={node.id}
            node={node}
            depth={0}
            collapsed={collapsed}
          />
        ))}

        {/* ── Favorites section ───────────────────────────────────────── */}
        {!collapsed && (
          <>
            {/* Divider + header */}
            <div className="mt-4 px-2 pt-2 pb-1 text-[10px] uppercase tracking-widest font-bold text-[var(--color-mist)] select-none">
              Favorites
            </div>

            {/* Pinned favorite pages */}
            {FAVORITES.map((fav) => (
              <button
                key={fav.id}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm font-medium hover:bg-[var(--color-chalk)] transition-colors cursor-pointer"
              >
                {/* Star glyph for favorites */}
                <span className="text-[var(--color-signal-amber)] text-xs">
                  ★
                </span>
                <span className="truncate text-[var(--color-ink)]">
                  {fav.label}
                </span>
              </button>
            ))}
          </>
        )}

        {/* Collapsed-mode: show a star icon for the favorites section */}
        {collapsed && (
          <div className="flex justify-center py-2">
            <span
              className="text-[var(--color-signal-amber)] text-base"
              title="Favorites"
            >
              ★
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom: User info + sign-out link ──────────────────────────── */}
      <div className="border-t border-[var(--color-chalk)] p-3 shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            {/* User avatar placeholder (circle with initial) */}
            <div className="w-7 h-7 rounded-full bg-[var(--color-chalk)] flex items-center justify-center text-xs font-bold text-[var(--color-mist)] shrink-0">
              G
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-[var(--color-ink)] truncate">
                Guest User
              </span>
              {/* Sign-out link navigates back to the landing page */}
              <Link
                href="/"
                className="text-[10px] text-[var(--color-mist)] hover:text-[var(--color-ink)] underline transition-colors"
              >
                Sign Out
              </Link>
            </div>
          </div>
        ) : (
          /* Collapsed mode: show only the avatar circle */
          <div className="flex justify-center">
            <div className="w-7 h-7 rounded-full bg-[var(--color-chalk)] flex items-center justify-center text-xs font-bold text-[var(--color-mist)]">
              G
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
