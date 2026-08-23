import { SectionHeading } from "./SectionHeading";

/**
 * How it works: one note's journey from a keystroke to a commit you own.
 *
 * This used to be a five-viewport pinned scroll that assembled the product
 * piece by piece as you scrolled through it. It was a nice trick and a bad
 * section: it hijacked the scrollbar, left the reader staring at a mostly empty
 * screen for four full viewports, and made a page that is already long feel
 * interminable. Every other section on this page states its case and gets out
 * of the way, and this one now does the same — the four steps beside the
 * finished product, at the size of everything else.
 *
 * The window is drawn in markup rather than shipped as a screenshot: it
 * re-themes with the page, stays sharp at any zoom, and costs nothing to
 * download.
 */

const STEPS = [
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

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="How it works"
        title="From a keystroke to a commit you own"
        body="Four steps, none of which you have to think about. The middle two are the ones other notes apps replace with a database."
      />

      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
        {/* ── The steps ─────────────────────────────────────────────────── */}
        {/* A hairline runs behind the numbers to make the four read as one
            sequence rather than four unrelated claims. */}
        <ol className="relative">
          <span
            aria-hidden="true"
            className="absolute bottom-8 left-[15px] top-4 w-px bg-[var(--fl-border)]"
          />

          {STEPS.map((step) => (
            <li key={step.n} className="relative flex gap-5 pb-9 last:pb-0">
              <span className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--fl-border)] bg-[var(--fl-surface)] font-mono text-[11px] font-semibold tracking-wider text-[var(--fl-accent)]">
                {step.n}
              </span>

              <div className="min-w-0">
                <h3 className="font-serif text-[1.75rem] font-normal leading-[1.15] tracking-[-0.02em] text-[var(--fl-text)]">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-md text-[15px] leading-[1.6] text-[var(--fl-muted)]">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* ── The result ────────────────────────────────────────────────── */}
        <Window />
      </div>
    </section>
  );
}

/**
 * The application, finished.
 *
 * Every colour is a token. It was hardcoded to a dark green palette the app
 * retired, so on a light page it was a black rectangle with acid-green text in
 * it, and in either theme it ignored the accent the reader had chosen — the one
 * illustration on the page that did not belong to the page.
 */
function Window() {
  return (
    <div
      role="img"
      aria-label="A note open in ForkLeaf: a file tree, the Markdown source, and the commits it has been through"
      className="overflow-hidden rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] shadow-[var(--fl-shadow-lg)]"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-[var(--fl-border)] bg-[var(--fl-elevated)] px-4 py-2.5">
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

      <div className="flex">
        {/* File tree */}
        <aside
          aria-hidden="true"
          className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-[var(--fl-border)] py-3 sm:flex"
        >
          <div className="mx-3 mb-2 truncate rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-2.5 py-1.5 text-[11px] text-[var(--fl-muted)]">
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
          {/* Path bar */}
          <div className="flex shrink-0 items-center border-b border-[var(--fl-border)] px-5 py-2">
            <span className="truncate font-mono text-[11.5px] text-[var(--fl-muted)]">
              architecture/sync-engine.md
            </span>
          </div>

          {/* The note */}
          <div className="min-h-0 flex-1 p-5 font-mono text-[12.5px] leading-relaxed">
            {LINES.map((line, index) => (
              <p
                key={index}
                className={`whitespace-pre-wrap ${
                  line.accent ? "font-semibold text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"
                }`}
              >
                {line.text || " "}
              </p>
            ))}
          </div>

          {/* The commits it has been through */}
          <div className="shrink-0 border-t border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-1.5">
            {HISTORY.map((commit, index) => (
              <div
                key={commit.sha}
                className="flex items-center gap-2.5 whitespace-nowrap px-1.5 py-1"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    index === 0 ? "bg-[var(--fl-accent)]" : "bg-[var(--fl-border-strong)]"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--fl-text)]">
                  {commit.message}
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-[var(--fl-muted)]">
                  {commit.sha}
                </span>
                <span className="hidden shrink-0 text-[11px] text-[var(--fl-muted)] sm:inline">
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
