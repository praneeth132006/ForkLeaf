"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * The hero's product demo: one window, cycling through what the editor does.
 *
 * A landing page gets a few seconds of attention pointed at one rectangle, and
 * a single still frame spends them making a single claim — here, "it edits
 * Markdown", which is the least surprising thing ForkLeaf does. The interesting
 * half is everything a visitor would otherwise have to take on faith: that the
 * links really resolve, that the search really runs offline, that the diagrams
 * really are Mermaid, that the history really is git. So the frame shows them,
 * one after another, and moves on by itself.
 *
 * It advances on its own but never traps anybody: hovering or focusing it stops
 * the clock, the tabs jump straight to a scene, and a visitor who has asked for
 * reduced motion gets no cycling at all — the tabs still work, the window still
 * fills, nothing moves unless they ask it to.
 *
 * Everything is drawn in markup rather than shipped as a screenshot: it
 * re-themes with the page, stays sharp at any zoom, costs nothing to download,
 * and cannot go stale in the way an exported PNG of a UI always does.
 */

const SCENES = [
  {
    id: "write",
    label: "Write",
    caption: "Rich text, split, or raw Markdown — the same file either way.",
    /** What the status bar says while this scene is up. */
    status: "All changes saved · 412 words",
  },
  {
    id: "link",
    label: "Link",
    caption: "[[Wikilinks]] and backlinks that quote the line they were written on.",
    status: "4 backlinks · 2 outgoing links",
  },
  {
    id: "search",
    label: "Search",
    caption: "Every word of every note, ranked and answered in your browser.",
    status: "Searched 128 notes offline · 9 ms",
  },
  {
    id: "diagram",
    label: "Diagram",
    caption: "Mermaid diagrams — drawn on a canvas, or typed with autocomplete.",
    status: "Saved as a ```mermaid block · renders on github.com too",
  },
  {
    id: "history",
    label: "History",
    caption: "Every version, read from your repository's own commit log.",
    status: "Reading history from GitHub · main",
  },
  {
    id: "share",
    label: "Share",
    caption: "Publish a page, or export to PDF, Word and HTML — all in the browser.",
    status: "Published to your repo · nothing on our servers",
  },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

/** How long each scene holds. Long enough to read the pane, not to wait on it. */
const HOLD_MS = 6000;

export function AppPreview() {
  const [index, setIndex] = useState(0);
  /**
   * Whether the cycle is currently running.
   *
   * Off while a pointer is over the frame or the keyboard is inside it — an
   * animation that changes what you are reading, while you are reading it, is
   * the reason auto-advancing carousels have the reputation they have.
   */
  const [running, setRunning] = useState(true);
  const [motion, setMotion] = useState(true);
  /**
   * Bumped on every change so the scene and its progress tick remount.
   *
   * The tick has to restart from zero when a tab is clicked, and CSS
   * animations do not restart on their own for an element that stayed put.
   */
  const [turn, setTurn] = useState(0);

  const scene = SCENES[index]!;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Somebody who has asked their system for less motion is asking for this
  // too: no cycling, no ticking bar, no caret. The tabs still work, so nothing
  // is out of reach — it just waits to be asked.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotion(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const go = useCallback((next: number) => {
    setIndex(((next % SCENES.length) + SCENES.length) % SCENES.length);
    setTurn((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!running || !motion) return;
    timer.current = setTimeout(() => go(index + 1), HOLD_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, running, motion, go]);

  return (
    <div
      onMouseEnter={() => setRunning(false)}
      onMouseLeave={() => setRunning(true)}
      onFocusCapture={() => setRunning(false)}
      onBlurCapture={() => setRunning(true)}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {/* Scrolls rather than wraps on a narrow screen: six labels wrapping to
            two rows turns the control into a paragraph. */}
        <div
          role="tablist"
          aria-label="What ForkLeaf does"
          className="fl-scrollbar-none -mx-1 flex max-w-full overflow-x-auto rounded-full border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1"
        >
          {SCENES.map((item, position) => {
            const selected = position === index;

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => go(position)}
                className={`relative shrink-0 overflow-hidden rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors ${
                  selected
                    ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                    : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                }`}
              >
                {item.label}

                {/* How long this scene has left, under the label it belongs to.
                    Without it an auto-advancing frame changes for no visible
                    reason, which reads as a glitch rather than as a demo. */}
                {selected && motion && running && (
                  <span
                    key={turn}
                    aria-hidden="true"
                    className="fl-tick absolute inset-x-0 bottom-0 h-[2px] bg-[var(--fl-accent-contrast)]/45"
                    style={{ animationDuration: `${HOLD_MS}ms` }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Keyed so the caption crossfades with the pane rather than swapping
            under it a frame early. */}
        <p
          key={`caption-${turn}`}
          className="fl-scene-in min-w-0 text-[13.5px] text-[var(--fl-muted)]"
        >
          {scene.caption}
        </p>
      </div>

      <Frame status={scene.status} scene={scene.id} turn={turn} motion={motion} />
    </div>
  );
}

/**
 * The window chrome.
 *
 * This used to be drawn in literal hex — a hand-kept copy of the dark palette —
 * so that it stayed dark on a light page and "read as a screenshot". What it
 * actually read as, next to the theme-aware window further down the page, was a
 * bug: one product shot in each colour scheme, on the same screen, in a product
 * whose own light mode this page is otherwise showing off. It follows the theme
 * now, like everything else here.
 *
 * The border is `--fl-border-strong` rather than `--fl-border` for the same
 * reason a picture gets a frame: this is the one element on the page that has
 * to hold its own edge against a full-bleed background, and the hairline used
 * for cards inside the page disappeared against it.
 */
function Frame({
  status,
  scene,
  turn,
  motion,
}: {
  status: string;
  scene: SceneId;
  turn: number;
  motion: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`The ForkLeaf editor: ${scene}`}
      className="overflow-hidden rounded-2xl border border-[var(--fl-border-strong)] bg-[var(--fl-surface)] text-[var(--fl-text)] shadow-[var(--fl-shadow-lg)] ring-1 ring-[var(--fl-border)]"
    >
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-[var(--fl-border)] bg-[var(--fl-elevated)] px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--fl-border-strong)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--fl-border-strong)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--fl-border-strong)]" />
        </span>

        <span className="mx-auto rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-1 font-mono text-[11px] text-[var(--fl-muted)]">
          notes · main
        </span>

        <span className="hidden items-center gap-1.5 text-[11px] text-[var(--fl-muted)] sm:flex">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--fl-accent)]" />
          Synced
        </span>
      </div>

      {/* One fixed height for every scene: a frame that resized as it cycled
          would push the rest of the page up and down on a timer. */}
      <div className="flex h-[380px] sm:h-[420px]">
        <aside
          aria-hidden="true"
          className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-[var(--fl-border)] p-3 sm:flex"
        >
          <div className="mb-2 truncate rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2.5 py-1.5 text-[11px] text-[var(--fl-muted)]">
            {scene === "search" ? "atomic commit" : "Search notes…"}
          </div>
          <TreeRow depth={0} label="architecture" folder />
          <TreeRow depth={1} label="sync-engine.md" active={scene !== "link"} />
          <TreeRow depth={1} label="storage.md" />
          <TreeRow depth={0} label="meetings" folder />
          <TreeRow depth={1} label="2026-08-14.md" active={scene === "link"} />
          <TreeRow depth={0} label="reading-list.md" />
          <TreeRow depth={0} label="README.md" />
        </aside>

        {/* `overflow-hidden` is load-bearing, not tidiness: the frame's height is
            fixed so the page does not jump as scenes change, and a pane that
            wraps taller than that on a narrow screen was painting straight over
            the status bar underneath it. */}
        <div key={turn} className={`min-w-0 flex-1 overflow-hidden ${motion ? "fl-scene-in" : ""}`}>
          {scene === "write" && <WritePane motion={motion} />}
          {scene === "link" && <LinkPane />}
          {scene === "search" && <SearchPane />}
          {scene === "diagram" && <DiagramPane />}
          {scene === "history" && <HistoryPane />}
          {scene === "share" && <SharePane />}
        </div>
      </div>

      {/* Status bar. It says something different per scene, because in the real
          app it does too — this is the strip that answers "where is my work". */}
      <div className="flex items-center gap-3 border-t border-[var(--fl-border)] bg-[var(--fl-elevated)] px-4 py-2 text-[11px] text-[var(--fl-muted)]">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
          />
          <span key={turn} className={`truncate ${motion ? "fl-scene-in" : ""}`}>
            {status}
          </span>
        </span>
        <span className="ml-auto hidden shrink-0 font-mono md:inline">
          architecture/sync-engine.md
        </span>
      </div>
    </div>
  );
}

/* ── Scenes ───────────────────────────────────────────────────────────────── */

function WritePane({ motion }: { motion: boolean }) {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="hidden min-w-0 flex-1 flex-col border-r border-[var(--fl-border)] p-5 font-mono text-[12.5px] leading-relaxed md:flex">
        <PaneLabel>Source</PaneLabel>
        <pre className="whitespace-pre-wrap text-[var(--fl-muted)]">
          <span className="font-semibold text-[var(--fl-accent)]"># Sync engine</span>
          {"\n\n"}
          Writes land in IndexedDB first, then{"\n"}
          drain to GitHub as one{" "}
          <span className="font-semibold text-[var(--fl-text)]">**atomic commit**</span>.{"\n\n"}
          <span className="font-semibold text-[var(--fl-accent)]">## Guarantees</span>
          {"\n\n"}- Nothing is lost when the tab closes{"\n"}- Offline edits queue and replay{"\n"}-
          Conflicts are shown, never merged
          {motion && (
            <span
              aria-hidden="true"
              className="fl-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-[var(--fl-accent)]"
            />
          )}
        </pre>
      </div>

      <div className="min-w-0 flex-1 p-5 sm:p-6">
        <PaneLabel>Preview</PaneLabel>
        <h3 className="mb-3 text-2xl font-semibold tracking-tight text-[var(--fl-text)]">
          Sync engine
        </h3>
        <p className="mb-5 text-[15px] leading-relaxed text-[var(--fl-muted)]">
          Writes land in IndexedDB first, then drain to GitHub as one{" "}
          <strong className="font-semibold text-[var(--fl-text)]">atomic commit</strong>.
        </p>
        <h4 className="mb-2 text-[15px] font-semibold tracking-tight text-[var(--fl-text)]">
          Guarantees
        </h4>
        <ul className="space-y-1.5 text-[14px] text-[var(--fl-muted)]">
          {[
            "Nothing is lost when the tab closes",
            "Offline edits queue and replay",
            "Conflicts are shown, never merged",
          ].map((item, row) => (
            <Row key={item} row={row} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[var(--fl-accent)]"
              />
              {item}
            </Row>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Links and backlinks: the thing that makes a folder of files a notebook. */
function LinkPane() {
  const backlinks = [
    { note: "architecture/sync-engine.md", line: "Blocked on [[Storage layout]] landing first." },
    { note: "reading-list.md", line: "Re-read [[Storage layout]] before the review." },
    { note: "meetings/2026-08-07.md", line: "Agreed to fold [[Storage layout]] into v1." },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      <div className="hidden min-w-0 flex-1 flex-col border-r border-[var(--fl-border)] p-5 sm:p-6 md:flex">
        <PaneLabel>2026-08-14.md</PaneLabel>
        <p className="text-[14.5px] leading-[1.75] text-[var(--fl-muted)]">
          Storage is settled — see <WikiLink>Storage layout</WikiLink> for the shape we agreed. The
          queue work depends on it, so <WikiLink>Sync engine</WikiLink> moves after it, and{" "}
          <WikiLink pending>Offline queue v2</WikiLink> is not written yet.
        </p>

        <p className="mt-4 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
          A dotted link is a note that does not exist. Clicking it writes the file.
        </p>
      </div>

      <div className="min-w-0 flex-1 p-5 sm:p-6">
        <PaneLabel>Backlinks · Storage layout</PaneLabel>
        <ul className="space-y-2">
          {backlinks.map((item, row) => (
            <Row
              key={item.note}
              row={row}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3.5 py-2.5"
            >
              <p className="truncate font-mono text-[11px] text-[var(--fl-muted)]">{item.note}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--fl-text)]">{item.line}</p>
            </Row>
          ))}
        </ul>
        <p className="mt-4 hidden text-[12.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
          Every mention, quoted at the line it was written on — so you can see why a note was
          linked, not just that it was.
        </p>
      </div>
    </div>
  );
}

/** Search: BM25 over every note, in the browser, with no server involved. */
function SearchPane() {
  const results = [
    {
      note: "architecture/sync-engine.md",
      line: "drain to GitHub as one atomic commit.",
      score: "BM25 8.4",
    },
    {
      note: "meetings/2026-08-14.md",
      line: "One atomic commit per burst, not per keystroke.",
      score: "BM25 6.1",
    },
    {
      note: "architecture/storage.md",
      line: "The queue replays until the commit lands.",
      score: "BM25 3.7",
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden p-5 sm:p-6">
      <PaneLabel>Search · 128 notes</PaneLabel>

      <div className="flex items-center gap-2 rounded-lg border border-[var(--fl-border-strong)] bg-[var(--fl-elevated)] px-3.5 py-2.5">
        <span aria-hidden="true" className="text-[13px] text-[var(--fl-muted)]">
          ⌘K
        </span>
        <span className="font-mono text-[13px] text-[var(--fl-text)]">atomic commit</span>
        <span className="fl-caret inline-block h-[1.05em] w-[2px] bg-[var(--fl-accent)]" />
        <span className="ml-auto text-[11.5px] text-[var(--fl-muted)]">3 results · 9 ms</span>
      </div>

      <ul className="mt-3 space-y-2">
        {results.map((result, row) => (
          <Row
            key={result.note}
            row={row}
            className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3.5 py-2.5"
          >
            <div className="flex items-baseline gap-3">
              <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--fl-muted)]">
                {result.note}
              </p>
              <p className="shrink-0 font-mono text-[10.5px] text-[var(--fl-muted)]">
                {result.score}
              </p>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--fl-text)]">{result.line}</p>
          </Row>
        ))}
      </ul>

      <p className="mt-auto hidden pt-5 text-[12.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        The index lives in your browser, so search keeps working on a plane — and no query ever
        leaves the machine you typed it on.
      </p>
    </div>
  );
}

function DiagramPane() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="hidden min-w-0 flex-1 flex-col border-r border-[var(--fl-border)] p-5 font-mono text-[12.5px] leading-relaxed md:flex">
        <PaneLabel>Source</PaneLabel>
        <pre className="whitespace-pre-wrap text-[var(--fl-muted)]">
          <span className="text-[var(--fl-border-strong)]">```mermaid</span>
          {"\n"}
          flowchart LR{"\n"}
          {"  "}A[Keystroke] --&gt; B[(IndexedDB)]{"\n"}
          {"  "}B --&gt; C{"{"}Online?{"}"}
          {"\n"}
          {"  "}C --&gt;|yes| D[Commit]{"\n"}
          {"  "}C --&gt;|no| B{"\n"}
          <span className="text-[var(--fl-border-strong)]">```</span>
        </pre>
        <p className="mt-4 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 text-[11px] leading-relaxed text-[var(--fl-muted)]">
          Or drag it on a canvas — the source is written for you, and node positions survive the
          round trip.
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
        <PaneLabel>Rendered</PaneLabel>
        <div className="flex flex-1 items-center justify-center">
          <Flowchart />
        </div>
      </div>
    </div>
  );
}

function HistoryPane() {
  const commits = [
    { msg: "Add conflict resolution notes", sha: "a3f9c21", when: "2 minutes ago", now: true },
    { msg: "Update 3 notes", sha: "7b21e08", when: "1 hour ago", now: false },
    { msg: "Rename reading.md to reading-list.md", sha: "1c94ffa", when: "yesterday", now: false },
    { msg: "Initial commit", sha: "0f2a1de", when: "3 days ago", now: false },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden p-5 sm:p-6">
      <PaneLabel>Version history</PaneLabel>

      <ol className="space-y-1.5">
        {commits.map((commit, row) => (
          <Row
            key={commit.sha}
            row={row}
            className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 ${
              commit.now
                ? "border-[var(--fl-accent)]/40 bg-[var(--fl-accent-soft)]"
                : "border-[var(--fl-border)] bg-[var(--fl-elevated)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                commit.now ? "bg-[var(--fl-accent)]" : "bg-[var(--fl-border-strong)]"
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--fl-text)]">
              {commit.msg}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-[var(--fl-muted)]">
              {commit.sha}
            </span>
            <span className="hidden shrink-0 text-[11.5px] text-[var(--fl-muted)] sm:inline">
              {commit.when}
            </span>
          </Row>
        ))}
      </ol>

      <p className="mt-auto hidden pt-5 text-[12.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        Read straight from the repository&rsquo;s own log — open any version, compare two, or
        restore one. Clone it, revert it, or walk away with all of it: there is no export step,
        because there was never an import step.
      </p>
    </div>
  );
}

function SharePane() {
  const exports = ["PDF", "Word", "HTML", "Markdown", "Plain text", "JSON"];

  return (
    <div className="flex h-full flex-col overflow-hidden p-5 sm:p-6">
      <PaneLabel>Share this note</PaneLabel>

      <div className="rounded-lg border border-[var(--fl-border-strong)] bg-[var(--fl-elevated)] p-4">
        <p className="text-[13.5px] font-semibold text-[var(--fl-text)]">Published page</p>
        <p className="mt-1 font-mono text-[12px] text-[var(--fl-accent)]">
          yourname.github.io/notes/sync-engine
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
          One self-contained file, committed to <span className="font-mono">docs/</span> in your own
          repository and served by GitHub Pages. Unpublishing is a deleted file.
        </p>
      </div>

      <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
        Or export it
      </p>
      <ul className="grid grid-cols-3 gap-2">
        {exports.map((format, row) => (
          <Row
            key={format}
            row={row}
            className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2.5 text-center text-[12.5px] text-[var(--fl-text)]"
          >
            {format}
          </Row>
        ))}
      </ul>

      <p className="mt-auto hidden pt-5 text-[12.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        Rendered in the browser, diagrams included — the note never leaves your machine in order to
        become a file.
      </p>
    </div>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/**
 * A row that arrives just after the pane it is in.
 *
 * The stagger is small on purpose: enough to lead the eye down the list, not
 * enough that the last row is still arriving when somebody has read it.
 */
function Row({
  row,
  className = "",
  children,
}: {
  row: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <li className={`fl-row-in ${className}`} style={{ animationDelay: `${120 + row * 70}ms` }}>
      {children}
    </li>
  );
}

function WikiLink({ children, pending = false }: { children: React.ReactNode; pending?: boolean }) {
  return pending ? (
    <span className="rounded border-b border-dashed border-[var(--fl-muted)] px-0.5 text-[var(--fl-muted)]">
      [[{children}]]
    </span>
  ) : (
    <span className="rounded bg-[var(--fl-accent-soft)] px-1 text-[var(--fl-accent)]">
      [[{children}]]
    </span>
  );
}

function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
      {children}
    </p>
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
      className={`flex items-center gap-1.5 rounded-md py-1 pr-2 text-[12.5px] transition-colors ${
        active ? "bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"
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
function Flowchart() {
  return (
    <svg
      viewBox="0 0 420 110"
      className="w-full max-w-md"
      aria-hidden="true"
      fill="none"
      fontFamily="var(--font-mono)"
      fontSize="10"
    >
      <defs>
        <marker
          id="fl-hero-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0 8 4 0 8Z" fill="var(--fl-border-strong)" />
        </marker>
      </defs>

      <g stroke="var(--fl-border-strong)" strokeWidth="1">
        <path d="M92 34h26" markerEnd="url(#fl-hero-arrow)" />
        <path d="M196 34h26" markerEnd="url(#fl-hero-arrow)" />
        <path d="M300 34h26" markerEnd="url(#fl-hero-arrow)" />
        <path d="M262 52v26H154v-26" markerEnd="url(#fl-hero-arrow)" />
      </g>

      <Node x={10} y={20} w={82} label="Keystroke" />
      <Node x={118} y={20} w={78} label="IndexedDB" accent />
      <Node x={222} y={20} w={78} label="Online?" />
      <Node x={326} y={20} w={84} label="Commit" accent />

      <text x="203" y="74" fill="var(--fl-muted)">
        no
      </text>
      <text x="306" y="28" fill="var(--fl-muted)">
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
        fill={accent ? "var(--fl-accent-soft)" : "var(--fl-elevated)"}
        stroke={accent ? "var(--fl-accent)" : "var(--fl-border-strong)"}
      />
      <text
        x={x + w / 2}
        y={y + 18}
        textAnchor="middle"
        fill={accent ? "var(--fl-accent)" : "var(--fl-muted)"}
      >
        {label}
      </text>
    </g>
  );
}
