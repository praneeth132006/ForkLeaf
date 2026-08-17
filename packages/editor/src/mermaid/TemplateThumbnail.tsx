import React from "react";

/**
 * A 44×44 line drawing of the shape each diagram kind produces.
 *
 * Deliberately abstract — it is a silhouette, not a preview. Rendering a real
 * Mermaid preview per card would mean a dozen renderer invocations every time
 * the gallery opens, and the point of the card is only to answer "is this the
 * shape I have in my head?" before you commit to a template.
 */
export function TemplateThumbnail({ kind }: { kind: string }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--fl-border)] bg-[var(--fl-bg)] transition-colors group-hover:border-[var(--fl-accent)]">
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="h-6 w-6 text-[var(--fl-muted)] transition-colors group-hover:text-[var(--fl-accent)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {SHAPES[kind] ?? SHAPES.flowchart}
      </svg>
    </span>
  );
}

const SHAPES: Record<string, React.ReactNode> = {
  // Boxes branching downward.
  flowchart: (
    <>
      <rect x="11" y="3" width="10" height="6" rx="1.5" />
      <path d="M16 9v4M16 13H8v3M16 13h8v3" />
      <rect x="3" y="16" width="10" height="6" rx="1.5" />
      <rect x="19" y="16" width="10" height="6" rx="1.5" />
    </>
  ),
  // Two lifelines with messages between them.
  sequence: (
    <>
      <rect x="3" y="3" width="8" height="4" rx="1" />
      <rect x="21" y="3" width="8" height="4" rx="1" />
      <path d="M7 7v22M25 7v22" strokeDasharray="2 2" />
      <path d="M7 13h18l-2.5-2M25 20H7l2.5-2" />
    </>
  ),
  // A class box with a divided body.
  class: (
    <>
      <rect x="6" y="4" width="20" height="24" rx="2" />
      <path d="M6 11h20M6 19h20M10 15h8M10 23h6" />
    </>
  ),
  // Rounded states linked by an arrow, with a start dot.
  state: (
    <>
      <circle cx="6" cy="8" r="2.5" />
      <rect x="13" y="4" width="16" height="8" rx="4" />
      <path d="M21 12v6M21 18h-2.5" />
      <rect x="3" y="20" width="16" height="8" rx="4" />
    </>
  ),
  // Two tables joined by a crow's-foot line.
  er: (
    <>
      <rect x="3" y="5" width="10" height="10" rx="1.5" />
      <path d="M3 9h10" />
      <rect x="19" y="17" width="10" height="10" rx="1.5" />
      <path d="M19 21h10M13 12h3v10h3M19 19l-3 3 3 3" />
    </>
  ),
  // Stacked bars on a time axis.
  gantt: (
    <>
      <path d="M3 5v24h26" />
      <rect x="7" y="8" width="14" height="3.5" rx="1" />
      <rect x="11" y="14" width="16" height="3.5" rx="1" />
      <rect x="7" y="20" width="10" height="3.5" rx="1" />
    </>
  ),
  // A central node with branches.
  mindmap: (
    <>
      <circle cx="16" cy="16" r="4" />
      <path d="M20 16h4M12 16H8M17.5 12.4 20 8M14.5 19.6 12 24" />
      <circle cx="26" cy="16" r="2" />
      <circle cx="6" cy="16" r="2" />
      <circle cx="21" cy="6.5" r="2" />
      <circle cx="11" cy="25.5" r="2" />
    </>
  ),
  // A circle with one slice pulled out.
  pie: (
    <>
      <circle cx="16" cy="16" r="12" />
      <path d="M16 4v12l8.5 8.5" />
    </>
  ),
  // Steps with faces along a baseline.
  journey: (
    <>
      <path d="M3 24h26" />
      <circle cx="8" cy="17" r="3.5" />
      <circle cx="16" cy="12" r="3.5" />
      <circle cx="24" cy="19" r="3.5" />
      <path d="M8 20.5V24M16 15.5V24M24 22.5V24" />
    </>
  ),
  // Events pinned to a horizontal line.
  timeline: (
    <>
      <path d="M3 16h26" />
      <circle cx="8" cy="16" r="2.5" />
      <circle cx="16" cy="16" r="2.5" />
      <circle cx="24" cy="16" r="2.5" />
      <path d="M8 13.5V7M16 18.5V25M24 13.5V7" />
    </>
  ),
  // Commits on a branch that forks and merges.
  gitgraph: (
    <>
      <path d="M4 22h24" />
      <path d="M11 22c0-6 3-9 8-9h6" />
      <circle cx="6" cy="22" r="2" />
      <circle cx="16" cy="22" r="2" />
      <circle cx="26" cy="22" r="2" />
      <circle cx="25" cy="13" r="2" />
    </>
  ),
  // Four quadrants with plotted points.
  quadrant: (
    <>
      <rect x="4" y="4" width="24" height="24" rx="2" />
      <path d="M16 4v24M4 16h24" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
      <circle cx="22" cy="21" r="1.6" fill="currentColor" />
      <circle cx="21" cy="9" r="1.6" fill="currentColor" />
    </>
  ),
};
