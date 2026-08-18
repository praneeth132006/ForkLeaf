import React from "react";
import { SectionHeading } from "./SectionHeading";

/**
 * Feature grid.
 *
 * Every claim here maps to code that exists in this repository. The previous
 * version advertised Pandoc-backed LaTeX and EPUB export, a pull-request review
 * flow and WebRTC collaborative editing — none of which ForkLeaf does, and the
 * last of which it deliberately does not do.
 */
const FEATURES = [
  {
    title: "Three editors, one file",
    body: "Rich-text blocks, a split view, or raw source. Switch per note; the Markdown on disk is identical either way.",
    span: "md:col-span-2",
    art: <ModesArt />,
  },
  {
    title: "Diagrams without the syntax",
    body: "A visual Mermaid builder with templates, a cheatsheet and live rendering. Node positions round-trip through the file.",
    span: "",
    art: <DiagramArt />,
  },
  {
    title: "Offline by default",
    body: "Writes hit IndexedDB first. The sync queue drains when you reconnect, and tells you plainly what is saved where.",
    span: "",
    art: <OfflineArt />,
  },
  {
    title: "Real conflict resolution",
    body: "Edit the same note on your phone and your laptop and ForkLeaf shows you both versions instead of silently picking one.",
    span: "",
    art: <ConflictArt />,
  },
  {
    title: "Export that keeps the diagrams",
    body: "Markdown, HTML, Word and PDF — all rendered in the browser, so the note never leaves your machine to become a file.",
    span: "",
    art: <ExportArt />,
  },
] as const;

export function Features() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Features"
        title="Built like a text editor, not like a database with a text box"
        body="Plain files, plain git, plain exports. Everything below is in the repository today."
      />

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className={`fl-card flex flex-col overflow-hidden p-6 transition-colors hover:border-[var(--fl-border-strong)] ${feature.span}`}
          >
            <h3 className="text-[17px] font-semibold tracking-tight text-[var(--fl-text)]">
              {feature.title}
            </h3>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[var(--fl-muted)]">
              {feature.body}
            </p>
            <div className="mt-6 flex-1">{feature.art}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ── Inline art ────────────────────────────────────────────────────────────
   Small CSS/SVG vignettes rather than screenshots: they re-theme with the rest
   of the page and add nothing to the page weight. */

function ModesArt() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {[
        { label: "Rich", active: true },
        { label: "Split", active: false },
        { label: "Source", active: false },
      ].map((mode) => (
        <div
          key={mode.label}
          className={`rounded-lg border p-3 ${
            mode.active
              ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
              : "border-[var(--fl-border)] bg-[var(--fl-elevated)]"
          }`}
        >
          <p
            className={`mb-2.5 text-[11px] font-semibold uppercase tracking-wider ${
              mode.active ? "text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"
            }`}
          >
            {mode.label}
          </p>
          <span className="mb-1.5 block h-1.5 w-3/4 rounded-full bg-[var(--fl-border-strong)]" />
          <span className="mb-1.5 block h-1.5 w-full rounded-full bg-[var(--fl-border)]" />
          <span className="block h-1.5 w-2/3 rounded-full bg-[var(--fl-border)]" />
        </div>
      ))}
    </div>
  );
}

function DiagramArt() {
  return (
    <svg viewBox="0 0 200 78" className="w-full" aria-hidden="true">
      <g stroke="var(--fl-border-strong)" strokeWidth="1" fill="none">
        <path d="M62 22h22" />
        <path d="M116 30v14h-4" />
        <path d="M116 22h22" />
      </g>
      {[
        { x: 6, y: 10, w: 56, label: "Draft", accent: false },
        { x: 84, y: 10, w: 32, label: "PR", accent: true },
        { x: 138, y: 10, w: 56, label: "Merged", accent: false },
        { x: 56, y: 48, w: 56, label: "Revise", accent: false },
      ].map((node) => (
        <g key={node.label}>
          <rect
            x={node.x}
            y={node.y}
            width={node.w}
            height={22}
            rx={6}
            fill={node.accent ? "var(--fl-accent-soft)" : "var(--fl-elevated)"}
            stroke={node.accent ? "var(--fl-accent)" : "var(--fl-border)"}
          />
          <text
            x={node.x + node.w / 2}
            y={node.y + 15}
            textAnchor="middle"
            fontSize="9"
            fill={node.accent ? "var(--fl-accent)" : "var(--fl-muted)"}
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function OfflineArt() {
  return (
    <ul className="space-y-2 font-mono text-[12px]">
      {[
        { label: "sync-engine.md", state: "pushed" },
        { label: "storage.md", state: "queued" },
        { label: "2026-08-14.md", state: "queued" },
      ].map((row) => (
        <li
          key={row.label}
          className="flex items-center gap-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2"
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              row.state === "pushed" ? "bg-[var(--fl-accent)]" : "bg-[var(--fl-warn)]"
            }`}
          />
          <span className="min-w-0 flex-1 truncate text-[var(--fl-muted)]">{row.label}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--fl-muted)]">
            {row.state}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ConflictArt() {
  return (
    <div className="grid grid-cols-2 gap-2 text-[12px]">
      {[
        { label: "This device", accent: true },
        { label: "GitHub", accent: false },
      ].map((side) => (
        <div
          key={side.label}
          className={`rounded-lg border p-3 ${
            side.accent
              ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
              : "border-[var(--fl-border)] bg-[var(--fl-elevated)]"
          }`}
        >
          <p
            className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${
              side.accent ? "text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"
            }`}
          >
            {side.label}
          </p>
          <span className="mb-1.5 block h-1.5 w-full rounded-full bg-[var(--fl-border-strong)]" />
          <span className="block h-1.5 w-1/2 rounded-full bg-[var(--fl-border)]" />
        </div>
      ))}
    </div>
  );
}

function ExportArt() {
  return (
    <div className="flex flex-wrap gap-2">
      {[".md", ".pdf", ".html", ".docx", ".txt"].map((ext) => (
        <span
          key={ext}
          className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-1.5 font-mono text-[12px] text-[var(--fl-muted)]"
        >
          {ext}
        </span>
      ))}
    </div>
  );
}
