"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { Note, NoteFrontmatter, SyncMode, Workspace } from "@forkleaf/types";
import type { LinkRef } from "@forkleaf/markdown-engine";
import { extractOutline, documentStats, serializeDocument } from "@forkleaf/markdown-engine";
import { exportNote, printToPdf, downloadResult } from "@forkleaf/exporter";
import { exportImageResolver } from "@/lib/export-images";
import { deriveTitle } from "@forkleaf/markdown-engine";

export interface EditorRightPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  note: Note | null;
  workspace: Workspace | null;
  onFrontmatterChange: (frontmatter: NoteFrontmatter) => void;
  /** Opens the full export dialog, for the formats and options not shortcut here. */
  onExport: () => void;
  onShowHistory: () => void;
  /**
   * Opens the replay of how this note was written.
   *
   * Its own button rather than a tab you have to know about: the replay was
   * only reachable by opening history and noticing a second tab, which is a
   * place nobody looks for something they have never heard of.
   */
  onReplay: () => void;
  /** Opens the publish dialog. Absent for a workspace with no repository. */
  onPublish?: (() => void) | undefined;
  /**
   * Where this note is published, or null if it is not.
   *
   * The panel is where somebody looks to find out what is true about the note
   * they have open, and "this one is public, at this address" belongs in that
   * list. Before this, publishing left no trace anywhere in the app once the
   * dialog was closed.
   */
  published?: { url: string | null } | undefined;
  /** Drives the auto-save indicator in the panel header. */
  syncMode: SyncMode;
  onSyncNow: () => void;
  /** The `[[wikilink]]` neighbourhood of this note. */
  links: NoteLinks;
  /** Object URLs for assets held on this device, keyed by repository path. */
  assetUrls: Readonly<Record<string, string>>;
}

/** What the Links section draws, and what it can do. */
export interface NoteLinks {
  /** False while the graph is still being built. */
  ready: boolean;
  /** Notes linking *to* this one. */
  backlinks: LinkRef[];
  /** Links written *in* this one. */
  outgoing: LinkRef[];
  /** Display title for a path, so a note never read still has a name. */
  titleFor: (path: string) => string;
  onOpen: (path: string) => void;
  /** Creates the note a link points at but that nobody has written yet. */
  onCreate: (target: string) => void;
}

/**
 * Frontmatter keys the panel does not offer as free-text fields.
 *
 * Either they have a dedicated editor above (title, tags) or they are
 * maintained by the app on every save (created, updated, editedBy, generator).
 * Showing a machine-written field as an editable box invites someone to change
 * it and then watch it revert on the next keystroke.
 */
const RESERVED = new Set(["title", "tags", "created", "updated", "editedBy", "generator"]);

/**
 * Right panel: everything true about the document that is not the document.
 *
 * Properties and the outline used to be two tabs, which meant the panel could
 * only ever answer one of "what is this note" and "what is in it" — and the
 * reader had to remember which tab the thing they wanted was behind. It is one
 * scrolling column now: identity, then measurements, then the things you can
 * do with it, then its shape. Nothing is hidden behind a tab.
 *
 * Properties are the note's YAML frontmatter, edited directly — what is shown
 * here is literally what is written into the file, so notes stay portable to
 * Obsidian, Jekyll, Hugo or plain git.
 */
export function EditorRightPanel({
  collapsed,
  onToggle,
  note,
  workspace,
  onFrontmatterChange,
  onExport,
  onShowHistory,
  onReplay,
  onPublish,
  published,
  syncMode,
  onSyncNow,
  links,
  assetUrls,
}: EditorRightPanelProps) {
  const [newKey, setNewKey] = useState("");
  const [newTag, setNewTag] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const outline = useMemo(() => (note ? extractOutline(note.content) : []), [note]);
  const stats = useMemo(() => (note ? documentStats(note.content) : null), [note]);

  // Memoised because `update` closes over it: a fresh `{}` each render would
  // rebuild that callback on every keystroke.
  const frontmatter = useMemo(() => note?.frontmatter ?? {}, [note?.frontmatter]);
  const tags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [];
  const custom = Object.entries(frontmatter).filter(([key]) => !RESERVED.has(key));

  const update = useCallback(
    (patch: NoteFrontmatter) => {
      const next = { ...frontmatter, ...patch };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key];
      }
      onFrontmatterChange(next);
    },
    [frontmatter, onFrontmatterChange],
  );

  const copyMarkdown = useCallback(async () => {
    if (!note) return;
    // The frontmatter goes with it: what is copied is the file, not a view of
    // the file, which is what "Copy Markdown" has to mean in an app whose
    // whole premise is that the file is the real thing.
    await navigator.clipboard.writeText(serializeDocument(note.content, note.frontmatter));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [note]);

  const runExport = useCallback(
    async (format: "html" | "pdf") => {
      if (!note) return;

      setBusy(format);
      try {
        const options = {
          format,
          title: deriveTitle(note.content, note.frontmatter.title, note.path),
          includeFrontmatter: false,
          renderDiagrams: true,
          theme: "light" as const,
        };

        // Images travel as data URLs, so the file that leaves carries its
        // pictures rather than pointing at a place the reader does not have.
        const images = exportImageResolver(workspace, note.path, assetUrls);

        // PDF goes through the browser's print pipeline, which is the only way
        // to get selectable text without shipping a rendering engine.
        if (format === "pdf") await printToPdf(note, options, images);
        else downloadResult(await exportNote(note, options, images));
      } finally {
        setBusy(null);
      }
    },
    [note, workspace, assetUrls],
  );

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Show document panel"
        aria-label="Show document panel"
        className="w-8 shrink-0 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
      >
        ‹
      </button>
    );
  }

  // History comes from the repository, so it only exists once one is connected.
  const hasHistory = Boolean(workspace && !workspace.isLocal && note);

  return (
    <aside className="flex w-72 shrink-0 flex-col">
      {/* ── Header: the one thing people check without looking away ─────── */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--fl-border)] px-3">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px]">
          {syncMode === "auto" ? (
            <>
              <CheckGlyph />
              <span className="truncate text-[var(--fl-text)]">Auto-save ON</span>
            </>
          ) : (
            <>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--fl-warn)]" />
              <span className="truncate text-[var(--fl-muted)]">
                {syncMode === "manual" ? "Auto-save off" : "Auto-save on a timer"}
              </span>
            </>
          )}
        </span>

        <button
          type="button"
          onClick={onSyncNow}
          title="Sync now (⌘S)"
          aria-label="Sync now"
          className="shrink-0 rounded-lg p-1.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        >
          <RefreshGlyph />
        </button>

        <button
          type="button"
          onClick={onToggle}
          title="Hide panel"
          aria-label="Hide panel"
          className="shrink-0 rounded-lg p-1.5 text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
        >
          ›
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!note ? (
          <p className="px-4 py-10 text-center text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
            Open a note to see its properties, statistics and outline.
          </p>
        ) : (
          <>
            {/* ── Document ──────────────────────────────────────────────── */}
            <Section title="Document">
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-[var(--fl-muted)]">Title</span>
                <input
                  value={(frontmatter.title as string) ?? ""}
                  onChange={(event) => update({ title: event.target.value })}
                  placeholder="Untitled"
                  className="fl-input"
                />
              </label>

              <div className="mt-3">
                <span className="mb-1.5 block text-[12px] text-[var(--fl-muted)]">Tags</span>

                <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2 py-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-md bg-[var(--fl-accent-soft)] px-1.5 py-0.5 text-[11.5px] text-[var(--fl-accent)]"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => update({ tags: tags.filter((t) => t !== tag) })}
                        aria-label={`Remove tag ${tag}`}
                        className="opacity-70 transition-opacity hover:opacity-100"
                      >
                        <CrossGlyph />
                      </button>
                    </span>
                  ))}

                  {newTag === null ? (
                    <button
                      type="button"
                      onClick={() => setNewTag("")}
                      aria-label="Add a tag"
                      className="ml-auto rounded p-0.5 text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
                    >
                      <PlusGlyph />
                    </button>
                  ) : (
                    <input
                      autoFocus
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      onBlur={() => setNewTag(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setNewTag(null);
                        if (event.key !== "Enter") return;

                        event.preventDefault();
                        const value = newTag.trim();
                        // Silently ignoring a duplicate is right: the tag the
                        // user wanted is already there.
                        if (value && !tags.includes(value)) update({ tags: [...tags, value] });
                        setNewTag("");
                      }}
                      placeholder="Add a tag…"
                      aria-label="New tag"
                      className="min-w-[6rem] flex-1 bg-transparent text-[12px] text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-muted)]"
                    />
                  )}
                </div>
              </div>

              {custom.map(([key, value]) => (
                <div key={key} className="mt-3">
                  <span className="mb-1.5 block text-[12px] text-[var(--fl-muted)]">{key}</span>
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
                      <CrossGlyph />
                    </button>
                  </div>
                </div>
              ))}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const key = newKey.trim();
                  if (key && !(key in frontmatter)) update({ [key]: "" });
                  setNewKey("");
                }}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--fl-border)] px-2.5 py-1.5"
              >
                <CheckGlyph muted />
                <input
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  placeholder="Add property"
                  aria-label="New property name"
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--fl-text)] outline-none placeholder:text-[var(--fl-muted)]"
                />
                <button
                  type="submit"
                  aria-label="Add property"
                  className="shrink-0 rounded p-0.5 text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
                >
                  <PlusGlyph />
                </button>
              </form>
            </Section>

            {/* ── Stats ─────────────────────────────────────────────────── */}
            {stats && (
              <Section title="Stats">
                <dl className="space-y-2 text-[12.5px]">
                  <Stat label="Words" value={stats.words.toLocaleString()} />
                  <Stat label="Characters" value={stats.characters.toLocaleString()} />
                  <Stat label="Read time" value={`${stats.readingMinutes} min`} />
                  <Stat label="Headings" value={String(stats.headings)} />
                  <Stat label="Code blocks" value={String(stats.codeBlocks)} />
                  <Stat label="Links" value={String(stats.links)} />
                  <Stat label="Images" value={String(stats.images)} />
                  {/* Only when there are any: an unbroken row of zeroes is
                      noise, and these two are not true of most notes. */}
                  {stats.diagrams > 0 && <Stat label="Diagrams" value={String(stats.diagrams)} />}
                  {stats.tasks.total > 0 && (
                    <Stat label="Tasks" value={`${stats.tasks.done}/${stats.tasks.total}`} />
                  )}
                </dl>
              </Section>
            )}

            {/* ── Published ─────────────────────────────────────────────── */}
            {/* Only when the note is public. A row saying "not published" on
                every one of a thousand private notes would be noise about
                nothing; this section appearing at all is the signal. */}
            {published && (
              <Section title="Published">
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[12.5px] text-[var(--fl-text)]">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
                    />
                    This note is a public page.
                  </p>

                  {published.url ? (
                    <a
                      href={published.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block break-all font-mono text-[11.5px] text-[var(--fl-accent)] underline underline-offset-2"
                    >
                      {published.url}
                    </a>
                  ) : (
                    /* The page is committed, and GitHub Pages is not serving
                       the repository — so there is a file and no address.
                       Saying which of the two is missing is the difference
                       between a fixable state and a broken one. */
                    <p className="text-[12px] leading-relaxed text-[var(--fl-muted)]">
                      The page is committed, but GitHub Pages is switched off for this repository,
                      so it has no address yet.
                    </p>
                  )}

                  <p className="text-[12px] leading-relaxed text-[var(--fl-muted)]">
                    Publishing again updates it. Unpublishing deletes the page and leaves the note
                    alone.
                  </p>
                </div>
              </Section>
            )}

            {/* ── Actions ───────────────────────────────────────────────── */}
            <Section title="Actions">
              <div className="space-y-1.5">
                <PanelButton onClick={() => void copyMarkdown()} icon={<CopyGlyph />}>
                  {copied ? "Copied" : "Copy Markdown"}
                </PanelButton>
                <PanelButton
                  onClick={() => void runExport("html")}
                  icon={<FileGlyph />}
                  busy={busy === "html"}
                >
                  Export HTML
                </PanelButton>
                <PanelButton
                  onClick={() => void runExport("pdf")}
                  icon={<FileGlyph />}
                  busy={busy === "pdf"}
                >
                  Export PDF
                </PanelButton>
                {hasHistory && onPublish && (
                  <PanelButton onClick={onPublish} icon={<ShareGlyph />}>
                    {published ? "Published as a page" : "Publish as a page"}
                  </PanelButton>
                )}
                {/* Named for the thing it shows. "Version history" is accurate
                    and is not what anybody searches for — every save here is a
                    git commit, and people go looking for the word "commits". */}
                {hasHistory && (
                  <PanelButton onClick={onShowHistory} icon={<HistoryGlyph />}>
                    History &amp; commits
                  </PanelButton>
                )}
                {hasHistory && (
                  <PanelButton onClick={onReplay} icon={<ReplayGlyph />}>
                    Replay how this was written
                  </PanelButton>
                )}
                <button
                  type="button"
                  onClick={onExport}
                  className="w-full px-1 pt-1 text-left text-[12px] text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]"
                >
                  More formats and options…
                </button>
              </div>
            </Section>

            {/* ── Links ─────────────────────────────────────────────────── */}
            <Section title="Links">
              <LinksSection note={note} links={links} />
            </Section>

            {/* ── Outline ───────────────────────────────────────────────── */}
            <Section title="Outline" last>
              {outline.length === 0 ? (
                <p className="text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
                  Add headings to build an outline. Type <span className="font-mono">/</span> and
                  pick Heading 1.
                </p>
              ) : (
                <nav aria-label="Document outline">
                  <ul className="space-y-0.5">
                    {outline.map((heading, index) => (
                      <li key={`${heading.slug}-${index}`}>
                        <a
                          href={`#${heading.slug}`}
                          style={{ paddingLeft: `${(heading.depth - 1) * 0.75}rem` }}
                          className="flex items-center gap-1.5 truncate rounded-lg py-1 pr-2 text-[12.5px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)]"
                        >
                          <span
                            aria-hidden="true"
                            className="shrink-0 text-[9px] text-[var(--fl-muted)]"
                          >
                            {heading.depth === 1 ? "▾" : "•"}
                          </span>
                          <span className="truncate">{heading.text}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              <p className="mt-3 truncate font-mono text-[10.5px] text-[var(--fl-muted)]">
                {note.path}
              </p>
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/**
 * The note's neighbourhood: what it points at, and what points back.
 *
 * Backlinks come first and outgoing links second, which is the opposite of
 * the order they are written in. Outgoing links are already visible — they are
 * in the text a few centimetres to the left. Backlinks are the half you cannot
 * see from the document, and are the only reason to look at this section.
 */
function LinksSection({ note, links }: { note: Note; links: NoteLinks }) {
  const outgoing = links.outgoing;
  const backlinks = links.backlinks;

  if (!links.ready) {
    return <p className="text-[12.5px] text-[var(--fl-muted)]">Reading your notes…</p>;
  }

  if (backlinks.length === 0 && outgoing.length === 0) {
    return (
      <p className="text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
        Write <span className="font-mono text-[11.5px]">[[another note]]</span> to link to it. Notes
        that link here will show up in this panel.
      </p>
    );
  }

  return (
    <div className="space-y-3.5">
      {backlinks.length > 0 && (
        <div>
          <LinkGroupLabel>
            {backlinks.length} {backlinks.length === 1 ? "note links here" : "notes link here"}
          </LinkGroupLabel>
          <ul className="space-y-1">
            {backlinks.map((ref, index) => (
              <li key={`${ref.from}-${index}`}>
                <button
                  type="button"
                  onClick={() => links.onOpen(ref.from)}
                  className="block w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-[var(--fl-elevated)]"
                >
                  <span className="block truncate text-[12.5px] text-[var(--fl-text)]">
                    {links.titleFor(ref.from)}
                  </span>
                  {/* The line the link was written on. A backlink without its
                      sentence is a filename, which is rarely enough to know
                      whether it is the one you are looking for. */}
                  {ref.context && (
                    <span className="mt-0.5 block truncate text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
                      {ref.context}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <LinkGroupLabel>Links from this note</LinkGroupLabel>
          <ul className="space-y-1">
            {outgoing.map((ref, index) => (
              <li key={`${ref.target}-${index}`}>
                {ref.to ? (
                  <button
                    type="button"
                    onClick={() => links.onOpen(ref.to!)}
                    className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[12.5px] text-[var(--fl-text)] transition-colors hover:bg-[var(--fl-elevated)]"
                  >
                    <span aria-hidden="true" className="shrink-0 text-[var(--fl-muted)]">
                      <LinkGlyph />
                    </span>
                    <span className="truncate">{links.titleFor(ref.to)}</span>
                  </button>
                ) : (
                  // A link to a note that does not exist is not a mistake: it
                  // is how an outline gets written. So it offers to make it
                  // rather than reporting a broken link.
                  <button
                    type="button"
                    onClick={() => links.onCreate(ref.target)}
                    title={`Create ${ref.target}`}
                    className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[12.5px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
                  >
                    <span aria-hidden="true" className="shrink-0">
                      <PlusGlyph />
                    </span>
                    <span className="truncate italic">{ref.target}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="sr-only">Links for {note.path}</p>
    </div>
  );
}

function LinkGroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 px-1.5 text-[11.5px] text-[var(--fl-muted)]">{children}</p>;
}

function Section({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`px-3 py-3.5 ${last ? "" : "border-b border-[var(--fl-border)]"}`}>
      <h2 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--fl-muted)]">{label}</dt>
      <dd className="font-medium tabular-nums text-[var(--fl-text)]">{value}</dd>
    </div>
  );
}

function PanelButton({
  onClick,
  icon,
  children,
  busy = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[12.5px] font-medium text-[var(--fl-text)] transition-colors hover:border-[var(--fl-border-strong)] hover:bg-[var(--fl-elevated)] disabled:opacity-50"
    >
      <span aria-hidden="true" className="shrink-0 text-[var(--fl-muted)]">
        {icon}
      </span>
      {busy ? "Working…" : children}
    </button>
  );
}

/* ── Glyphs ───────────────────────────────────────────────────────────────── */

function CheckGlyph({ muted = false }: { muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 ${muted ? "text-[var(--fl-muted)]" : "text-[var(--fl-accent)]"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 8.5 3.5 3.5L13 4.5" />
    </svg>
  );
}

function RefreshGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.5 7a5.5 5.5 0 0 0-9.9-3.1M2.5 9a5.5 5.5 0 0 0 9.9 3.1" />
      <path d="M13.5 3.5V7H10M2.5 12.5V9H6" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    >
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.75" />
      <path d="M10.5 5.5v-1a1.75 1.75 0 0 0-1.75-1.75H4.25A1.75 1.75 0 0 0 2.5 4.5v4.5c0 .97.78 1.75 1.75 1.75h1" />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M9 1.75H4.5A1.75 1.75 0 0 0 2.75 3.5v9c0 .97.78 1.75 1.75 1.75h7a1.75 1.75 0 0 0 1.75-1.75V6z" />
      <path d="M9 1.75V6h4.25" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 10.5V2.5M8 2.5 5.25 5.25M8 2.5l2.75 2.75" />
      <path d="M3.25 9.5v3a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M6.5 9.5a2.75 2.75 0 0 0 4 .25l2-2a2.75 2.75 0 0 0-3.9-3.9l-1.1 1.1" />
      <path d="M9.5 6.5a2.75 2.75 0 0 0-4-.25l-2 2a2.75 2.75 0 0 0 3.9 3.9l1.1-1.1" />
    </svg>
  );
}

/** A play head over a rising line — the replay's own chart, in miniature. */
function ReplayGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.75 11.5 5 8l2.5 2 4.75-5.5" />
      <path d="M1.75 14.25h12.5" />
      <circle cx="12.25" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function HistoryGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.78" />
      <path d="M2.5 3v2.75h2.75M8 5v3.25l2 1.25" />
    </svg>
  );
}
