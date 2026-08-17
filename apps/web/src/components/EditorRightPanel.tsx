"use client";

import React, { useMemo, useState } from "react";
import type { Note, NoteFrontmatter, Workspace } from "@forkleaf/types";
import { extractOutline, documentStats } from "@forkleaf/markdown-engine";
import { fileUrl, historyUrl } from "@/lib/github-links";

export interface EditorRightPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  note: Note | null;
  workspace: Workspace | null;
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
 * Obsidian, Jekyll, Hugo or plain git. The GitHub links at the bottom make that
 * checkable rather than just claimed.
 */
export function EditorRightPanel({
  collapsed,
  onToggle,
  note,
  workspace,
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
        className="w-8 shrink-0 border-l border-[var(--fl-border)] bg-[var(--fl-bg)] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
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

  const github = fileUrl(workspace, note?.path ?? null);
  const history = historyUrl(workspace, note?.path ?? null);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--fl-border)] bg-[var(--fl-bg)]">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--fl-border)] px-2 py-2">
        <div role="tablist" className="flex flex-1 gap-0.5">
          {(["properties", "outline"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-lg px-2.5 py-1 text-[12.5px] font-medium capitalize transition-colors ${
                tab === value
                  ? "bg-[var(--fl-elevated)] text-[var(--fl-text)]"
                  : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
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
          className="rounded-lg p-1.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        >
          ›
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!note && (
          <p className="py-8 text-center text-[12.5px] text-[var(--fl-muted)]">
            Open a note to see its properties.
          </p>
        )}

        {note && tab === "properties" && (
          <div className="space-y-3.5">
            <Field label="Title">
              <input
                value={(frontmatter.title as string) ?? ""}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="Untitled"
                className="fl-input"
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
                className="fl-input"
              />
              {tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-[var(--fl-accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--fl-accent)]"
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
                    className="fl-input min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => update({ [key]: undefined })}
                    title={`Remove ${key}`}
                    aria-label={`Remove ${key}`}
                    className="shrink-0 rounded-lg px-2 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-danger)]"
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
              className="flex gap-1"
            >
              <input
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="Add a property…"
                aria-label="New property name"
                className="fl-input min-w-0 flex-1 border-dashed !bg-transparent"
              />
              <button
                type="submit"
                aria-label="Add property"
                className="shrink-0 rounded-lg px-2 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                +
              </button>
            </form>

            {stats && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-[var(--fl-border)] pt-3.5 text-[12px]">
                <Stat label="Words" value={stats.words.toLocaleString()} />
                <Stat label="Read time" value={`${stats.readingMinutes} min`} />
                <Stat label="Headings" value={String(stats.headings)} />
                <Stat label="Diagrams" value={String(stats.diagrams)} />
                {stats.tasks.total > 0 && (
                  <Stat label="Tasks" value={`${stats.tasks.done}/${stats.tasks.total}`} />
                )}
              </dl>
            )}

            <div className="space-y-1.5 border-t border-[var(--fl-border)] pt-3.5">
              <button
                type="button"
                onClick={onExport}
                className="w-full rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[13px] font-medium text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:bg-[var(--fl-elevated)]"
              >
                Export…
              </button>

              {github && (
                <>
                  <PanelLink href={github}>Open on GitHub</PanelLink>
                  <PanelLink href={history!}>Version history</PanelLink>
                </>
              )}
            </div>

            <p className="pt-1 font-mono text-[10.5px] leading-snug text-[var(--fl-muted)]">
              {note.path}
            </p>
          </div>
        )}

        {note && tab === "outline" && (
          <nav aria-label="Document outline">
            {outline.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
                Add headings to build an outline.
                <br />
                Type <span className="font-mono">/</span> and pick Heading 1.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {outline.map((heading, index) => (
                  <li key={`${heading.slug}-${index}`}>
                    <a
                      href={`#${heading.slug}`}
                      style={{ paddingLeft: `${0.5 + (heading.depth - 1) * 0.75}rem` }}
                      className="block truncate rounded-lg py-1 pr-2 text-[13px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)]"
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

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-full items-center gap-2 rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[13px] font-medium text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:bg-[var(--fl-elevated)]"
    >
      <span className="flex-1 text-left">{children}</span>
      <span aria-hidden="true" className="text-[var(--fl-muted)]">
        ↗
      </span>
    </a>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--fl-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--fl-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--fl-text)]">{value}</dd>
    </div>
  );
}
