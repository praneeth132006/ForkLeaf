"use client";

// ─── Editor Page ────────────────────────────────────────────────────────────
// The main editor route.  Composes:
//  • EditorSidebar   – collapsible left navigation (260px / 48px rail)
//  • Center panel    – page title, WYSIWYG toggle, and the MdnotionEditor
//  • EditorRightPanel – collapsible properties / frontmatter panel (280px)
//  • EditorStatusBar  – thin bottom bar with sync / branch / commit info
//
// Layout uses flexbox with the sidebar + center + right panel in a row,
// and the status bar pinned to the bottom.

import React, { useState } from "react";
import EditorSidebar from "@/components/EditorSidebar";
import EditorRightPanel from "@/components/EditorRightPanel";
import EditorStatusBar from "@/components/EditorStatusBar";
import { MdnotionEditor } from "@mdnotion/editor";

// ─── SVG topographic contour-line pattern (inlined for zero network cost) ──
// Draws subtle curved lines to evoke a cartographic "waypoint" aesthetic.
const TOPO_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cg fill='none' stroke='%232A3240' stroke-width='0.6'%3E%3Cellipse cx='100' cy='100' rx='90' ry='60'/%3E%3Cellipse cx='100' cy='100' rx='70' ry='45'/%3E%3Cellipse cx='100' cy='100' rx='50' ry='30'/%3E%3Cellipse cx='100' cy='100' rx='30' ry='18'/%3E%3Cellipse cx='100' cy='100' rx='14' ry='8'/%3E%3C/g%3E%3C/svg%3E")`;

export default function EditorPage() {
  // ── Sidebar collapsed state ──────────────────────────────────────────────
  // When true the sidebar shrinks to a 48px icon-only rail
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── Right panel collapsed state ──────────────────────────────────────────
  // When true the right panel hides entirely (shows a thin expand strip)
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // ── WYSIWYG vs Raw toggle ────────────────────────────────────────────────
  const [isRawMode, setIsRawMode] = useState(false);

  // ── Editable page title ──────────────────────────────────────────────────
  const [pageTitle, setPageTitle] = useState("Welcome Note");

  return (
    // Root container: full viewport height, column layout (body + status bar)
    <div className="flex flex-col h-screen bg-[var(--color-paper)] text-[var(--color-ink)] font-sans overflow-hidden">
      {/* ── Top row: sidebar + center + right panel ───────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left sidebar ─────────────────────────────────────────── */}
        {/* Hidden on small screens; visible from md breakpoint upward */}
        <div className="hidden md:flex">
          <EditorSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((prev) => !prev)}
          />
        </div>

        {/* ── Center panel (editor canvas) ─────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 relative">
          {/* ── Top toolbar ──────────────────────────────────────────── */}
          <div className="h-14 border-b border-[var(--color-chalk)] flex items-center justify-between px-4 md:px-6 bg-[var(--color-paper)] shrink-0 z-20">
            {/* Left side: editable page title in Fraunces serif */}
            <input
              type="text"
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              className="text-3xl font-serif font-bold bg-transparent outline-none border-none text-[var(--color-ink)] w-full max-w-md truncate"
              aria-label="Page title"
            />

            {/* Right side: mode toggle button */}
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {/* Guest-mode badge */}
              <span className="hidden sm:inline text-xs font-mono bg-[var(--color-signal-amber)]/10 text-[var(--color-signal-amber)] px-2 py-1 rounded whitespace-nowrap">
                Guest Mode
              </span>

              {/* WYSIWYG ⇄ Raw toggle */}
              <button
                onClick={() => setIsRawMode((prev) => !prev)}
                className="text-xs bg-[var(--color-chalk)] px-3 py-1.5 rounded-md hover:bg-[var(--color-mist)]/30 transition-colors font-medium whitespace-nowrap cursor-pointer"
              >
                {isRawMode ? "WYSIWYG" : "Raw"} ⇄
              </button>
            </div>
          </div>

          {/* ── Editor canvas area (scrollable) ─────────────────────── */}
          <div className="flex-1 overflow-y-auto relative">
            {/* Ambient topographic contour-line texture at 3% opacity */}
            <div
              className="absolute inset-0 bg-repeat opacity-[0.03] pointer-events-none z-0"
              style={{ backgroundImage: TOPO_SVG }}
              aria-hidden="true"
            />

            {/* Centered editor container — max 720px wide */}
            <div className="relative z-10 mx-auto w-full max-w-[720px] px-4 md:px-8 py-8 md:py-12">
              {/* Prose wrapper applies typographic defaults to editor content */}
              <MdnotionEditor />
            </div>
          </div>
        </main>

        {/* ── Right panel ──────────────────────────────────────────── */}
        {/* Hidden on small screens; visible from lg breakpoint upward */}
        <div className="hidden lg:flex">
          <EditorRightPanel
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed((prev) => !prev)}
          />
        </div>
      </div>

      {/* ── Bottom status bar (full width, always visible) ────────────── */}
      <EditorStatusBar />
    </div>
  );
}
