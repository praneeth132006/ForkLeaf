import React from "react";
import Link from "next/link";
import { SectionHeading } from "./SectionHeading";

/**
 * The inventory: everything ForkLeaf can actually do, grouped by the job it
 * belongs to.
 *
 * The bento grid below this section argues for a handful of ideas. This one
 * exists for the other reader — the one who has already been convinced by the
 * idea and now wants to know whether the thing is finished enough to move into.
 * That reader is not served by nine beautiful cards; they want the list.
 *
 * Every entry here corresponds to code in this repository. Nothing planned,
 * nothing "coming soon" — a capability list is a promise, and this page has
 * over-promised before. When a row stops being true, delete the row.
 */

interface Group {
  eyebrow: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  items: { name: string; detail: string }[];
  /** Where to read more about this group. */
  href: string;
}

const GROUPS: Group[] = [
  {
    eyebrow: "Write",
    title: "Three editors over one file",
    blurb:
      "Rich-text blocks, a live split view, or the raw Markdown. Switch per note — the bytes on disk are identical either way.",
    icon: <PenIcon />,
    href: "/docs/editor",
    items: [
      { name: "Rich-text mode", detail: "Blocks, a toolbar, and a bubble menu on selection" },
      { name: "Split mode", detail: "Source and preview side by side, on a draggable divider" },
      { name: "Source mode", detail: "CodeMirror with syntax highlighting and line numbers" },
      { name: "Slash commands", detail: "Type / for headings, lists, tables, code, diagrams" },
      { name: "Markdown shortcuts", detail: "# ␣, - ␣, > ␣, ``` ␣ and the rest, as you type" },
      { name: "Images", detail: "Paste, drop or upload — committed alongside the note" },
      { name: "Properties", detail: "Title, tags and custom fields, stored as YAML front matter" },
      { name: "Tabs & outline", detail: "Several notes open at once, with headings and stats" },
    ],
  },
  {
    eyebrow: "Connect",
    title: "A notebook, not a pile of files",
    blurb:
      "Links, backlinks and search turn a folder of Markdown into something you can actually think in.",
    icon: <GraphIcon />,
    href: "/docs/getting-started",
    items: [
      { name: "[[Wikilinks]]", detail: "The Obsidian dialect, with autocomplete" },
      { name: "Backlinks panel", detail: "Quotes the line each inbound link was written on" },
      {
        name: "Link to nothing",
        detail: "Clicking a link to a note you have not written writes it",
      },
      {
        name: "Full-text search",
        detail: "Every word of every note, ranked with BM25, in-browser",
      },
      { name: "Tags", detail: "Filter the library by anything in the front matter" },
      { name: "Folders & tree", detail: "Real directories in the repository, renamed in place" },
      { name: "Command palette", detail: "⌘K to jump to any note or run any command" },
    ],
  },
  {
    eyebrow: "Diagram",
    title: "Mermaid, without learning Mermaid",
    blurb:
      "A visual builder sits on top of the syntax. Drag nodes, edit labels, and the file underneath stays plain Markdown.",
    icon: <DiagramIcon />,
    href: "/docs/diagrams",
    items: [
      { name: "Visual builder", detail: "Add, connect and drag nodes without typing syntax" },
      { name: "14 templates", detail: "Flowchart, sequence, class, state, ER, Gantt, mindmap…" },
      { name: "Live rendering", detail: "The diagram redraws as the source changes" },
      { name: "Source editor", detail: "Autocomplete and error messages that point at the line" },
      { name: "Positions persist", detail: "Node coordinates round-trip through the file itself" },
      { name: "Renders everywhere", detail: "It is a ```mermaid block — GitHub draws it too" },
    ],
  },
  {
    eyebrow: "Sync",
    title: "Git, doing the part git is good at",
    blurb:
      "Writes hit your device first and drain to GitHub as atomic commits. Close the laptop mid-sentence; it catches up when you land.",
    icon: <SyncIcon />,
    href: "/docs/sync",
    items: [
      {
        name: "Any repo you can push to",
        detail: "New, existing, private, or somebody else's fork",
      },
      { name: "Offline-first", detail: "IndexedDB first, network second — always in that order" },
      { name: "Atomic commits", detail: "A burst of edits becomes one clean commit, not forty" },
      { name: "Full history", detail: "Every version of every note, with diffs, in the app" },
      { name: "Branches", detail: "Switch the branch you are writing on from the status bar" },
      { name: "Conflicts", detail: "Both versions shown side by side — never a silent overwrite" },
      { name: "Propose changes", detail: "Open a pull request against a repo you cannot push to" },
    ],
  },
  {
    eyebrow: "Ship",
    title: "Getting it back out again",
    blurb:
      "Every export is rendered in your browser. The note never leaves your machine in order to become a file.",
    icon: <ShipIcon />,
    href: "/docs/export",
    items: [
      { name: "PDF", detail: "Typeset for print, diagrams included" },
      { name: "Word (.docx)", detail: "Real headings and lists, not an image of a document" },
      { name: "HTML", detail: "One self-contained file, nothing to host" },
      {
        name: "Markdown, text, JSON",
        detail: "The source, stripped, or with stats and properties",
      },
      { name: "Export the workspace", detail: "Every note at once, not one file at a time" },
      { name: "Publish", detail: "A public page committed to your repo, served by GitHub Pages" },
      {
        name: "Opens local .md files",
        detail: "Double-click a file on your desktop; ⌘S writes it back",
      },
    ],
  },
];

export function Toolkit() {
  return (
    <section id="toolkit" className="fl-anchor mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="The toolkit"
        title="Everything it does, in one list"
        body="Not a roadmap. Every row below is shipping in the repository today, and works whether or not you have signed in — the GitHub half simply adds the history."
      />

      <div className="mt-12 space-y-4">
        {GROUPS.map((group) => (
          <article
            key={group.eyebrow}
            className="fl-card grid gap-8 p-6 transition-colors hover:border-[var(--fl-border-strong)] sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12"
          >
            <header>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--fl-border)] bg-[var(--fl-elevated)] text-[var(--fl-accent)]">
                {group.icon}
              </span>

              <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
                {group.eyebrow}
              </p>
              <h3 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[var(--fl-text)]">
                {group.title}
              </h3>
              <p className="mt-2.5 max-w-sm text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
                {group.blurb}
              </p>

              <Link
                href={group.href}
                className="mt-4 inline-block text-[13.5px] text-[var(--fl-accent)] underline decoration-[var(--fl-border-strong)] underline-offset-[3px] transition-colors hover:decoration-[var(--fl-accent)]"
              >
                Read the docs →
              </Link>
            </header>

            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <li key={item.name} className="flex gap-2.5">
                  <Tick />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-[var(--fl-text)]">
                      {item.name}
                    </span>
                    <span className="block text-[13px] leading-relaxed text-[var(--fl-muted)]">
                      {item.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function Tick() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="mt-[5px] h-3 w-3 shrink-0 text-[var(--fl-accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2.5 8.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

/* ── Group icons ───────────────────────────────────────────────────────────
   Drawn inline at a single stroke weight rather than pulled from an icon set,
   so they inherit the accent token and match the hairline vocabulary the rest
   of the page uses. */

function Stroke({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function PenIcon() {
  return (
    <Stroke>
      <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" />
      <path d="M11.5 5.5 14.5 8.5" />
    </Stroke>
  );
}

function GraphIcon() {
  return (
    <Stroke>
      <circle cx="5" cy="6" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="10" cy="15" r="2" />
      <path d="M6.7 7.4 8.8 13M13.6 6.6 11.2 13.4M7 5.6 13 5.2" />
    </Stroke>
  );
}

function DiagramIcon() {
  return (
    <Stroke>
      <rect x="2.5" y="2.5" width="6" height="4.5" rx="1.2" />
      <rect x="11.5" y="13" width="6" height="4.5" rx="1.2" />
      <rect x="2.5" y="13" width="6" height="4.5" rx="1.2" />
      <path d="M5.5 7v6M8.5 4.75h6a2 2 0 0 1 2 2V13" />
    </Stroke>
  );
}

function SyncIcon() {
  return (
    <Stroke>
      <path d="M3 10a7 7 0 0 1 11.9-5M17 10a7 7 0 0 1-11.9 5" />
      <path d="M15 2v3.2h-3.2M5 18v-3.2h3.2" />
    </Stroke>
  );
}

function ShipIcon() {
  return (
    <Stroke>
      <path d="M10 2.5v9" />
      <path d="M6.6 5.9 10 2.5l3.4 3.4" />
      <path d="M3 11.5v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </Stroke>
  );
}
