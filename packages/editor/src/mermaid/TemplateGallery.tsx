"use client";

import React, { useState, useMemo } from "react";
import { DIAGRAM_TEMPLATES, type DiagramTemplate } from "@forkleaf/diagrams";
import { TemplateThumbnail } from "./TemplateThumbnail";

export interface TemplateGalleryProps {
  onPick: (template: DiagramTemplate) => void;
  onCancel?: () => void;
}

/**
 * Groups, so the list reads as a menu rather than a wall.
 *
 * A first-time user does not know what a "quadrant chart" is, but does know
 * whether they are drawing a *process* or a *conversation*. Templates whose
 * kind is not listed here fall into "Other".
 */
const GROUPS: { label: string; kinds: string[] }[] = [
  { label: "Processes and flows", kinds: ["flowchart", "state", "journey"] },
  { label: "Conversations and time", kinds: ["sequence", "gantt", "timeline", "gitgraph"] },
  { label: "Structure and data", kinds: ["class", "er", "mindmap"] },
  { label: "Numbers", kinds: ["pie", "quadrant"] },
];

/**
 * The starter-diagram picker.
 *
 * Mermaid's real barrier is the blank page, so this is the first thing shown
 * when a diagram block is empty: pick something that already works, then edit.
 * Each card shows a small drawing of the shape it produces — the previous
 * version showed an emoji, which told you nothing about what you were choosing.
 */
export function TemplateGallery({ onPick, onCancel }: TemplateGalleryProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return DIAGRAM_TEMPLATES;

    return DIAGRAM_TEMPLATES.filter(
      (template) =>
        template.title.toLowerCase().includes(needle) ||
        template.description.toLowerCase().includes(needle) ||
        template.kind.includes(needle),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const remaining = new Set(results);
    const sections = GROUPS.map((group) => {
      const items = results.filter((template) => group.kinds.includes(template.kind));
      items.forEach((item) => remaining.delete(item));
      return { label: group.label, items };
    }).filter((section) => section.items.length > 0);

    if (remaining.size > 0) {
      sections.push({ label: "Other", items: [...remaining] });
    }
    return sections;
  }, [results]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--fl-border)] bg-[var(--fl-surface)] px-4 py-3">
        <div className="relative min-w-0 flex-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fl-muted)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search diagram types — flowchart, sequence, gantt…"
            aria-label="Search diagram templates"
            autoFocus
            className="fl-input !py-2 !pl-8"
          />
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-lg px-3 py-2 text-[13px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            Back
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {grouped.map((section) => (
          <section key={section.label} className="mb-6 last:mb-0">
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
              {section.label}
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onPick(template)}
                  className="group flex gap-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3 text-left transition-all hover:-translate-y-px hover:border-[var(--fl-accent)] hover:shadow-[var(--fl-shadow)] focus:border-[var(--fl-accent)] focus:outline-none"
                >
                  <TemplateThumbnail kind={template.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-[var(--fl-text)]">
                      {template.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fl-muted)]">
                      {template.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {results.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--fl-muted)]">
            No templates match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
