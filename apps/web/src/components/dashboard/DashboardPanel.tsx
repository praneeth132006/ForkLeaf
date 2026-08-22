"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionUser, Workspace } from "@forkleaf/types";
import { useLibrary } from "@/hooks/useLibrary";
import { queryIndex, tagCounts, type IndexEntry, type SortKey } from "@/lib/library";
import { signOut } from "@/lib/gateway";
import { useTheme } from "@/hooks/useTheme";
import { useIndexView, type IndexView } from "@/hooks/useIndexView";
import { StorageBlocked } from "@/components/StorageBlocked";
import { ForkLeafLogo } from "@/components/Brand";
import { PromptDialog, type PromptRequest } from "@/components/PromptDialog";
import { RepoChooser } from "./RepoChooser";
import { FolderNav } from "./FolderNav";
import { NoteList, formatWhen } from "./NoteList";
import { NoteTree } from "./NoteTree";
import { NoteGrid } from "./NoteGrid";

/**
 * The dashboard.
 *
 * Signing in used to drop straight into an empty editor, in a repository the
 * app had just created without asking, with no way to see what was in it other
 * than scrolling a sidebar of filenames. This is the screen that was missing:
 * which repositories are connected, what is in them, and a way into any note in
 * one click — with the repository choice made here rather than assumed.
 */

/** Rows rendered at once. Enough to fill a screen and scroll a little. */
const PAGE_SIZE = 40;

const VIEWS: { value: IndexView; label: string; hint: string }[] = [
  { value: "list", label: "List", hint: "One row per note, newest first" },
  { value: "tree", label: "Tree", hint: "Folders, as they are in the repository" },
  { value: "grid", label: "Cards", hint: "Larger cards showing the opening lines" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently edited" },
  { value: "title", label: "Title" },
  { value: "path", label: "Path" },
  { value: "words", label: "Longest" },
];

export function DashboardPanel({
  user,
  githubAvailable,
}: {
  user: SessionUser | null;
  githubAvailable: boolean;
}) {
  const library = useLibrary();
  const router = useRouter();
  const [theme, , toggleTheme] = useTheme();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  // Remembered across visits: a view preference is not a per-session choice.
  const [view, chooseView] = useIndexView();
  const [showAllTags, setShowAllTags] = useState(false);
  // How many rows of the index are on screen. A repository of a few hundred
  // notes rendered every one of them into the DOM, which is both slow and an
  // invitation to scroll rather than to search.
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [addingRepo, setAddingRepo] = useState(false);
  const [skippedChoice, setSkippedChoice] = useState(false);
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);

  // Which repository the list is showing. Defaults to the first one, which is
  // the most recently opened connected repo.
  const active =
    library.workspaces.find((slice) => slice.workspace.id === activeId) ?? library.workspaces[0];

  // Memoised so the derived indexes below do not recompute on every render:
  // `active?.entries ?? []` is a fresh array each time.
  const entries = useMemo(() => active?.entries ?? [], [active]);

  const results = useMemo(
    () => queryIndex(entries, { query, folder, tag, sort }),
    [entries, query, folder, tag, sort],
  );

  const tags = useMemo(() => tagCounts(entries), [entries]);

  // Only the visible slice is rendered; every change to the filters resets it.
  const page = useMemo(() => results.slice(0, visible), [results, visible]);

  const recent = useMemo(
    () =>
      queryIndex(entries, { sort: "recent" })
        .filter((entry) => entry.updatedAt)
        .slice(0, 5),
    [entries],
  );

  const emptyMessage =
    entries.length === 0
      ? "Nothing here yet. Create your first note and it saves to this device instantly, and to GitHub as soon as a repository is connected."
      : "No notes match that search.";

  const editorHref = useCallback(
    (entry: IndexEntry) =>
      `/editor?ws=${encodeURIComponent(entry.workspaceId)}&note=${encodeURIComponent(entry.path)}`,
    [],
  );

  const selectWorkspace = useCallback((workspace: Workspace) => {
    setActiveId(workspace.id);
    setFolder(null);
    setTag(null);
    setQuery("");
    setVisible(PAGE_SIZE);
  }, []);

  const browseFolder = useCallback((next: string | null) => {
    setFolder(next);
    setVisible(PAGE_SIZE);
  }, []);

  const filterTag = useCallback((next: string | null) => {
    setTag(next);
    setVisible(PAGE_SIZE);
  }, []);

  const connect = useCallback(
    async (workspace: Workspace) => {
      await library.addWorkspace(workspace);
      selectWorkspace(workspace);
      setAddingRepo(false);
    },
    [library, selectWorkspace],
  );

  const newNote = useCallback(() => {
    if (!active) return;

    setPrompt({
      title: "New note",
      label: "Title",
      initialValue: "Untitled note",
      confirmLabel: "Create",
      body: `Created in ${active.workspace.name}${folder ? ` under ${folder}/` : ""}.`,
      onConfirm: async (value) => {
        const note = await library.createNote(
          value || "Untitled note",
          active.workspace,
          folder ?? "",
        );
        if (note) {
          router.push(
            `/editor?ws=${encodeURIComponent(note.workspaceId)}&note=${encodeURIComponent(note.path)}`,
          );
        }
      },
    });
  }, [active, folder, library, router]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  // ── Loading ─────────────────────────────────────────────────────────────
  // The library cannot be read while another tab holds the database, and an
  // empty dashboard would read as "you have no notes".
  if (library.storage === "blocked") return <StorageBlocked />;

  if (!library.ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--fl-bg)]">
        <ForkLeafLogo markClassName="h-8 w-8" textClassName="text-xl" />
        <p className="text-sm text-[var(--fl-muted)]" aria-busy="true">
          Reading your library…
        </p>
      </div>
    );
  }

  const firstRun = library.needsRepoChoice && !skippedChoice;

  return (
    <div className="min-h-screen bg-[var(--fl-bg)] font-sans text-[var(--fl-text)]">
      <Header
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={handleSignOut}
        githubAvailable={githubAvailable}
      />

      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8">
        {library.error && (
          <p
            role="alert"
            className="mb-6 rounded-lg border border-[var(--fl-danger)]/30 bg-[var(--fl-danger)]/8 px-4 py-3 text-sm text-[var(--fl-danger)]"
          >
            {library.error}
          </p>
        )}

        {/* ── Greeting ─────────────────────────────────────────────────── */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[2rem] font-semibold tracking-tight">
              {user ? `Welcome back, ${user.name?.split(" ")[0] ?? user.login}` : "Your notebook"}
            </h1>
            <p className="mt-1 text-[14.5px] text-[var(--fl-muted)]">
              {library.indexing
                ? `Reading your notes — ${library.totals.read.toLocaleString()} of ${library.totals.notes.toLocaleString()} so far. Counts and search fill in as this runs.`
                : describeLibrary(library.totals.notes, library.workspaces.length)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={newNote}
              disabled={!active}
              className="fl-btn fl-btn-primary !py-2.5 disabled:opacity-40"
            >
              New note
            </button>
            <Link href="/editor" className="fl-btn fl-btn-ghost !py-2.5">
              Open editor
            </Link>
          </div>
        </div>

        {/* ── First run: choose a repository ───────────────────────────── */}
        {firstRun && (
          <div className="mb-10">
            <RepoChooser firstRun onConnect={connect} onSkip={() => setSkippedChoice(true)} />
          </div>
        )}

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Notes" value={library.totals.notes.toLocaleString()} />
          {/* Word and diagram counts can only come from notes that have been
              read. Saying so is the difference between a number that is filling
              in and a number that appears to be changing on its own. */}
          <Stat
            label="Words"
            value={library.totals.words.toLocaleString()}
            hint={coverage(library.totals.read, library.totals.notes)}
          />
          <Stat
            label="Diagrams"
            value={library.totals.diagrams.toLocaleString()}
            hint={coverage(library.totals.read, library.totals.notes)}
          />
          <Stat
            label="Waiting to push"
            value={library.totals.pending.toLocaleString()}
            hint={library.totals.pending === 0 ? "Everything is pushed" : "Opens in the editor"}
          />
        </section>

        {/* ── Repositories ─────────────────────────────────────────────── */}
        <section className="mb-8">
          <SectionLabel>Repositories</SectionLabel>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {library.workspaces.map((slice) => {
              const selected = active?.workspace.id === slice.workspace.id;
              const words = slice.entries.reduce((total, entry) => total + entry.words, 0);

              return (
                <button
                  key={slice.workspace.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectWorkspace(slice.workspace)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selected
                      ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                      : "border-[var(--fl-border)] bg-[var(--fl-surface)] hover:border-[var(--fl-border-strong)]"
                  }`}
                >
                  <span className="mb-1 flex items-center gap-2">
                    <span className="truncate font-semibold text-[var(--fl-text)]">
                      {slice.workspace.name}
                    </span>
                    {slice.workspace.isLocal && (
                      <span className="shrink-0 rounded bg-[var(--fl-elevated)] px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-[var(--fl-muted)]">
                        this device
                      </span>
                    )}
                  </span>

                  <span className="block truncate font-mono text-[11.5px] text-[var(--fl-muted)]">
                    {slice.workspace.isLocal
                      ? "Not backed by a repository"
                      : `${slice.workspace.repo.owner}/${slice.workspace.repo.repo}@${slice.workspace.repo.branch}${
                          slice.workspace.repo.directory ? `/${slice.workspace.repo.directory}` : ""
                        }`}
                  </span>

                  <span className="mt-2 block text-[12.5px] text-[var(--fl-muted)]">
                    {slice.entries.length} note{slice.entries.length === 1 ? "" : "s"} ·{" "}
                    {words.toLocaleString()} words
                    {slice.pending > 0 && ` · ${slice.pending} waiting`}
                  </span>

                  {slice.error && (
                    <span className="mt-1.5 block text-[12px] text-[var(--fl-danger)]">
                      {slice.error}
                    </span>
                  )}
                </button>
              );
            })}

            {!firstRun && (
              <button
                type="button"
                onClick={() => setAddingRepo((value) => !value)}
                className="rounded-xl border border-dashed border-[var(--fl-border-strong)] p-4 text-left text-sm text-[var(--fl-muted)] transition hover:border-[var(--fl-accent)] hover:text-[var(--fl-text)]"
              >
                <span className="block font-semibold text-[var(--fl-text)]">
                  {addingRepo ? "Close" : "Connect a repository"}
                </span>
                <span className="mt-1 block text-[12.5px]">
                  Use another repo, or a project&rsquo;s docs folder.
                </span>
              </button>
            )}
          </div>

          {addingRepo && !firstRun && (
            <div className="mt-4">
              <RepoChooser onConnect={connect} />
            </div>
          )}
        </section>

        {/* ── Recent ───────────────────────────────────────────────────── */}
        {recent.length > 0 && (
          <section className="mb-8">
            <SectionLabel>Pick up where you left off</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((entry) => (
                <Link
                  key={entry.id}
                  href={editorHref(entry)}
                  className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4 transition hover:border-[var(--fl-border-strong)] hover:shadow-[var(--fl-shadow)]"
                >
                  <span className="block truncate font-medium text-[var(--fl-text)]">
                    {entry.title}
                  </span>
                  {entry.excerpt && (
                    <span className="mt-1 block line-clamp-2 text-[13px] leading-relaxed text-[var(--fl-muted)]">
                      {entry.excerpt}
                    </span>
                  )}
                  <span className="mt-2 block text-[12px] text-[var(--fl-muted)]">
                    {formatWhen(entry.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── The index ────────────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel className="!mb-0">
              {/* The on-device workspace is already named as a place, so
                  "all notes in On this device" would read twice over. */}
              {!active || active.workspace.isLocal
                ? "All notes on this device"
                : `All notes in ${active.workspace.name}`}
            </SectionLabel>

            <div className="flex flex-wrap items-center gap-2">
              <div
                role="tablist"
                aria-label="How to show the notes"
                className="flex shrink-0 rounded-lg border border-[var(--fl-border)] p-0.5"
              >
                {VIEWS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={view === option.value}
                    title={option.hint}
                    onClick={() => chooseView(option.value)}
                    className={`rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                      view === option.value
                        ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                        : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisible(PAGE_SIZE);
                }}
                placeholder="Search titles, tags, paths…"
                aria-label="Search notes"
                className="fl-input w-56"
              />
              <label className="sr-only" htmlFor="dashboard-sort">
                Sort notes
              </label>
              <select
                id="dashboard-sort"
                // The tree is ordered by the repository's own structure, so a
                // sort key would have nothing to act on.
                disabled={view === "tree"}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortKey);
                  setVisible(PAGE_SIZE);
                }}
                className="fl-input !py-2 text-sm"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <FolderNav
            entries={entries}
            folder={folder}
            onFolder={browseFolder}
            tags={tags}
            tag={tag}
            onTag={filterTag}
            showAllTags={showAllTags}
            onToggleTags={() => setShowAllTags((value) => !value)}
          />

          {view === "list" && (
            <NoteList entries={page} editorHref={editorHref} emptyMessage={emptyMessage} />
          )}

          {view === "grid" && (
            <NoteGrid entries={page} editorHref={editorHref} emptyMessage={emptyMessage} />
          )}

          {/* The tree draws every match rather than a page of them: a folder
              showing 3 of its 11 notes, with a "show 40 more" button below the
              whole tree, would be a lie about what is in the repository. */}
          {view === "tree" && (
            <NoteTree
              entries={results}
              editorHref={editorHref}
              emptyMessage={emptyMessage}
              expandAll={query.trim().length > 0 || tag !== null}
            />
          )}

          {view !== "tree" && results.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12.5px] text-[var(--fl-muted)]">
                Showing {page.length.toLocaleString()} of {results.length.toLocaleString()}
                {results.length === entries.length
                  ? ""
                  : ` matching note${results.length === 1 ? "" : "s"}`}
                {library.indexing ? " — still reading, so search will get better." : ""}
              </p>

              {page.length < results.length && (
                <button
                  type="button"
                  onClick={() => setVisible((count) => count + PAGE_SIZE)}
                  className="fl-btn fl-btn-ghost !py-1.5 !text-[13px]"
                >
                  Show {Math.min(PAGE_SIZE, results.length - page.length)} more
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {prompt && <PromptDialog request={prompt} onClose={() => setPrompt(null)} />}
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function Header({
  user,
  theme,
  onToggleTheme,
  onSignOut,
  githubAvailable,
}: {
  user: SessionUser | null;
  theme: string;
  onToggleTheme: () => void;
  onSignOut: () => void;
  githubAvailable: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--fl-border)] bg-[var(--fl-bg)]/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="text-[var(--fl-text)]">
          <ForkLeafLogo textClassName="text-[1.0625rem]" />
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>

          {user ? (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--fl-elevated)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={user.avatarUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-full"
                />
                <span className="hidden text-sm text-[var(--fl-text)] sm:inline">{user.login}</span>
              </Link>
              <button
                type="button"
                onClick={onSignOut}
                className="fl-btn fl-btn-ghost !py-2 !text-sm"
              >
                Sign out
              </button>
            </>
          ) : (
            githubAvailable && (
              <a href="/api/auth/github" className="fl-btn fl-btn-primary !py-2 !text-sm">
                Sign in with GitHub
              </a>
            )
          )}
        </div>
      </div>
    </header>
  );
}

function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)] ${className}`}
    >
      {children}
    </h2>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-4">
      <p className="text-2xl font-semibold tracking-tight text-[var(--fl-text)]">{value}</p>
      <p className="mt-0.5 text-[13px] text-[var(--fl-muted)]">{label}</p>
      {hint && <p className="mt-0.5 text-[11.5px] text-[var(--fl-muted)]">{hint}</p>}
    </div>
  );
}

/** "all 155 read" / "120 of 155 read" — never silent about what is missing. */
function coverage(read: number, total: number): string {
  if (total === 0) return "";
  if (total === 1) return read >= 1 ? "from the one note" : "from 0 of 1 note read so far";
  if (read >= total) return `from all ${total.toLocaleString()} notes`;
  return `from ${read.toLocaleString()} of ${total.toLocaleString()} notes read so far`;
}

function describeLibrary(notes: number, repositories: number): string {
  if (notes === 0) return "Nothing written yet — start with a note.";
  return `${notes.toLocaleString()} note${notes === 1 ? "" : "s"} across ${repositories} ${
    repositories === 1 ? "workspace" : "workspaces"
  }.`;
}
