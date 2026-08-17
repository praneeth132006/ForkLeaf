"use client";

import React, { useMemo, useState } from "react";
import type { Note, NoteFrontmatter } from "@mdnotion/types";
import { extractOutline, documentStats } from "@mdnotion/markdown-engine";

export interface EditorRightPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  note: Note | null;
  onFrontmatterChange: (frontmatter: NoteFrontmatter) => void;
  onExport: () => void;
}

/** Frontmatter keys that get a dedicated editor rather than the generic list. */
const RESERVED = new Set(["title", "tags", "created", "updated"]);

/**
 * Right panel: document properties and outline.
 *
 * Properties are the note's YAML frontmatter, edited directly — what is shown
 * here is literally what is written into the file, so notes stay portable to
 * Obsidian, Jekyll, Hugo or plain git.
 */
export function EditorRightPanel({
  collapsed,
  onToggle,
  note,
  onFrontmatterChange,
  onExport,
}: EditorRightPanelProps) {
  const [tab, setTab] = useState<"properties" | "outline">("properties");
  const [newKey, setNewKey] = useState("");

  const outline = useMemo(() => (note ? extractOutline(note.content) : []), [note]);
  const stats = useMemo(() => (note ? documentStats(note.content) : null), [note]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Show properties"
        aria-label="Show properties"
        className="w-8 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-paper)] text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
      >
        ‹
      </button>
    );
  }

  const frontmatter = note?.frontmatter ?? {};
  const tags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [];
  const custom = Object.entries(frontmatter).filter(([key]) => !RESERVED.has(key));

  const update = (patch: NoteFrontmatter) => {
    const next = { ...frontmatter, ...patch };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
    }
    onFrontmatterChange(next);
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-paper)]">
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-2 py-2">
        <div role="tablist" className="flex flex-1 gap-0.5">
          {(["properties", "outline"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                tab === value
                  ? "bg-[var(--color-chalk)] text-[var(--color-ink)]"
                  : "text-[var(--color-mist)] hover:text-[var(--color-ink)]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onToggle}
          title="Hide panel"
          aria-label="Hide panel"
          className="rounded-md p-1 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
        >
          ›
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!note && (
          <p className="py-8 text-center text-xs text-[var(--color-mist)]">
            Open a note to see its properties.
          </p>
        )}

        {note && tab === "properties" && (
          <div className="space-y-3">
            <Field label="Title">
              <input
                value={(frontmatter.title as string) ?? ""}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Untitled"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)]"
              />
            </Field>

            <Field label="Tags">
              <input
                value={tags.join(", ")}
                onChange={(event) =>
                  update({
                    tags: event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="research, draft"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)]"
              />
              {tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-[var(--color-trail-teal)]/12 px-1.5 py-0.5 text-[0.7rem] text-[var(--color-trail-teal)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Field>

            {custom.map(([key, value]) => (
              <Field key={key} label={key}>
                <div className="flex gap-1">
                  <input
                    value={String(value ?? "")}
                    onChange={(event) => update({ [key]: event.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)]"
                  />
                  <button
                    type="button"
                    onClick={() => update({ [key]: undefined })}
                    title={`Remove ${key}`}
                    aria-label={`Remove ${key}`}
                    className="shrink-0 rounded px-2 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ember)]"
                  >
                    ✕
                  </button>
                </div>
              </Field>
            ))}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                const key = newKey.trim();
                if (key && !(key in frontmatter)) update({ [key]: "" });
                setNewKey("");
              }}
              className="flex gap-1 pt-1"
            >
              <input
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="Add a property…"
                aria-label="New property name"
                className="min-w-0 flex-1 rounded-md border border-dashed border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-trail-teal)]"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md px-2 text-[var(--color-mist)] hover:bg-[var(--color-chalk)] hover:text-[var(--color-ink)]"
              >
                ＋
              </button>
            </form>

            {stats && (
              <dl className="grid grid-cols-2 gap-2 border-t border-[var(--color-border)] pt-3 text-xs">
                <Stat label="Words" value={stats.words.toLocaleString()} />
                <Stat label="Read time" value={`${stats.readingMinutes} min`} />
                <Stat label="Headings" value={String(stats.headings)} />
                <Stat label="Diagrams" value={String(stats.diagrams)} />
                {stats.tasks.total > 0 && (
                  <Stat label="Tasks" value={`${stats.tasks.done}/${stats.tasks.total}`} />
                )}
              </dl>
            )}

            <button
              type="button"
              onClick={onExport}
              className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-ink)] hover:border-[var(--color-trail-teal)] hover:bg-[var(--color-chalk)]"
            >
              Export…
            </button>

            <p className="pt-1 font-mono text-[0.65rem] leading-snug text-[var(--color-mist)]">
              {note.path}
            </p>
          </div>
        )}

        {note && tab === "outline" && (
          <nav aria-label="Document outline">
            {outline.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--color-mist)]">
                Add headings to build an outline.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {outline.map((heading, index) => (
                  <li key={`${heading.slug}-${index}`}>
                    <a
                      href={`#${heading.slug}`}
                      style={{ paddingLeft: `${(heading.depth - 1) * 0.75}rem` }}
                      className="block truncate rounded px-2 py-1 text-sm text-[var(--color-ink)] hover:bg-[var(--color-chalk)]"
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--color-mist)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--color-mist)]">{label}</dt>
      <dd className="font-medium text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}
