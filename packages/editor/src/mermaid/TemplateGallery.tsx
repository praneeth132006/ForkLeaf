"use client";

import React, { useState, useMemo } from "react";
import { DIAGRAM_TEMPLATES, type DiagramTemplate } from "@mdnotion/diagrams";

export interface TemplateGalleryProps {
  onPick: (template: DiagramTemplate) => void;
  onCancel?: () => void;
}

/**
 * The starter-diagram picker.
 *
 * Mermaid's real barrier is the blank page, so this is the first thing shown
 * when a diagram block is empty: pick something that already works, then edit.
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search diagram types…"
          aria-label="Search diagram templates"
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-trail-teal)]"
        />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md px-3 py-1.5 text-sm text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="grid flex-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onPick(template)}
            className="group flex flex-col items-start gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition hover:border-[var(--color-trail-teal)] hover:shadow-sm focus:border-[var(--color-trail-teal)] focus:outline-none"
          >
            <span aria-hidden="true" className="text-xl">
              {template.icon}
            </span>
            <span className="font-medium text-[var(--color-ink)]">{template.title}</span>
            <span className="text-xs leading-snug text-[var(--color-mist)]">
              {template.description}
            </span>
          </button>
        ))}

        {results.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-[var(--color-mist)]">
            No templates match “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
