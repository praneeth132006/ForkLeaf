"use client";

import React, { useState } from "react";

/**
 * The hero's product demo: a segmented control above a framed screenshot.
 *
 * A single still frame can only make one claim. Three tabs let the hero answer
 * the three questions a visitor actually has — what is the writing like, can it
 * really do diagrams, and where do my notes end up — without scrolling, and
 * gives them something to touch on a page that is otherwise all prose.
 *
 * Everything is drawn in markup rather than shipped as an image: it re-themes,
 * stays sharp at any zoom, and costs nothing to download.
 */
const TABS = [
  { id: "write", label: "Write", caption: "Rich text, split, or raw Markdown — the same file." },
  { id: "diagram", label: "Diagram", caption: "Mermaid diagrams without memorising Mermaid." },
  { id: "sync", label: "Sync", caption: "Every save lands as a commit in your own repository." },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AppPreview() {
  const [tab, setTab] = useState<TabId>("write");
  const active = TABS.find((item) => item.id === tab)!;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Product preview"
          className="flex rounded-full border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors ${
                tab === item.id
                  ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                  : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="text-[13.5px] text-[var(--fl-muted)]">{active.caption}</p>
      </div>

      <Frame>
        {tab === "write" && <WritePane />}
        {tab === "diagram" && <DiagramPane />}
        {tab === "sync" && <SyncPane />}
      </Frame>
    </div>
  );
}

/**
 * The window chrome. Always dark, in both themes, so it reads as a screenshot
 * of an application rather than as part of the page.
 *
 * Which is why the colours below are literal hex rather than `--fl-*`: these
 * have to stay dark on a light page, so they cannot follow the theme. They are
 * a copy of the dark palette and have to be kept in step with it by hand —
 * a screenshot showing an accent the product no longer uses is worse than no
 * screenshot.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="img"
      aria-label="The ForkLeaf editor"
      className="overflow-hidden rounded-2xl border border-[#1f1f1f] bg-[#000000] text-[#f0f0f0] shadow-[0_50px_140px_-50px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center gap-3 border-b border-[#1f1f1f] px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2a]" />
        </span>
        <span className="mx-auto rounded-md bg-[#0a0a0a] px-3 py-1 font-mono text-[11px] text-[#8a8a8a]">
          notes · main
        </span>
        <span className="hidden items-center gap-1.5 text-[11px] text-[#8a8a8a] sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8a9bb8]" />
          Synced
        </span>
      </div>

      <div className="flex h-[380px] sm:h-[420px]">
        <aside className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-[#1f1f1f] p-3 sm:flex">
          <div className="mb-2 rounded-md bg-[#0a0a0a] px-2.5 py-1.5 text-[11px] text-[#8a8a8a]">
            Search notes…
          </div>
          <TreeRow depth={0} label="architecture" folder />
          <TreeRow depth={1} label="sync-engine.md" active />
          <TreeRow depth={1} label="storage.md" />
          <TreeRow depth={0} label="meetings" folder />
          <TreeRow depth={1} label="2026-08-14.md" />
          <TreeRow depth={0} label="reading-list.md" />
          <TreeRow depth={0} label="README.md" />
        </aside>

        <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
      </div>

      <div className="flex items-center gap-3 border-t border-[#1f1f1f] px-4 py-2 text-[11px] text-[#8a8a8a]">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8a9bb8]" />
          All changes saved just now
        </span>
        <span className="ml-auto hidden font-mono md:inline">architecture/sync-engine.md</span>
      </div>
    </div>
  );
}

/* ── Panes ────────────────────────────────────────────────────────────────── */

function WritePane() {
  return (
    <div className="flex h-full">
      <div className="hidden min-w-0 flex-1 flex-col border-r border-[#1f1f1f] p-5 font-mono text-[12.5px] leading-relaxed md:flex">
        <PaneLabel>Source</PaneLabel>
        <pre className="whitespace-pre-wrap text-[#c4c4c4]">
          <span className="text-[#8a9bb8]"># Sync engine</span>
          {"\n\n"}
          Writes land in IndexedDB first, then{"\n"}
          drain to GitHub as one <span className="text-[#f0f0f0]">**atomic commit**</span>.{"\n\n"}
          <span className="text-[#8a9bb8]">## Guarantees</span>
          {"\n\n"}- Nothing is lost when the tab closes{"\n"}- Offline edits queue and replay{"\n"}-
          Conflicts are shown, never merged
        </pre>
      </div>

      <div className="min-w-0 flex-1 p-6">
        <PaneLabel>Preview</PaneLabel>
        <h3 className="mb-3 text-2xl font-semibold tracking-tight">Sync engine</h3>
        <p className="mb-5 text-[15px] leading-relaxed text-[#c4c4c4]">
          Writes land in IndexedDB first, then drain to GitHub as one{" "}
          <strong className="font-semibold text-[#f0f0f0]">atomic commit</strong>.
        </p>
        <h4 className="mb-2 text-[15px] font-semibold tracking-tight">Guarantees</h4>
        <ul className="space-y-1.5 text-[14px] text-[#c4c4c4]">
          {[
            "Nothing is lost when the tab closes",
            "Offline edits queue and replay",
            "Conflicts are shown, never merged",
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#8a9bb8]"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DiagramPane() {
  return (
    <div className="flex h-full">
      <div className="hidden min-w-0 flex-1 flex-col border-r border-[#1f1f1f] p-5 font-mono text-[12.5px] leading-relaxed md:flex">
        <PaneLabel>Source</PaneLabel>
        <pre className="whitespace-pre-wrap text-[#c4c4c4]">
          <span className="text-[#6a6a6a]">```mermaid</span>
          {"\n"}
          flowchart LR{"\n"}
          {"  "}A[Keystroke] --&gt; B[(IndexedDB)]{"\n"}
          {"  "}B --&gt; C{"{"}Online?{"}"}
          {"\n"}
          {"  "}C --&gt;|yes| D[Commit]{"\n"}
          {"  "}C --&gt;|no| B{"\n"}
          <span className="text-[#6a6a6a]">```</span>
        </pre>
        <p className="mt-4 rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] px-3 py-2 text-[11px] leading-relaxed text-[#8a8a8a]">
          Or drag it on a canvas — the source is written for you.
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-6">
        <PaneLabel>Rendered</PaneLabel>
        <div className="flex flex-1 items-center justify-center">
          <Flowchart />
        </div>
      </div>
    </div>
  );
}

function SyncPane() {
  const commits = [
    { msg: "Add conflict resolution notes", sha: "a3f9c21", when: "2 minutes ago", now: true },
    { msg: "Update 3 notes", sha: "7b21e08", when: "1 hour ago", now: false },
    { msg: "Rename reading.md to reading-list.md", sha: "1c94ffa", when: "yesterday", now: false },
    { msg: "Initial commit", sha: "0f2a1de", when: "3 days ago", now: false },
  ];

  return (
    <div className="flex h-full flex-col p-6">
      <PaneLabel>Version history</PaneLabel>

      <ol className="space-y-1.5">
        {commits.map((commit) => (
          <li
            key={commit.sha}
            className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 ${
              commit.now ? "border-[#8a9bb8]/40 bg-[#8a9bb8]/8" : "border-[#1f1f1f] bg-[#0a0a0a]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                commit.now ? "bg-[#8a9bb8]" : "bg-[#333333]"
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#f0f0f0]">
              {commit.msg}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-[#8a8a8a]">{commit.sha}</span>
            <span className="hidden shrink-0 text-[11.5px] text-[#8a8a8a] sm:inline">
              {commit.when}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-auto pt-5 text-[12.5px] leading-relaxed text-[#8a8a8a]">
        Real commits in a repository you own. Clone it, revert it, or walk away with all of it —
        there is no export step, because there was never an import step.
      </p>
    </div>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6a6a6a]">
      {children}
    </p>
  );
}

function TreeRow({
  label,
  depth,
  folder = false,
  active = false,
}: {
  label: string;
  depth: number;
  folder?: boolean;
  active?: boolean;
}) {
  return (
    <div
      style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      className={`flex items-center gap-1.5 rounded-md py-1 pr-2 text-[12.5px] ${
        active ? "bg-[#8a9bb8]/12 text-[#8a9bb8]" : folder ? "text-[#8a8a8a]" : "text-[#8a8a8a]"
      }`}
    >
      <span aria-hidden="true" className="text-[9px] opacity-70">
        {folder ? "▾" : "•"}
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

/** The rendered Mermaid output, drawn by hand so the hero ships no renderer. */
function Flowchart() {
  return (
    <svg
      viewBox="0 0 420 110"
      className="w-full max-w-md"
      aria-hidden="true"
      fill="none"
      fontFamily="var(--font-mono)"
      fontSize="10"
    >
      <defs>
        <marker
          id="fl-hero-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0 8 4 0 8Z" fill="#333333" />
        </marker>
      </defs>

      <g stroke="#333333" strokeWidth="1">
        <path d="M92 34h26" markerEnd="url(#fl-hero-arrow)" />
        <path d="M196 34h26" markerEnd="url(#fl-hero-arrow)" />
        <path d="M300 34h26" markerEnd="url(#fl-hero-arrow)" />
        <path d="M262 52v26H154v-26" markerEnd="url(#fl-hero-arrow)" />
      </g>

      <Node x={10} y={20} w={82} label="Keystroke" />
      <Node x={118} y={20} w={78} label="IndexedDB" accent />
      <Node x={222} y={20} w={78} label="Online?" />
      <Node x={326} y={20} w={84} label="Commit" accent />

      <text x="203" y="74" fill="#6a6a6a">
        no
      </text>
      <text x="306" y="28" fill="#6a6a6a">
        yes
      </text>
    </svg>
  );
}

function Node({
  x,
  y,
  w,
  label,
  accent = false,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={28}
        rx={7}
        fill={accent ? "rgba(62,207,142,0.10)" : "#0a0a0a"}
        stroke={accent ? "#8a9bb8" : "#333333"}
      />
      <text x={x + w / 2} y={y + 18} textAnchor="middle" fill={accent ? "#8a9bb8" : "#c4c4c4"}>
        {label}
      </text>
    </g>
  );
}
