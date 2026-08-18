"use client";

import React from "react";
import { useScrollProgress } from "@/hooks/useScrollProgress";

/**
 * The long scroll: one note's journey from a keystroke to a commit you own.
 *
 * The page used to explain this in a three-column grid of numbered steps, which
 * is the sort of thing a visitor skims and forgets. The claim ForkLeaf makes is
 * about a sequence — you type, it becomes a file, the file becomes a commit,
 * the commit is yours — and a sequence is better shown happening than listed.
 *
 * So the section pins and the product assembles: the frame arrives, then the
 * text, then the tree around it, then the commit beneath it, then the history
 * it joins. Nothing that has arrived leaves again, because the point is
 * accumulation.
 *
 * Everything is derived from a single scroll fraction and expressed as opacity
 * and transform — no layout is animated, so it stays on the compositor. Anyone
 * who has asked for reduced motion, and anyone whose JavaScript has not run,
 * gets the same content stacked and fully visible instead.
 */

const CHAPTERS = [
  {
    n: "01",
    title: "You type.",
    body: "Plain Markdown, in a rich editor or in the raw source — the same file either way. It is written to your device before you have finished the word.",
  },
  {
    n: "02",
    title: "It is a file.",
    body: "Not a row in someone's database. A .md file, in a folder you named, in a repository you already have. Anything that reads Markdown can read it.",
  },
  {
    n: "03",
    title: "It becomes a commit.",
    body: "Edits are batched into atomic commits and pushed for you. Close the laptop mid-sentence, fly somewhere, keep writing — it catches up when you land.",
  },
  {
    n: "04",
    title: "And it stays yours.",
    body: "Real history in a real repository. Clone it, revert it, or walk away with all of it — there is no export step, because there was never an import step.",
  },
] as const;

const LINES: { text: string; accent?: boolean }[] = [
  { text: "# Sync engine", accent: true },
  { text: "" },
  { text: "Writes land in IndexedDB first, then" },
  { text: "drain to GitHub as one atomic commit." },
  { text: "" },
  { text: "## Guarantees", accent: true },
  { text: "" },
  { text: "- Nothing is lost when the tab closes" },
  { text: "- Offline edits queue and replay" },
];

const HISTORY = [
  { message: "Add conflict resolution notes", sha: "a3f9c21", when: "just now" },
  { message: "Update 3 notes", sha: "7b21e08", when: "1 hour ago" },
  { message: "Rename reading.md to reading-list.md", sha: "1c94ffa", when: "yesterday" },
] as const;

export function ScrollStory() {
  const { ref, progress, animated } = useScrollProgress<HTMLDivElement>();

  if (!animated) return <StaticStory />;

  return (
    <section id="how" aria-label="How ForkLeaf works">
      {/* The tall element is what there is to scroll through; the stage inside
          it is what stays still while that happens. One viewport per chapter,
          plus one for the assembled result to be looked at. */}
      <div ref={ref} className="relative h-[500vh]">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
            {/* ── Captions ─────────────────────────────────────────────── */}
            {/* Stacked on top of each other and cross-faded, so the frame
                beside them never moves as the words change. */}
            <div className="relative h-[210px] sm:h-[190px]">
              {CHAPTERS.map((chapter, index) => {
                const start = index * 0.25;
                // The last chapter has no successor to make way for, so it
                // fades in and stays: the reader ends the section reading it.
                const opacity =
                  index === CHAPTERS.length - 1
                    ? track(progress, start, start + 0.06)
                    : band(progress, start, start + 0.25, 0.06);

                return (
                  <div
                    key={chapter.n}
                    aria-hidden={opacity < 0.5}
                    style={{
                      opacity,
                      transform: `translateY(${(1 - opacity) * 12}px)`,
                    }}
                    className="absolute inset-x-0 top-0"
                  >
                    <p className="font-mono text-xs font-semibold tracking-widest text-[var(--fl-accent)]">
                      {chapter.n}
                    </p>
                    <h2 className="mt-3 font-serif text-[2.5rem] font-normal leading-[1.05] tracking-[-0.02em] text-[var(--fl-text)] sm:text-[3.25rem]">
                      {chapter.title}
                    </h2>
                    <p className="mt-4 max-w-md text-[16px] leading-[1.6] text-[var(--fl-muted)]">
                      {chapter.body}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* ── The thing being assembled ────────────────────────────── */}
            <Stage progress={progress} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The product, mid-assembly.
 *
 * Drawn in markup rather than shipped as a sequence of images: it re-themes,
 * stays sharp at any zoom, and costs nothing to download. Always dark in both
 * themes, matching the hero's frame, so it reads as an application rather than
 * as part of the page.
 */
function Stage({ progress }: { progress: number }) {
  // The frame itself, settling into place as the section takes over the screen.
  const frame = ease(track(progress, 0, 0.08));
  // Chapter 1: the words arrive a line at a time.
  const typing = track(progress, 0.05, 0.24) * (LINES.length + 1);
  // Chapter 2: the file gets a name and a folder around it.
  const filed = ease(track(progress, 0.26, 0.46));
  // Chapter 3: the commit lands underneath.
  const committed = ease(track(progress, 0.52, 0.7));
  // Chapter 4: it takes its place in a history.
  const history = ease(track(progress, 0.74, 0.94));

  return (
    <div
      role="img"
      aria-label="A note being written, saved as a file, and committed to a GitHub repository"
      style={{
        opacity: frame,
        transform: `translateY(${(1 - frame) * 24}px) scale(${0.96 + frame * 0.04})`,
      }}
      className="overflow-hidden rounded-2xl border border-[#232823] bg-[#0a0c0a] text-[#e9ece7] shadow-[0_50px_140px_-50px_rgba(0,0,0,0.9)]"
    >
      {/* Window chrome. The repository name only appears once the note has
          somewhere to live. */}
      <div className="flex items-center gap-3 border-b border-[#1c211c] px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a302a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a302a]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2a302a]" />
        </span>
        <span
          style={{ opacity: filed }}
          className="mx-auto rounded-md bg-[#101310] px-3 py-1 font-mono text-[11px] text-[#6f776e]"
        >
          notes · main
        </span>
        <span
          style={{ opacity: committed }}
          className="hidden items-center gap-1.5 text-[11px] text-[#6f776e] sm:flex"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#3ecf8e]" />
          Synced
        </span>
      </div>

      <div className="flex h-[320px] sm:h-[360px]">
        {/* The tree slides in from the left as the note becomes a file. */}
        <aside
          style={{
            width: `${filed * 11}rem`,
            opacity: filed,
          }}
          className="hidden shrink-0 flex-col gap-0.5 overflow-hidden border-r border-[#1c211c] py-3 sm:flex"
          aria-hidden="true"
        >
          <div className="mx-3 mb-2 whitespace-nowrap rounded-md bg-[#101310] px-2.5 py-1.5 text-[11px] text-[#6f776e]">
            Search notes…
          </div>
          <TreeRow depth={0} label="architecture" folder />
          <TreeRow depth={1} label="sync-engine.md" active />
          <TreeRow depth={1} label="storage.md" />
          <TreeRow depth={0} label="meetings" folder />
          <TreeRow depth={1} label="2026-08-14.md" />
          <TreeRow depth={0} label="reading-list.md" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* The path bar: the moment the note stops being "the thing I am
              typing" and starts being a file at an address. */}
          <div
            style={{ height: `${filed * 2.25}rem`, opacity: filed }}
            className="flex shrink-0 items-center overflow-hidden border-b border-[#1c211c] px-5"
          >
            <span className="truncate whitespace-nowrap font-mono text-[11.5px] text-[#6f776e]">
              architecture/sync-engine.md
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-5 font-mono text-[12.5px] leading-relaxed">
            {LINES.map((line, index) => {
              const shown = clamp(typing - index);
              return (
                <p
                  key={index}
                  style={{ opacity: shown, transform: `translateY(${(1 - shown) * 4}px)` }}
                  className={`whitespace-pre-wrap ${line.accent ? "text-[#3ecf8e]" : "text-[#a8b0a6]"}`}
                >
                  {line.text || " "}
                </p>
              );
            })}
          </div>

          {/* The commit, and then the ones before it. */}
          <div
            style={{
              height: `${committed * 2.75 + history * (HISTORY.length - 1) * 2.25}rem`,
              opacity: committed,
            }}
            className="shrink-0 overflow-hidden border-t border-[#1c211c] px-3 py-1"
          >
            {HISTORY.map((commit, index) => (
              <div
                key={commit.sha}
                style={{
                  opacity: index === 0 ? committed : history,
                  transform: `translateY(${(1 - (index === 0 ? committed : history)) * 8}px)`,
                }}
                className="flex items-center gap-2.5 whitespace-nowrap px-1.5 py-1"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    index === 0 ? "bg-[#3ecf8e]" : "bg-[#3a423a]"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#e9ece7]">
                  {commit.message}
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-[#6f776e]">
                  {commit.sha}
                </span>
                <span className="hidden shrink-0 text-[11px] text-[#6f776e] sm:inline">
                  {commit.when}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The same story without the scrolling.
 *
 * Served to reduced-motion readers and to the first paint before the hook has
 * measured anything. It says everything the animated version says; it just says
 * it all at once.
 */
function StaticStory() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-6 py-24">
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-border)] md:grid-cols-2">
        {CHAPTERS.map((chapter) => (
          <li key={chapter.n} className="bg-[var(--fl-bg)] p-7">
            <span className="font-mono text-xs font-semibold tracking-widest text-[var(--fl-accent)]">
              {chapter.n}
            </span>
            <h2 className="mt-4 font-serif text-[1.75rem] font-normal leading-tight tracking-[-0.02em] text-[var(--fl-text)]">
              {chapter.title}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--fl-muted)]">
              {chapter.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
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
      style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
      className={`mx-2 flex items-center gap-1.5 whitespace-nowrap rounded-md py-1 pr-2 text-[12.5px] ${
        active ? "bg-[#3ecf8e]/12 text-[#3ecf8e]" : folder ? "text-[#8b938a]" : "text-[#7d857c]"
      }`}
    >
      <span aria-hidden="true" className="text-[9px] opacity-70">
        {folder ? "▾" : "•"}
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

/* ── Progress arithmetic ──────────────────────────────────────────────────── */

function clamp(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Where `p` sits inside one window of the overall scroll, as 0…1. */
function track(p: number, start: number, end: number): number {
  return clamp((p - start) / (end - start));
}

/** Fades in, holds, fades out — for things that have a turn rather than a cue. */
function band(p: number, start: number, end: number, fade: number): number {
  return Math.min(track(p, start, start + fade), 1 - track(p, end - fade, end));
}

/** Decelerating, so arrivals settle rather than stop dead. */
function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
