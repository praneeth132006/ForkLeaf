"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * The hero's product demo: the editor itself, cycling through what it does.
 *
 * Two rules govern everything here.
 *
 * **It is the real editor, not an illustration of one.** The same sidebar, the
 * same tab strip and Rich/Split/Source control, the same right-hand panel, the
 * same status bar in the same order — down to the wording, because a landing
 * page whose product shot is a prettier invention teaches the visitor a screen
 * that does not exist, and the first thing they meet after signing in is the
 * gap between the two. Anything drawn here can be found in `EditorWorkspace`,
 * `EditorSidebar`, `EditorRightPanel` and `EditorStatusBar`.
 *
 * **It shows the things nobody would guess.** A still frame of a Markdown
 * editor makes one claim, and it is the least surprising one available. What a
 * reader cannot know without being shown is that links have a hover card, that
 * prose has blame, that a code block runs and commits its output, that a note
 * can be reviewed as a pull request, that a note will tell you when it has gone
 * off, that a citation gets archived. So those are the scenes.
 *
 * It advances on its own and never traps anybody: hover or keyboard focus stops
 * the clock, the tabs jump straight to a scene, and reduced motion turns the
 * cycling off entirely while leaving every scene reachable.
 */

const SCENES = [
  {
    id: "write",
    label: "Write",
    caption: "Rich text, split, or raw Markdown — the same file either way.",
    status: "All changes saved just now",
  },
  {
    id: "links",
    label: "Links",
    caption: "Hover a [[link]] to see where it goes before you follow it.",
    status: "All changes saved · 4 backlinks",
  },
  {
    id: "blame",
    label: "Blame",
    caption: "Blame for prose: when each paragraph was written, and by whom.",
    status: "Reading history from GitHub · main",
  },
  {
    id: "run",
    label: "Run",
    caption: "Run a code block. The output is committed back into the note.",
    status: "Ran in a throwaway VM · output committed",
  },
  {
    id: "review",
    label: "Review",
    caption: "Review a note as a pull request, where the note reads.",
    status: "Pull request #42 · 2 comments",
  },
  {
    id: "fresh",
    label: "Freshness",
    caption: "Which notes have gone off, and why it thinks so.",
    status: "3 notes worth re-reading",
  },
  {
    id: "capture",
    label: "Capture",
    caption: "Cite a page and keep an archived copy of it, for later.",
    status: "Archived copy found · web.archive.org",
  },
  {
    id: "search",
    label: "Search",
    caption: "Every word of every note, ranked, answered in your browser.",
    status: "Searched 128 notes offline · 9 ms",
  },
  {
    id: "diagram",
    label: "Diagram",
    caption: "Mermaid diagrams — drawn on a canvas, or typed with autocomplete.",
    status: "Saved as a ```mermaid block · renders on github.com too",
  },
  {
    id: "publish",
    label: "Publish",
    caption: "Publish one note as a page, or export the lot.",
    status: "Published to your repo · nothing on our servers",
  },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

/** How long each scene holds. Long enough to read the pane, not to wait on it. */
const HOLD_MS = 5500;

export function AppPreview() {
  const [index, setIndex] = useState(0);
  /**
   * Whether the cycle is running.
   *
   * Off while a pointer is over the frame or the keyboard is inside it — a
   * demo that changes what you are reading, while you are reading it, is the
   * reason auto-advancing carousels have the reputation they have.
   */
  const [running, setRunning] = useState(true);
  const [motion, setMotion] = useState(true);
  /** Bumped on every change so the scene and its progress tick remount. */
  const [turn, setTurn] = useState(0);

  const scene = SCENES[index]!;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        {/* Scrolls rather than wraps: ten labels on two rows turn a segmented
            control into a paragraph. */}
        <div
          role="tablist"
          aria-label="What ForkLeaf does"
          className="fl-scrollbar-none flex max-w-full overflow-x-auto rounded-full border border-[var(--fl-border)] bg-[var(--fl-surface)] p-1"
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
                className={`relative shrink-0 overflow-hidden rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  selected
                    ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                    : "text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
                }`}
              >
                {item.label}

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

        <p
          key={`caption-${turn}`}
          className="fl-scene-in min-w-0 text-[13.5px] text-[var(--fl-muted)]"
        >
          {scene.caption}
        </p>
      </div>

      <Frame scene={scene.id} status={scene.status} turn={turn} motion={motion} />
    </div>
  );
}

/* ── The application shell ────────────────────────────────────────────────── */

function Frame({
  scene,
  status,
  turn,
  motion,
}: {
  scene: SceneId;
  status: string;
  turn: number;
  motion: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`The ForkLeaf editor: ${scene}`}
      className="overflow-hidden rounded-2xl border border-[var(--fl-border-strong)] bg-[var(--fl-surface)] text-[var(--fl-text)] shadow-[var(--fl-shadow-lg)] ring-1 ring-[var(--fl-border)]"
    >
      {/* Height is fixed so the page cannot jump on a timer, and the panes clip
          rather than paint over the status bar when they wrap on a narrow
          screen. */}
      <div className="flex h-[430px] sm:h-[480px]">
        <Sidebar scene={scene} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TabStrip scene={scene} />

          <div
            key={turn}
            className={`relative min-h-0 flex-1 overflow-hidden ${motion ? "fl-scene-in" : ""}`}
          >
            {scene === "write" && <WritePane motion={motion} />}
            {scene === "links" && <LinksPane />}
            {scene === "blame" && <BlamePane />}
            {scene === "run" && <RunPane />}
            {scene === "review" && <ReviewPane />}
            {scene === "fresh" && <FreshPane />}
            {scene === "capture" && <CapturePane />}
            {scene === "search" && <SearchPane motion={motion} />}
            {scene === "diagram" && <DiagramPane />}
            {scene === "publish" && <PublishPane />}
          </div>
        </div>

        <RightPanel scene={scene} turn={turn} motion={motion} />
      </div>

      <StatusBar status={status} turn={turn} motion={motion} />
    </div>
  );
}

/** The sidebar, in the order the real one puts things. */
function Sidebar({ scene }: { scene: SceneId }) {
  return (
    <aside
      aria-hidden="true"
      className="hidden w-56 shrink-0 flex-col border-r border-[var(--fl-border)] sm:flex"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--fl-accent-soft)] text-[10px] font-semibold text-[var(--fl-accent)]">
          ⑂
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold text-[var(--fl-text)]">
            notes
          </span>
          <span className="block truncate text-[10.5px] text-[var(--fl-muted)]">
            praneeth132006 · main
          </span>
        </span>
        <span className="ml-auto text-[10px] text-[var(--fl-muted)]">⌄</span>
      </div>

      <div className="px-3">
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--fl-accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--fl-accent-contrast)]">
          + New Note
        </div>
        <div className="mt-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2.5 py-1.5 text-[11px] text-[var(--fl-muted)]">
          Filter by filename…
        </div>
      </div>

      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
        Notes
      </p>

      <div className="min-h-0 flex-1 px-2">
        <TreeRow depth={0} label="architecture" folder />
        <TreeRow depth={1} label="sync-engine.md" active={scene !== "links"} />
        <TreeRow depth={1} label="storage.md" />
        <TreeRow depth={0} label="meetings" folder />
        <TreeRow depth={1} label="2026-08-14.md" active={scene === "links"} />
        <TreeRow depth={0} label="deploy-runbook.md" stale={scene === "fresh"} />
        <TreeRow depth={0} label="reading-list.md" />
        <TreeRow depth={0} label="README.md" />
      </div>

      <div className="space-y-1 border-t border-[var(--fl-border)] px-3 py-2 text-[11.5px] text-[var(--fl-muted)]">
        <p>Dashboard</p>
        <p>Help &amp; shortcuts</p>
      </div>
    </aside>
  );
}

/** The tab strip: open notes, the view control, search, and the panel toggles. */
function TabStrip({ scene }: { scene: SceneId }) {
  const modes = ["Rich", "Split", "Source"] as const;
  const active =
    scene === "write" || scene === "diagram" ? "Split" : scene === "run" ? "Source" : "Rich";

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--fl-border)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2 py-1 text-[11.5px]">
        <span aria-hidden="true" className="text-[var(--fl-muted)]">
          ▤
        </span>
        <span className="max-w-[7rem] truncate text-[var(--fl-text)]">
          {scene === "links" ? "2026-08-14" : "Sync engine"}
        </span>
        <span aria-hidden="true" className="text-[var(--fl-muted)]">
          ×
        </span>
      </div>

      <div className="hidden rounded-md bg-[var(--fl-elevated)] p-0.5 md:flex">
        {modes.map((mode) => (
          <span
            key={mode}
            className={`rounded px-2 py-0.5 text-[11.5px] font-medium ${
              mode === active
                ? "bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                : "text-[var(--fl-muted)]"
            }`}
          >
            {mode}
          </span>
        ))}
      </div>

      <div className="ml-auto hidden items-center gap-1.5 rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2 py-1 text-[11px] text-[var(--fl-muted)] sm:flex">
        <span aria-hidden="true">⌕</span> Search
        <span className="rounded bg-[var(--fl-surface)] px-1 font-mono text-[10px]">⌘K</span>
      </div>

      <span className="hidden items-center gap-2 pl-1 text-[12px] text-[var(--fl-muted)] lg:flex">
        {/* The lock is the reading-mode control: it is on when the scene is one
            you would be reading rather than writing. */}
        <span className={scene === "links" || scene === "blame" ? "text-[var(--fl-accent)]" : ""}>
          ⌸
        </span>
        <span>?</span>
        <span>◐</span>
        <span>▥</span>
      </span>
    </div>
  );
}

/** The status bar, in the real order: state, repo, branch, sync mode, file. */
function StatusBar({ status, turn, motion }: { status: string; turn: number; motion: boolean }) {
  return (
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

      <span className="hidden shrink-0 sm:inline">praneeth132006/notes</span>
      <span className="hidden shrink-0 font-mono md:inline">⑂ main</span>
      <span className="hidden shrink-0 lg:inline">Sync: automatic</span>
      <span className="hidden shrink-0 lg:inline">Propose changes…</span>

      <span className="ml-auto hidden shrink-0 items-center gap-3 xl:flex">
        <span>UTF-8</span>
        <span>LF</span>
        <span>Markdown</span>
        <span className="tabular-nums">412 words</span>
      </span>
    </div>
  );
}

/* ── The right-hand panel, whose contents are half the demo ───────────────── */

function RightPanel({ scene, turn, motion }: { scene: SceneId; turn: number; motion: boolean }) {
  return (
    <aside
      aria-hidden="true"
      key={turn}
      className={`hidden w-60 shrink-0 flex-col overflow-hidden border-l border-[var(--fl-border)] lg:flex ${
        motion ? "fl-scene-in" : ""
      }`}
    >
      <div className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-2 text-[11.5px] text-[var(--fl-muted)]">
        <span className="text-[var(--fl-accent)]">✓</span> Auto-save ON
        <span className="ml-auto">›</span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
        {scene === "links" && <PanelBacklinks />}
        {scene === "blame" && <PanelBlame />}
        {scene === "review" && <PanelReview />}
        {scene === "fresh" && <PanelFreshness />}
        {scene === "publish" && <PanelExport />}
        {(scene === "write" ||
          scene === "run" ||
          scene === "capture" ||
          scene === "search" ||
          scene === "diagram") && <PanelDocument />}
      </div>
    </aside>
  );
}

function PanelDocument() {
  return (
    <>
      <PanelLabel>Document</PanelLabel>
      <p className="mb-1 text-[11px] text-[var(--fl-muted)]">Title</p>
      <div className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2.5 py-1.5 text-[12px] text-[var(--fl-text)]">
        Sync engine
      </div>

      <PanelLabel className="mt-4">Stats</PanelLabel>
      <dl className="space-y-1 text-[11.5px]">
        {[
          ["Words", "412"],
          ["Read time", "2 min"],
          ["Headings", "4"],
          ["Code blocks", "1"],
          ["Links", "3"],
        ].map(([term, value]) => (
          <div key={term} className="flex justify-between">
            <dt className="text-[var(--fl-muted)]">{term}</dt>
            <dd className="tabular-nums text-[var(--fl-text)]">{value}</dd>
          </div>
        ))}
      </dl>

      <PanelLabel className="mt-4">Outline</PanelLabel>
      <p className="text-[11.5px] text-[var(--fl-muted)]">· Sync engine</p>
      <p className="pl-3 text-[11.5px] text-[var(--fl-muted)]">· Guarantees</p>
    </>
  );
}

function PanelBacklinks() {
  return (
    <>
      <PanelLabel>Links</PanelLabel>
      <p className="mb-2 text-[11px] text-[var(--fl-muted)]">4 notes link here</p>
      {[
        ["architecture/sync-engine.md", "Blocked on [[Storage layout]]…"],
        ["reading-list.md", "Re-read [[Storage layout]] before…"],
        ["meetings/2026-08-07.md", "Agreed to fold it into v1."],
      ].map(([note, line], row) => (
        <Row key={note} row={row} className="mb-2 last:mb-0">
          <p className="truncate font-mono text-[10.5px] text-[var(--fl-muted)]">{note}</p>
          <p className="truncate text-[11.5px] text-[var(--fl-text)]">{line}</p>
        </Row>
      ))}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--fl-muted)]">
        Quoted at the line it was written on.
      </p>
    </>
  );
}

function PanelBlame() {
  return (
    <>
      <PanelLabel>Who wrote this</PanelLabel>
      {[
        ["you", "a3f9c21", "2 days ago"],
        ["priya", "7b21e08", "last month"],
        ["you", "0f2a1de", "3 months ago"],
      ].map(([who, sha, when], row) => (
        <Row
          key={sha}
          row={row}
          className="mb-1.5 rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2.5 py-1.5"
        >
          <p className="text-[11.5px] text-[var(--fl-accent)]">{who}</p>
          <p className="flex justify-between font-mono text-[10.5px] text-[var(--fl-muted)]">
            <span>{sha}</span>
            <span>{when}</span>
          </p>
        </Row>
      ))}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--fl-muted)]">
        Paragraph by paragraph, from the repository&rsquo;s own log.
      </p>
    </>
  );
}

function PanelReview() {
  return (
    <>
      <PanelLabel>Review · #42</PanelLabel>
      {[
        ["priya", "Is eight hours right? The docs say four."],
        ["sam", "Add the offline case here."],
      ].map(([who, said], row) => (
        <Row
          key={who}
          row={row}
          className="mb-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2.5 py-2"
        >
          <p className="text-[11px] font-semibold text-[var(--fl-accent)]">{who}</p>
          <p className="text-[11.5px] leading-snug text-[var(--fl-text)]">{said}</p>
        </Row>
      ))}
      <div className="mt-2 rounded-md border border-[var(--fl-accent)] px-2.5 py-1.5 text-center text-[11.5px] font-semibold text-[var(--fl-accent)]">
        Approve
      </div>
    </>
  );
}

function PanelFreshness() {
  return (
    <>
      <PanelLabel>Freshness</PanelLabel>
      <div className="rounded-lg border border-[var(--fl-accent)] bg-[var(--fl-accent-soft)] px-2.5 py-2">
        <p className="text-[11.5px] font-semibold text-[var(--fl-text)]">Worth re-reading</p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--fl-muted)]">
          Names v14 · untouched for 8 months · the file it links to moved on in June.
        </p>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--fl-muted)]">
        It never says a note is wrong. It says why it might be, so you can disagree at a glance.
      </p>
    </>
  );
}

function PanelExport() {
  return (
    <>
      <PanelLabel>Actions</PanelLabel>
      {["Copy Markdown", "Export HTML", "Export PDF"].map((action, row) => (
        <Row
          key={action}
          row={row}
          className="mb-1.5 rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2.5 py-1.5 text-center text-[11.5px] text-[var(--fl-text)]"
        >
          {action}
        </Row>
      ))}
      <p className="mt-2 text-[11px] text-[var(--fl-muted)]">More formats and options…</p>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--fl-muted)]">
        Word, plain text and JSON too — all rendered here, in your browser.
      </p>
    </>
  );
}

/* ── Scenes ───────────────────────────────────────────────────────────────── */

function WritePane({ motion }: { motion: boolean }) {
  return (
    <div className="flex h-full">
      <div className="hidden min-w-0 flex-1 flex-col border-r border-[var(--fl-border)] p-4 font-mono text-[12px] leading-relaxed md:flex">
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

      <div className="min-w-0 flex-1 p-5">
        <PaneLabel>Preview</PaneLabel>
        <h3 className="mb-2.5 text-xl font-semibold tracking-tight text-[var(--fl-text)]">
          Sync engine
        </h3>
        <p className="mb-4 text-[14px] leading-relaxed text-[var(--fl-muted)]">
          Writes land in IndexedDB first, then drain to GitHub as one{" "}
          <strong className="font-semibold text-[var(--fl-text)]">atomic commit</strong>.
        </p>
        <h4 className="mb-2 text-[14px] font-semibold tracking-tight text-[var(--fl-text)]">
          Guarantees
        </h4>
        <ul className="space-y-1.5 text-[13px] text-[var(--fl-muted)]">
          {[
            "Nothing is lost when the tab closes",
            "Offline edits queue and replay",
            "Conflicts are shown, never merged",
          ].map((item, row) => (
            <Row key={item} row={row} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-[var(--fl-accent)]"
              />
              {item}
            </Row>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The hover card, which is the thing you cannot know about until you see it. */
function LinksPane() {
  return (
    <div className="relative h-full p-5">
      <PaneLabel>meetings/2026-08-14.md</PaneLabel>
      <p className="max-w-lg text-[14px] leading-[1.9] text-[var(--fl-muted)]">
        Storage is settled — see{" "}
        <span className="rounded bg-[var(--fl-accent-soft)] px-1 text-[var(--fl-accent)] underline decoration-dotted underline-offset-4">
          [[Storage layout]]
        </span>{" "}
        for the shape we agreed. The queue work depends on it, so{" "}
        <span className="rounded bg-[var(--fl-accent-soft)] px-1 text-[var(--fl-accent)]">
          [[Sync engine]]
        </span>{" "}
        moves after it, and{" "}
        <span className="rounded border-b border-dashed border-[var(--fl-muted)] px-0.5">
          [[Offline queue v2]]
        </span>{" "}
        is not written yet.
      </p>

      {/* Anchored under the first link, the way the real card sits under the
          word it describes. */}
      <div className="fl-row-in absolute left-6 top-[7.5rem] w-[19rem] rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3 shadow-[var(--fl-shadow-lg)]">
        <p className="truncate text-[10.5px] uppercase tracking-wide text-[var(--fl-muted)]">
          architecture/storage.md
        </p>
        <p className="mt-1 text-[13px] font-medium leading-snug text-[var(--fl-text)]">
          Storage layout
        </p>
        <p className="mt-1 line-clamp-3 text-[11.5px] leading-snug text-[var(--fl-muted)]">
          One folder per topic, one file per note, and the front matter carries everything the app
          would otherwise need a database for.
        </p>
        <p className="mt-2 border-t border-[var(--fl-border)] pt-2 text-[10.5px] text-[var(--fl-muted)]">
          Click to open · ⌘ click for a new tab
        </p>
      </div>

      <p className="absolute bottom-4 left-5 right-5 hidden text-[11.5px] text-[var(--fl-muted)] sm:block">
        A dotted link is a note that does not exist yet. Clicking it writes the file.
      </p>
    </div>
  );
}

/** Blame for prose: the gutter the real reading view puts beside a paragraph. */
function BlamePane() {
  const paragraphs = [
    {
      who: "you",
      when: "2 days ago",
      text: "Writes land in IndexedDB first, then drain to GitHub as one atomic commit.",
      mine: true,
    },
    {
      who: "priya",
      when: "last month",
      text: "Rapid edits coalesce, so the history is one commit per burst rather than one per keystroke.",
      mine: false,
    },
    {
      who: "you",
      when: "3 months ago",
      text: "Conflicts are shown, never merged — you pick the version that survives.",
      mine: true,
    },
  ];

  return (
    <div className="h-full p-5">
      <PaneLabel>Sync engine · blame</PaneLabel>
      <div className="space-y-3">
        {paragraphs.map((paragraph, row) => (
          <Row key={paragraph.text} row={row} className="flex gap-3">
            <span
              className={`w-20 shrink-0 border-l-2 pl-2 text-[10.5px] leading-tight ${
                paragraph.mine
                  ? "border-[var(--fl-accent)] text-[var(--fl-accent)]"
                  : "border-[var(--fl-border-strong)] text-[var(--fl-muted)]"
              }`}
            >
              {paragraph.who}
              <span className="block text-[var(--fl-muted)]">{paragraph.when}</span>
            </span>
            <span className="min-w-0 text-[13px] leading-relaxed text-[var(--fl-muted)]">
              {paragraph.text}
            </span>
          </Row>
        ))}
      </div>
      <p className="mt-4 hidden text-[11.5px] text-[var(--fl-muted)] sm:block">
        Not line numbers in a diff — the paragraph you are reading, and the commit it arrived in.
      </p>
    </div>
  );
}

/** A runnable block, with the output block it writes back into the note. */
function RunPane() {
  return (
    <div className="h-full p-5 font-mono text-[12px]">
      <PaneLabel>Source</PaneLabel>

      <div className="overflow-hidden rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)]">
        <div className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5">
          <span className="text-[11px] text-[var(--fl-muted)]">python</span>
          <span className="ml-auto rounded border border-[var(--fl-accent)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--fl-accent)]">
            ▶ Run
          </span>
        </div>
        <p className="px-3 py-2 text-[var(--fl-text)]">print(&quot;hello world&quot;)</p>
      </div>

      <div className="fl-row-in mt-2 overflow-hidden rounded-lg border border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]">
        <p className="border-b border-[var(--fl-border)] px-3 py-1.5 text-[10.5px] text-[var(--fl-muted)]">
          ```output — ran 2026-08-27 11:09 UTC · ok · 34ms
        </p>
        <p className="px-3 py-2 text-[var(--fl-text)]">hello world</p>
      </div>

      <p className="mt-4 hidden font-sans text-[11.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        The output is written into the note underneath the block, committed with it, and replaced —
        not repeated — the next time you press Run. The old results are in the commit history, which
        is where history belongs.
      </p>
    </div>
  );
}

/** A pull request read as a note, with the comments beside the prose. */
function ReviewPane() {
  return (
    <div className="h-full p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-[var(--fl-accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--fl-accent)]">
          Pull request #42
        </span>
        <span className="truncate font-mono text-[10.5px] text-[var(--fl-muted)]">
          patch-1 → main
        </span>
      </div>

      <div className="space-y-2">
        <Row row={0} className="rounded-lg border border-[var(--fl-border)] px-3 py-2">
          <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
            The session cookie lasts thirty days.
          </p>
        </Row>
        <Row
          row={1}
          className="rounded-lg border border-[var(--fl-accent)] bg-[var(--fl-accent-soft)] px-3 py-2"
        >
          <p className="text-[13px] leading-relaxed text-[var(--fl-text)]">
            The token inside it lasts eight hours, and is renewed for you.
          </p>
          <p className="mt-1.5 border-t border-[var(--fl-border)] pt-1.5 text-[11.5px] text-[var(--fl-muted)]">
            <span className="font-semibold text-[var(--fl-accent)]">priya</span> · Is eight hours
            right? The docs say four.
          </p>
        </Row>
        <Row row={2} className="rounded-lg border border-[var(--fl-border)] px-3 py-2">
          <p className="text-[13px] leading-relaxed text-[var(--fl-muted)]">
            Queued changes are kept on the device until it succeeds.
          </p>
        </Row>
      </div>

      <p className="mt-4 hidden text-[11.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        The review reads where the note reads — rendered prose with the comments attached to the
        paragraph they are about, rather than a diff of Markdown source.
      </p>
    </div>
  );
}

/** Freshness: the notes that have gone off, and the reason each is flagged. */
function FreshPane() {
  const notes = [
    {
      note: "deploy-runbook.md",
      why: "names v14 · untouched 8 months · linked file changed in June",
      stale: true,
    },
    { note: "architecture/storage.md", why: "cites CVE-2025-4381 · 5 months", stale: true },
    {
      note: "how-i-think-about-scope.md",
      why: "nothing datable in it — never stale",
      stale: false,
    },
  ];

  return (
    <div className="h-full p-5">
      <PaneLabel>Freshness · 128 notes</PaneLabel>
      <div className="space-y-2">
        {notes.map((item, row) => (
          <Row
            key={item.note}
            row={row}
            className={`rounded-lg border px-3 py-2.5 ${
              item.stale
                ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
                : "border-[var(--fl-border)] bg-[var(--fl-elevated)]"
            }`}
          >
            <p className="truncate font-mono text-[11px] text-[var(--fl-text)]">{item.note}</p>
            <p className="mt-0.5 truncate text-[11.5px] text-[var(--fl-muted)]">
              {item.stale ? "Worth re-reading — " : "Never stale — "}
              {item.why}
            </p>
          </Row>
        ))}
      </div>
      <p className="mt-4 hidden text-[11.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        Prose about how you think does not expire, however old it is. A version number does.
      </p>
    </div>
  );
}

/** Capturing a source, as the dialog that does it. */
function CapturePane() {
  return (
    <div className="relative h-full p-5">
      <PaneLabel>Capture a web page as a source</PaneLabel>

      <div className="max-w-md rounded-xl border border-[var(--fl-border-strong)] bg-[var(--fl-elevated)] p-4 shadow-[var(--fl-shadow-lg)]">
        <p className="truncate rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--fl-text)]">
          https://example.com/the-post
        </p>

        <div className="mt-3 space-y-1.5 text-[11.5px]">
          <p className="flex items-center gap-2 text-[var(--fl-muted)]">
            <span className="text-[var(--fl-accent)]">✓</span> Title read from the page
          </p>
          <p className="flex items-center gap-2 text-[var(--fl-muted)]">
            <span className="text-[var(--fl-accent)]">✓</span> Archived copy · web.archive.org
          </p>
        </div>

        <div className="fl-row-in mt-3 rounded-md border border-[var(--fl-border)] bg-[var(--fl-surface)] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[var(--fl-muted)]">
          [The post&rsquo;s real title](https://example.com/the-post){" "}
          <span className="text-[var(--fl-accent)]">([archived](https://web.archive.org/…))</span>
        </div>

        <div className="mt-3 flex justify-end">
          <span className="rounded-md bg-[var(--fl-accent)] px-3 py-1 text-[11.5px] font-semibold text-[var(--fl-accent-contrast)]">
            Add to this note
          </span>
        </div>
      </div>

      <p className="mt-4 hidden text-[11.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        The citation is shown exactly as it will be written, before it is written — and it still
        means something after the site is sold.
      </p>
    </div>
  );
}

function SearchPane({ motion }: { motion: boolean }) {
  const results = [
    { note: "architecture/sync-engine.md", line: "drain to GitHub as one atomic commit." },
    { note: "meetings/2026-08-14.md", line: "One atomic commit per burst, not per keystroke." },
    { note: "architecture/storage.md", line: "The queue replays until the commit lands." },
  ];

  return (
    <div className="h-full p-5">
      {/* The command palette, which is how search is actually reached. */}
      <div className="mx-auto max-w-lg overflow-hidden rounded-xl border border-[var(--fl-border-strong)] bg-[var(--fl-elevated)] shadow-[var(--fl-shadow-lg)]">
        <div className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-2.5">
          <span className="font-mono text-[11px] text-[var(--fl-muted)]">⌘K</span>
          <span className="font-mono text-[13px] text-[var(--fl-text)]">atomic commit</span>
          {motion && (
            <span
              aria-hidden="true"
              className="fl-caret inline-block h-[1.05em] w-[2px] bg-[var(--fl-accent)]"
            />
          )}
          <span className="ml-auto text-[11px] text-[var(--fl-muted)]">3 results · 9 ms</span>
        </div>

        <ul>
          {results.map((result, row) => (
            <Row
              key={result.note}
              row={row}
              className="border-b border-[var(--fl-border)] px-3 py-2 last:border-0"
            >
              <p className="truncate font-mono text-[10.5px] text-[var(--fl-muted)]">
                {result.note}
              </p>
              <p className="truncate text-[12.5px] text-[var(--fl-text)]">{result.line}</p>
            </Row>
          ))}
        </ul>
      </div>

      <p className="mt-4 hidden text-center text-[11.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        The index lives in your browser, so search keeps working on a plane — and no query ever
        leaves the machine you typed it on.
      </p>
    </div>
  );
}

function DiagramPane() {
  return (
    <div className="flex h-full">
      <div className="hidden min-w-0 flex-1 flex-col border-r border-[var(--fl-border)] p-4 font-mono text-[12px] leading-relaxed md:flex">
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
        <p className="mt-3 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 text-[11px] leading-relaxed text-[var(--fl-muted)]">
          Or drag it on a canvas — the source is written for you, and node positions survive the
          round trip.
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-5">
        <PaneLabel>Rendered</PaneLabel>
        <div className="flex flex-1 items-center justify-center">
          <Flowchart />
        </div>
      </div>
    </div>
  );
}

function PublishPane() {
  return (
    <div className="h-full p-5">
      <PaneLabel>Publish this note</PaneLabel>

      <div className="rounded-lg border border-[var(--fl-border-strong)] bg-[var(--fl-elevated)] p-3.5">
        <p className="text-[13px] font-semibold text-[var(--fl-text)]">Published page</p>
        <p className="mt-1 break-all font-mono text-[11.5px] text-[var(--fl-accent)]">
          praneeth132006.github.io/notes/sync-engine
        </p>
      </div>

      <div className="fl-row-in mt-2.5 rounded-lg border border-[var(--fl-border)] px-3.5 py-2.5">
        <p className="text-[11.5px] font-semibold text-[var(--fl-text)]">
          Publishing from a private notebook
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--fl-muted)]">
          The page can be committed to a different, public repository — so one note becomes a link
          you can send without the notebook around it becoming public.
        </p>
      </div>

      <p className="mt-4 hidden text-[11.5px] leading-relaxed text-[var(--fl-muted)] sm:block">
        One self-contained file in a repository you own, served by GitHub Pages. Unpublishing is a
        deleted file.
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
    <div className={`fl-row-in ${className}`} style={{ animationDelay: `${120 + row * 70}ms` }}>
      {children}
    </div>
  );
}

function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
      {children}
    </p>
  );
}

function PanelLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)] ${className}`}
    >
      {children}
    </p>
  );
}

function TreeRow({
  label,
  depth,
  folder = false,
  active = false,
  stale = false,
}: {
  label: string;
  depth: number;
  folder?: boolean;
  active?: boolean;
  stale?: boolean;
}) {
  return (
    <div
      style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      className={`flex items-center gap-1.5 rounded-md py-1 pr-2 text-[12px] transition-colors ${
        active ? "bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"
      }`}
    >
      <span aria-hidden="true" className="text-[9px] opacity-70">
        {folder ? "▾" : "•"}
      </span>
      <span className="truncate">{label}</span>
      {stale && (
        <span
          aria-hidden="true"
          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
        />
      )}
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
