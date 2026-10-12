import React from "react";
import Link from "next/link";
import { SectionLink } from "./SectionLink";
import {
  ConflictArt,
  DiagramArt,
  ExportArt,
  FlashcardArt,
  FreshnessArt,
  LinksArt,
  McpArt,
  OfflineArt,
  PublishArt,
  RecallArt,
  RepoWindowArt,
  SearchArt,
} from "./LandingArt";

/**
 * The tour: everything ForkLeaf is for, as four jobs.
 *
 * The page used to argue in a dozen unrelated feature cards, each with its own
 * paragraph, and a reader had no way to tell how they fitted together or how
 * much was left to read. It is one system now. An index right under the hero
 * names the four jobs, and each job is a chapter built the same way: a number,
 * a short title, one line, six capabilities with a few words each, and the
 * pictures that prove them. The same shape four times is what lets a reader
 * skim it.
 *
 * Every capability named here exists in the repository today. The complete
 * list is the toolkit section further down.
 */

interface Panel {
  label?: string;
  art: React.ReactNode;
  /** Spans both columns of the art grid. */
  wide?: boolean;
  /** Draws its own frame, so the panel adds none. */
  bare?: boolean;
}

interface Chapter {
  id: string;
  eyebrow: string;
  title: string;
  line: string;
  icon: React.ReactNode;
  items: { name: string; detail: string }[];
  panels: Panel[];
  docs: { href: string; label: string };
}

const CHAPTERS: Chapter[] = [
  {
    id: "own",
    eyebrow: "Own it",
    title: "Your notes are files in your repo",
    line: "Saved on this device first, then committed to GitHub under your name.",
    icon: <RepoIcon />,
    items: [
      { name: "Local-first", detail: "Writes land offline and sync when you reconnect" },
      { name: "Clean commits", detail: "A burst of edits becomes one commit" },
      { name: "Real history", detail: "Every version, and who wrote each line" },
      { name: "Time machine", detail: "The notebook as it was on any date" },
      { name: "Honest conflicts", detail: "Both versions shown, and you choose" },
      { name: "Branches and pull requests", detail: "Rewrite on a branch, propose to others" },
    ],
    panels: [
      { art: <RepoWindowArt />, wide: true, bare: true },
      { label: "Offline queue", art: <OfflineArt /> },
      { label: "Conflict", art: <ConflictArt /> },
    ],
    docs: { href: "/docs/sync", label: "How sync works" },
  },
  {
    id: "write",
    eyebrow: "Write and connect",
    title: "Write once, link everything",
    line: "Three editors over one Markdown file, and links that turn a folder into a knowledge base.",
    icon: <LinkIcon />,
    items: [
      { name: "Three editors", detail: "Rich text, split or raw source, same file" },
      { name: "Wikilinks and backlinks", detail: "Each backlink quotes the line it is on" },
      { name: "Offline search", detail: "Every word of every note, ranked" },
      { name: "Diagram studio", detail: "Draw Mermaid diagrams, or type them" },
      { name: "Graph, canvas, board, table", detail: "Four ways to see a folder" },
      { name: "PDFs beside notes", detail: "Quotes that cite the sentence, not the page" },
    ],
    panels: [
      { label: "Links and backlinks", art: <LinksArt />, wide: true },
      { label: "Search", art: <SearchArt /> },
      { label: "Diagram", art: <DiagramArt /> },
    ],
    docs: { href: "/docs/editor", label: "Tour the editor" },
  },
  {
    id: "learn",
    eyebrow: "Learn and check",
    title: "A notebook that tests you back",
    line: "Turn notes into memory, and catch what your notes do not support.",
    icon: <SparkIcon />,
    items: [
      { name: "Flashcards in the note", detail: "Question :: Answer becomes a card" },
      { name: "Explain it back", detail: "Recall a hidden note, see what you missed" },
      { name: "Spaced reading", detail: "Highlights come back on a schedule" },
      { name: "Folder to course", detail: "Lessons in link order, with a quiz" },
      { name: "Claim checker", detail: "Flags sentences nothing supports" },
      { name: "Stale-note alerts", detail: "Notes whose facts have moved on" },
    ],
    panels: [
      { label: "Explain it back", art: <RecallArt />, wide: true },
      { label: "Flashcard", art: <FlashcardArt /> },
      { label: "Worth re-reading", art: <FreshnessArt /> },
    ],
    docs: { href: "/docs/flashcards", label: "How flashcards work" },
  },
  {
    id: "share",
    eyebrow: "Capture and share",
    title: "Bring things in, send things out",
    line: "Clip the web, work with an AI assistant, and publish from your own repository.",
    icon: <SendIcon />,
    items: [
      { name: "Web clipper", detail: "Pages, quotes and highlights to your inbox" },
      { name: "Voice and meetings", detail: "Decisions and to-dos pulled out" },
      { name: "AI assistants", detail: "Claude reads and writes, as commits" },
      { name: "Runnable code", detail: "Output saved under the block" },
      { name: "Publish", detail: "A page, a book or a garden on GitHub Pages" },
      { name: "Export", detail: "PDF, Word, HTML or Markdown, in the browser" },
    ],
    panels: [
      { label: "An assistant in your notebook", art: <McpArt />, wide: true },
      { label: "Publish", art: <PublishArt /> },
      { label: "Export", art: <ExportArt /> },
    ],
    docs: { href: "/docs/mcp", label: "Connect an assistant" },
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

export function Tour() {
  return (
    <>
      <TourIndex />
      {CHAPTERS.map((chapter, index) => (
        <ChapterSection key={chapter.id} chapter={chapter} index={index} />
      ))}
    </>
  );
}

/** The four jobs side by side, each a jump to its chapter. */
function TourIndex() {
  return (
    <section id="tour" className="fl-anchor mx-auto w-full max-w-6xl px-6 py-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
            The tour
          </p>
          <h2 className="mt-3 font-serif text-[2.5rem] font-normal leading-[1] tracking-[-0.02em] text-[var(--fl-text)] sm:text-[3.25rem]">
            One notebook. Four jobs.
          </h2>
        </div>
        <p className="max-w-sm text-[16px] leading-relaxed text-[var(--fl-muted)]">
          Pick one to jump to it, or scroll through all four.
        </p>
      </div>

      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CHAPTERS.map((chapter, index) => (
          <li key={chapter.id} className="min-w-0">
            <SectionLink
              hash={`#${chapter.id}`}
              className="fl-card group flex h-full flex-col p-6 transition-colors hover:border-[var(--fl-accent)]"
            >
              <span className="flex items-center justify-between">
                <span className="font-mono text-[12px] font-semibold tracking-wider text-[var(--fl-accent)]">
                  {pad(index + 1)}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]">
                  {chapter.icon}
                </span>
              </span>
              <span className="mt-8 block text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--fl-muted)]">
                {chapter.eyebrow}
              </span>
              <span className="mt-2 block font-serif text-[1.625rem] leading-[1.1] tracking-[-0.015em] text-[var(--fl-text)]">
                {chapter.title}
              </span>
              <span className="mt-auto flex items-center justify-between pt-8 font-mono text-[12px] text-[var(--fl-muted)]">
                {chapter.items.length} tools
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-y-0.5 group-hover:text-[var(--fl-accent)]"
                >
                  ↓
                </span>
              </span>
            </SectionLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ChapterSection({ chapter, index }: { chapter: Chapter; index: number }) {
  // Alternate the side the pictures sit on, so four chapters of the same shape
  // still read as a sequence rather than one block repeated.
  const flipped = index % 2 === 1;

  return (
    <section
      id={chapter.id}
      className="fl-anchor border-t border-[var(--fl-border)]"
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-24">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
          <div className={`min-w-0 ${flipped ? "lg:order-2" : ""}`}>
            <p className="flex items-center gap-3 text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
              <span className="font-mono tracking-wider">
                {pad(index + 1)} / {pad(CHAPTERS.length)}
              </span>
              <span aria-hidden="true" className="h-px w-8 bg-[var(--fl-border-strong)]" />
              {chapter.eyebrow}
            </p>
            <h2
              id={`${chapter.id}-title`}
              className="mt-4 font-serif text-[2.5rem] font-normal leading-[1.02] tracking-[-0.02em] text-[var(--fl-text)] sm:text-[3rem]"
            >
              {chapter.title}
            </h2>
            <p className="mt-4 max-w-md text-[16.5px] leading-relaxed text-[var(--fl-muted)]">
              {chapter.line}
            </p>

            <ul className="mt-8 divide-y divide-[var(--fl-border)] border-y border-[var(--fl-border)]">
              {chapter.items.map((item) => (
                <li key={item.name} className="flex items-start gap-3 py-3">
                  <CheckIcon />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--fl-text)]">
                      {item.name}
                    </span>
                    <span className="block text-[14px] text-[var(--fl-muted)]">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            <Link
              href={chapter.docs.href}
              className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--fl-accent)] hover:underline"
            >
              {chapter.docs.label} →
            </Link>
          </div>

          <div className={`grid min-w-0 gap-3 sm:grid-cols-2 ${flipped ? "lg:order-1" : ""}`}>
            {chapter.panels.map((panel, i) =>
              panel.bare ? (
                <div key={i} className={`min-w-0 ${panel.wide ? "sm:col-span-2" : ""}`}>
                  {panel.art}
                </div>
              ) : (
                <figure
                  key={i}
                  className={`fl-card m-0 min-w-0 p-5 ${panel.wide ? "sm:col-span-2" : ""}`}
                >
                  {panel.label && (
                    <figcaption className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
                      {panel.label}
                    </figcaption>
                  )}
                  {panel.art}
                </figure>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────────── */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function RepoIcon() {
  return (
    <Icon>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="9" r="2.2" />
      <path d="M6 7.2v9.6M18 11.2c0 4-6 3.6-11 6" />
    </Icon>
  );
}

function LinkIcon() {
  return (
    <Icon>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Icon>
  );
}

function SparkIcon() {
  return (
    <Icon>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </Icon>
  );
}

function SendIcon() {
  return (
    <Icon>
      <path d="M21 3 10 14" />
      <path d="m21 3-7 18-4-7-7-4z" />
    </Icon>
  );
}

function CheckIcon() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      >
        <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
