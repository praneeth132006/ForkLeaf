import React from "react";

/**
 * A static, faithful mock of the ForkLeaf editor for the landing hero.
 *
 * Deliberately not a live editor and not an animation. The previous hero typed
 * markdown out character by character, which drew the eye away from the copy
 * and told the visitor nothing they could not guess. A still frame that matches
 * what the product actually looks like — same chrome, same palette, same
 * three-pane layout — is a more honest promise and costs no JavaScript.
 *
 * Always dark, in both themes: it reads as a screenshot rather than as part of
 * the page.
 */
export function AppPreview() {
  return (
    <div
      aria-label="Screenshot of the ForkLeaf editor"
      role="img"
      className="overflow-hidden rounded-2xl border border-[#232823] bg-[#0a0c0a] text-[#e9ece7] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]"
    >
      {/* ── Window chrome ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-[#1c211c] px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a302a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a302a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a302a]" />
        </span>
        <span className="mx-auto rounded-md bg-[#101310] px-3 py-1 font-mono text-[11px] text-[#6f776e]">
          praneeth132006/notes · main
        </span>
        <span className="hidden items-center gap-1.5 text-[11px] text-[#6f776e] sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3ecf8e]" />
          Synced
        </span>
      </div>

      <div className="flex min-h-[420px]">
        {/* ── File tree ───────────────────────────────────────────────── */}
        <aside className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-[#1c211c] p-3 sm:flex">
          <div className="mb-2 rounded-md bg-[#101310] px-2.5 py-1.5 text-[11px] text-[#6f776e]">
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

        {/* ── Source pane ─────────────────────────────────────────────── */}
        <div className="hidden min-w-0 flex-1 flex-col border-r border-[#1c211c] p-5 font-mono text-[12.5px] leading-relaxed md:flex">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5c645b]">
            Source
          </p>
          <pre className="whitespace-pre-wrap text-[#a8b0a6]">
            <span className="text-[#3ecf8e]"># Sync engine</span>
            {"\n\n"}
            Writes land in IndexedDB first, then drain{"\n"}
            to GitHub in a single{" "}
            <span className="text-[#e9ece7]">**atomic commit**</span>.{"\n\n"}
            <span className="text-[#5c645b]">```mermaid</span>
            {"\n"}
            flowchart LR{"\n"}
            {"  "}A[Keystroke] --&gt; B[(IndexedDB)]{"\n"}
            {"  "}B --&gt; C{"{"}Online?{"}"}
            {"\n"}
            {"  "}C --&gt;|yes| D[Commit]{"\n"}
            {"  "}C --&gt;|no| B{"\n"}
            <span className="text-[#5c645b]">```</span>
          </pre>
        </div>

        {/* ── Rendered pane ───────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 p-6">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5c645b]">
            Preview
          </p>
          <h3 className="mb-3 text-2xl font-semibold tracking-tight">Sync engine</h3>
          <p className="mb-5 text-[15px] leading-relaxed text-[#a8b0a6]">
            Writes land in IndexedDB first, then drain to GitHub in a single{" "}
            <strong className="font-semibold text-[#e9ece7]">atomic commit</strong>.
          </p>
          <MiniFlowchart />
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-t border-[#1c211c] px-4 py-2 text-[11px] text-[#6f776e]">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3ecf8e]" />
          All changes saved just now
        </span>
        <span className="hidden sm:inline">notes · main</span>
        <span className="ml-auto hidden font-mono md:inline">architecture/sync-engine.md</span>
      </div>
    </div>
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
        active ? "bg-[#3ecf8e]/12 text-[#3ecf8e]" : folder ? "text-[#8b938a]" : "text-[#7d857c]"
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
function MiniFlowchart() {
  return (
    <svg
      viewBox="0 0 420 96"
      className="w-full max-w-md"
      aria-hidden="true"
      fill="none"
      fontFamily="var(--font-mono)"
      fontSize="10"
    >
      <g stroke="#2f3a31" strokeWidth="1">
        <path d="M92 34h26" markerEnd="url(#fl-arrow-head)" />
        <path d="M196 34h26" markerEnd="url(#fl-arrow-head)" />
        <path d="M300 34h26" markerEnd="url(#fl-arrow-head)" />
        <path d="M262 52v22H154v-22" markerEnd="url(#fl-arrow-head)" />
      </g>
      <defs>
        <marker
          id="fl-arrow-head"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0 8 4 0 8Z" fill="#2f3a31" />
        </marker>
      </defs>

      <Node x={10} y={20} w={82} label="Keystroke" />
      <Node x={118} y={20} w={78} label="IndexedDB" accent />
      <Node x={222} y={20} w={78} label="Online?" />
      <Node x={326} y={20} w={84} label="Commit" accent />

      <text x="200" y="70" fill="#5c645b">
        no
      </text>
      <text x="308" y="28" fill="#5c645b">
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
        fill={accent ? "rgba(62,207,142,0.10)" : "#101310"}
        stroke={accent ? "#3ecf8e" : "#2f3a31"}
      />
      <text
        x={x + w / 2}
        y={y + 18}
        textAnchor="middle"
        fill={accent ? "#3ecf8e" : "#a8b0a6"}
      >
        {label}
      </text>
    </g>
  );
}
