"use client";

import React, { useState } from "react";

// ─── Props ──────────────────────────────────────────────────────────────────
// collapsed: whether the right panel is hidden (0px) or visible (280px)
// onToggle:  callback to flip the collapsed flag from the parent
interface EditorRightPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ─── Sync-status type for the indicator ────────────────────────────────────
// "synced"   → green dot, "Synced"
// "syncing"  → amber dot with pulse, "Syncing…"
// "conflict" → red dot, "Conflict"
// "local"    → mist dot, "Local Only" (guest mode)
type SyncStatus = "synced" | "syncing" | "conflict" | "local";

// ─── Status dropdown options ───────────────────────────────────────────────
const STATUS_OPTIONS = ["Draft", "In Review", "Published"] as const;

// ─── Main Right Panel Component ────────────────────────────────────────────
export default function EditorRightPanel({
  collapsed,
  onToggle,
}: EditorRightPanelProps) {
  // ── Local state for the frontmatter form fields ──────────────────────────
  const [title, setTitle] = useState("Welcome Note");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("Draft");
  const [tags, setTags] = useState<string[]>(["markdown", "editor"]);
  const [tagInput, setTagInput] = useState(""); // current text in the tag input
  const [created, setCreated] = useState("2026-08-16");
  const [author, setAuthor] = useState("Guest");

  // Guest mode – hardcoded for now; in production, derive from auth state
  const syncStatus: SyncStatus = "local";

  // ── Derive colour & label from the sync status ───────────────────────────
  const syncConfig: Record<
    SyncStatus,
    { color: string; label: string; pulse: boolean }
  > = {
    synced: { color: "var(--color-trail-teal)", label: "Synced", pulse: false },
    syncing: {
      color: "var(--color-signal-amber)",
      label: "Syncing…",
      pulse: true,
    },
    conflict: { color: "var(--color-ember)", label: "Conflict", pulse: false },
    local: { color: "var(--color-mist)", label: "Local Only", pulse: false },
  };

  const { color, label, pulse } = syncConfig[syncStatus];

  // ── Handler: add a tag when the user presses Enter ───────────────────────
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      // Prevent duplicate tags
      if (!tags.includes(tagInput.trim().toLowerCase())) {
        setTags([...tags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
    }
  };

  // ── Handler: remove a tag by index ───────────────────────────────────────
  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  // ── If panel is collapsed, render only a thin toggle strip ───────────────
  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="w-8 shrink-0 border-l border-[var(--color-chalk)] bg-[var(--color-paper)] flex items-start justify-center pt-4 cursor-pointer hover:bg-[var(--color-chalk)]/50 transition-colors"
        aria-label="Expand right panel"
        title="Expand right panel"
      >
        {/* Left-pointing chevron to indicate "expand" */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-mist)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    );
  }

  return (
    <aside className="w-[280px] shrink-0 border-l border-[var(--color-chalk)] bg-[var(--color-paper)] flex flex-col overflow-hidden">
      {/* ── Sync status indicator (always visible at top) ──────────────── */}
      <div className="h-14 border-b border-[var(--color-chalk)] flex items-center px-4 gap-2 shrink-0">
        {/* Coloured status dot — optionally pulsing */}
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${pulse ? "animate-pulse" : ""}`}
          style={{ backgroundColor: color }}
        />
        {/* Status label text */}
        <span className="text-xs font-medium" style={{ color }}>
          {label}
        </span>

        {/* Spacer pushes the collapse button to the right */}
        <div className="flex-1" />

        {/* Collapse button (right-pointing chevron) */}
        <button
          onClick={onToggle}
          className="p-1 rounded-md hover:bg-[var(--color-chalk)] transition-colors cursor-pointer"
          aria-label="Collapse right panel"
          title="Collapse right panel"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-mist)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* ── Scrollable frontmatter form ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Section header */}
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-mist)] mb-4 select-none">
          Properties
        </h3>

        {/* ── Title field ─────────────────────────────────────────────── */}
        <label className="block mb-3">
          <span className="text-[11px] font-medium text-[var(--color-mist)] mb-1 block">
            Title
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-chalk)] bg-white/40 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)] transition-colors"
          />
        </label>

        {/* ── Status dropdown ─────────────────────────────────────────── */}
        <label className="block mb-3">
          <span className="text-[11px] font-medium text-[var(--color-mist)] mb-1 block">
            Status
          </span>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])
            }
            className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-chalk)] bg-white/40 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)] transition-colors cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        {/* ── Tags input with pill display ────────────────────────────── */}
        <label className="block mb-3">
          <span className="text-[11px] font-medium text-[var(--color-mist)] mb-1 block">
            Tags
          </span>
          {/* Pill container */}
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {tags.map((tag, i) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-trail-teal)]/10 text-[var(--color-trail-teal)] text-[11px] font-medium"
              >
                {tag}
                {/* Remove tag button */}
                <button
                  onClick={() => removeTag(i)}
                  className="hover:text-[var(--color-ember)] transition-colors cursor-pointer leading-none"
                  aria-label={`Remove tag ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {/* Text input to add new tags */}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Add tag…"
            className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-chalk)] bg-white/40 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)] transition-colors placeholder:text-[var(--color-mist)]"
          />
        </label>

        {/* ── Created date field ──────────────────────────────────────── */}
        <label className="block mb-3">
          <span className="text-[11px] font-medium text-[var(--color-mist)] mb-1 block">
            Created
          </span>
          <input
            type="date"
            value={created}
            onChange={(e) => setCreated(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-chalk)] bg-white/40 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)] transition-colors"
          />
        </label>

        {/* ── Author field ────────────────────────────────────────────── */}
        <label className="block mb-3">
          <span className="text-[11px] font-medium text-[var(--color-mist)] mb-1 block">
            Author
          </span>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-chalk)] bg-white/40 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)] transition-colors"
          />
        </label>
      </div>
    </aside>
  );
}
