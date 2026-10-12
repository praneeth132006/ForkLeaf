/**
 * The illustrations the landing page tour is drawn with.
 *
 * Small CSS/SVG vignettes rather than screenshots: they re-theme with the rest
 * of the page, stay sharp at any zoom and add nothing to the page weight.
 * Every one shows something ForkLeaf does today.
 */

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

/**
 * The application, finished.
 *
 * Every colour is a token. It was hardcoded to a dark green palette the app
 * retired, so on a light page it was a black rectangle with acid-green text in
 * it, and in either theme it ignored the accent the reader had chosen — the one
 * illustration on the page that did not belong to the page.
 */
export function RepoWindowArt() {
  return (
    <div
      role="img"
      aria-label="A note open in ForkLeaf: a file tree, the Markdown source, and the commits it has been through"
      className="flex h-full min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] shadow-[var(--fl-shadow-lg)]"
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

      <div className="flex min-h-0 flex-1">
        {/* File tree */}
        <aside
          aria-hidden="true"
          className="hidden w-48 shrink-0 flex-col gap-0.5 border-r border-[var(--fl-border)] py-3 sm:flex"
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
          <div className="min-h-0 flex-1 overflow-hidden p-5 font-mono text-[13px] leading-[1.75]">
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

            {/* A caret at the end, because a still of a text editor with no
                insertion point in it reads as a screenshot of a closed file. */}
            <span
              aria-hidden="true"
              className="mt-1 inline-block h-[1.05em] w-[2px] align-text-bottom bg-[var(--fl-accent)]"
            />
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

export function LinksArt() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
          Meeting notes
        </p>
        <p className="text-[12.5px] leading-relaxed text-[var(--fl-muted)]">
          Blocked until{" "}
          <span className="rounded bg-[var(--fl-accent-soft)] px-1 text-[var(--fl-accent)]">
            [[Q3 roadmap]]
          </span>{" "}
          lands, then start{" "}
          <span className="rounded border-b border-dashed border-[var(--fl-muted)] px-0.5">
            [[Hiring plan]]
          </span>
          .
        </p>
      </div>

      <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
          2 notes link here
        </p>
        {["Meeting notes", "Planning"].map((note) => (
          <div key={note} className="mb-2 last:mb-0">
            <p className="text-[12.5px] text-[var(--fl-text)]">{note}</p>
            <p className="truncate text-[11.5px] text-[var(--fl-muted)]">
              Blocked until [[Q3 roadmap]] lands…
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RunArt() {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)]">
      <div className="flex items-center gap-2 border-b border-[var(--fl-border)] px-3 py-1.5">
        <span className="font-mono text-[11px] text-[var(--fl-muted)]">python</span>
        <span className="ml-auto rounded border border-[var(--fl-accent)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--fl-accent)]">
          Run
        </span>
      </div>
      <p className="px-3 py-2 font-mono text-[12px] text-[var(--fl-text)]">
        print(&quot;hello world&quot;)
      </p>
      <div className="border-t border-[var(--fl-border)] px-3 py-2">
        <p className="font-mono text-[10.5px] text-[var(--fl-muted)]">
          — ran 2026-08-27 11:09 UTC · ok · 34ms
        </p>
        <p className="font-mono text-[12px] text-[var(--fl-text)]">hello world</p>
      </div>
    </div>
  );
}

export function CaptureArt() {
  return (
    <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
      <p className="truncate font-mono text-[11.5px] text-[var(--fl-muted)]">
        https://example.com/post
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--fl-text)]">
        [The post&rsquo;s real title]
        <span className="text-[var(--fl-muted)]">(https://example.com/post)</span>
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-[var(--fl-accent)]">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--fl-accent)]" />
        archived copy · web.archive.org
      </p>
    </div>
  );
}

export function FreshnessArt() {
  return (
    <div className="space-y-2">
      {[
        { note: "Deploy runbook", why: "mentions v14 · 8 months untouched", stale: true },
        { note: "How I think about scope", why: "nothing datable in it", stale: false },
      ].map((item) => (
        <div
          key={item.note}
          className={`rounded-lg border px-3 py-2 ${
            item.stale
              ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
              : "border-[var(--fl-border)] bg-[var(--fl-elevated)]"
          }`}
        >
          <p className="text-[12.5px] text-[var(--fl-text)]">{item.note}</p>
          <p className="truncate text-[11.5px] text-[var(--fl-muted)]">
            {item.stale ? "Worth re-reading — " : "Never stale — "}
            {item.why}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ReviewArt() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
          Pull request #42
        </p>
        <p className="text-[12.5px] text-[var(--fl-text)]">Update the deploy runbook</p>
        <p className="mt-1 font-mono text-[11.5px] text-[var(--fl-muted)]">
          notes:you/patch-1 → main
        </p>
      </div>
      <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
          Who wrote this line
        </p>
        {[
          { who: "you", when: "2 days ago" },
          { who: "priya", when: "last month" },
        ].map((row) => (
          <p key={row.who} className="truncate text-[11.5px] text-[var(--fl-muted)]">
            <span className="text-[var(--fl-accent)]">{row.who}</span> · {row.when}
          </p>
        ))}
      </div>
    </div>
  );
}

export function SearchArt() {
  return (
    <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
      <p className="mb-2.5 font-mono text-[12px] text-[var(--fl-muted)]">
        <span className="text-[var(--fl-accent)]">⌕</span> migration
      </p>
      {[
        { title: "Hiring plan", line: "…to keep the migration off my desk." },
        { title: "Platform notes", line: "…the migration runs in two phases…" },
      ].map((hit) => (
        <div key={hit.title} className="mb-2 last:mb-0">
          <p className="text-[12.5px] text-[var(--fl-text)]">{hit.title}</p>
          <p className="truncate text-[11.5px] text-[var(--fl-muted)]">
            {hit.line.split("migration")[0]}
            <mark className="rounded bg-[var(--fl-accent-soft)] px-0.5 text-[var(--fl-text)]">
              migration
            </mark>
            {hit.line.split("migration")[1]}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DesktopArt() {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 font-mono text-[12px]">
        <span className="text-[var(--fl-muted)]">$ </span>
        <span className="text-[var(--fl-text)]">xdg-open notes/q3-roadmap.md</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--fl-accent)] bg-[var(--fl-accent-soft)] px-3 py-2 text-[12.5px]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]" />
        <span className="min-w-0 flex-1 truncate text-[var(--fl-text)]">
          Open in ForkLeaf — ⌘S writes q3-roadmap.md
        </span>
      </div>
    </div>
  );
}

export function PublishArt() {
  return (
    <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
        Published
      </p>
      <p className="break-all font-mono text-[11.5px] text-[var(--fl-accent)]">
        you.github.io/notes/q3-roadmap.html
      </p>
      <p className="mt-2 text-[11.5px] text-[var(--fl-muted)]">
        A file in your repo, served by GitHub.
      </p>
    </div>
  );
}

export function ModesArt() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {[
        { label: "Rich", active: true },
        { label: "Split", active: false },
        { label: "Source", active: false },
      ].map((mode) => (
        <div
          key={mode.label}
          className={`rounded-lg border p-3 ${
            mode.active
              ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
              : "border-[var(--fl-border)] bg-[var(--fl-elevated)]"
          }`}
        >
          <p
            className={`mb-2.5 text-[11px] font-semibold uppercase tracking-wider ${
              mode.active ? "text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"
            }`}
          >
            {mode.label}
          </p>
          <span className="mb-1.5 block h-1.5 w-3/4 rounded-full bg-[var(--fl-border-strong)]" />
          <span className="mb-1.5 block h-1.5 w-full rounded-full bg-[var(--fl-border)]" />
          <span className="block h-1.5 w-2/3 rounded-full bg-[var(--fl-border)]" />
        </div>
      ))}
    </div>
  );
}

export function DiagramArt() {
  return (
    <svg
      viewBox="0 0 200 104"
      className="mx-auto w-full max-w-md"
      role="img"
      aria-label="A flowchart: Draft leads to PR, which leads to Merged or back through Revise to Draft"
    >
      {/* Edges are drawn from the edge of one box to the edge of the next, at
          shared centre lines, so a corner is a right angle and a join is a
          join. The previous version had its arithmetic off: the arrow out of PR
          started halfway down the box's right-hand side, dropped fourteen units
          and stopped four units short of Revise in mid-air. */}
      <g
        stroke="var(--fl-border-strong)"
        strokeWidth="1.25"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Draft → PR, and PR → Merged: straight, along the row's centre. */}
        <path d="M60 26h12" />
        <path d="M128 26h12" />
        {/* PR → Revise: straight down the shared centre. */}
        <path d="M100 40v22" />
        {/* Revise → Draft: out of the left edge, along, and up into Draft. */}
        <path d="M72 76H34V40" />
      </g>

      {/* Arrowheads, drawn rather than markered: a marker cannot inherit the
          stroke colour reliably across browsers, and these never move. */}
      <g fill="var(--fl-border-strong)">
        <path d="M72 26l-4.5-2.5v5z" />
        <path d="M140 26l-4.5-2.5v5z" />
        <path d="M100 62l-2.5-4.5h5z" />
        <path d="M34 40l-2.5 4.5h5z" transform="rotate(180 34 42.25)" />
      </g>

      {[
        { x: 8, y: 14, w: 52, label: "Draft", accent: false },
        { x: 74, y: 14, w: 52, label: "PR", accent: true },
        { x: 140, y: 14, w: 52, label: "Merged", accent: false },
        { x: 74, y: 62, w: 52, label: "Revise", accent: false },
      ].map((node) => (
        <g key={node.label}>
          <rect
            x={node.x}
            y={node.y}
            width={node.w}
            height={24}
            rx={7}
            fill={node.accent ? "var(--fl-accent-soft)" : "var(--fl-elevated)"}
            stroke={node.accent ? "var(--fl-accent)" : "var(--fl-border)"}
            strokeWidth="1.25"
          />
          <text
            x={node.x + node.w / 2}
            y={node.y + 16}
            textAnchor="middle"
            fontSize="10"
            fontWeight="500"
            fill={node.accent ? "var(--fl-accent)" : "var(--fl-muted)"}
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function OfflineArt() {
  return (
    <ul className="space-y-2 font-mono text-[12px]">
      {[
        { label: "sync-engine.md", state: "pushed" },
        { label: "storage.md", state: "queued" },
        { label: "2026-08-14.md", state: "queued" },
      ].map((row) => (
        <li
          key={row.label}
          className="flex items-center gap-2 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2"
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              row.state === "pushed" ? "bg-[var(--fl-accent)]" : "bg-[var(--fl-warn)]"
            }`}
          />
          <span className="min-w-0 flex-1 truncate text-[var(--fl-muted)]">{row.label}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--fl-muted)]">
            {row.state}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ConflictArt() {
  return (
    <div className="grid grid-cols-2 gap-2 text-[12px]">
      {[
        { label: "This device", accent: true },
        { label: "GitHub", accent: false },
      ].map((side) => (
        <div
          key={side.label}
          className={`rounded-lg border p-3 ${
            side.accent
              ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]"
              : "border-[var(--fl-border)] bg-[var(--fl-elevated)]"
          }`}
        >
          <p
            className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${
              side.accent ? "text-[var(--fl-accent)]" : "text-[var(--fl-muted)]"
            }`}
          >
            {side.label}
          </p>
          <span className="mb-1.5 block h-1.5 w-full rounded-full bg-[var(--fl-border-strong)]" />
          <span className="block h-1.5 w-1/2 rounded-full bg-[var(--fl-border)]" />
        </div>
      ))}
    </div>
  );
}

export function ExportArt() {
  return (
    <div className="flex flex-wrap gap-2">
      {[".md", ".pdf", ".html", ".docx", ".txt"].map((ext) => (
        <span
          key={ext}
          className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-1.5 font-mono text-[12px] text-[var(--fl-muted)]"
        >
          {ext}
        </span>
      ))}
    </div>
  );
}

export function FlashcardArt() {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)]">
      <p className="border-b border-[var(--fl-border)] px-3 py-2 font-mono text-[11.5px] text-[var(--fl-muted)]">
        Why is the sky blue? <span className="text-[var(--fl-accent)]">::</span> Rayleigh scattering
      </p>
      <div className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fl-muted)]">
          Due today
        </p>
        <p className="mt-1.5 font-serif text-[1.375rem] leading-tight text-[var(--fl-text)]">
          Why is the sky blue?
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Forgot", "Hard", "Good", "Easy"].map((grade) => (
            <span
              key={grade}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                grade === "Good"
                  ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)] text-[var(--fl-accent)]"
                  : "border-[var(--fl-border)] text-[var(--fl-muted)]"
              }`}
            >
              {grade}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Explain it back: what the reader remembered of a note, sentence by sentence. */
export function RecallArt() {
  const rows = [
    { text: "Light reactions split water", state: "Remembered" },
    { text: "Oxygen is released", state: "Remembered" },
    { text: "ATP powers the Calvin cycle", state: "Partly" },
    { text: "NADPH carries the electrons", state: "Missed" },
  ] as const;
  const tone = {
    Remembered: "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]",
    Partly: "border-[var(--fl-warn)] bg-[var(--fl-elevated)]",
    Missed: "border-[var(--fl-danger)] bg-[var(--fl-elevated)]",
  } as const;

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 64 64"
        className="h-20 w-20 shrink-0"
        role="img"
        aria-label="Three of four ideas remembered"
      >
        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--fl-border)" strokeWidth="6" />
        {/* 3 of 4 ideas: three quarters of the 163.4-unit circumference. */}
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke="var(--fl-accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="122.5 163.4"
          transform="rotate(-90 32 32)"
        />
        <text
          x="32"
          y="37"
          textAnchor="middle"
          fontSize="15"
          fontWeight="600"
          fill="var(--fl-text)"
        >
          3/4
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.text}
            className={`flex items-center justify-between gap-2 rounded-md border-l-2 px-2.5 py-1 text-[11.5px] ${tone[row.state]}`}
          >
            <span className="min-w-0 truncate text-[var(--fl-text)]">{row.text}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--fl-muted)]">
              {row.state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An assistant working in the notebook through the MCP server. */
export function McpArt() {
  return (
    <div className="space-y-2 font-mono text-[11.5px]">
      <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 text-[var(--fl-text)]">
        <span className="text-[var(--fl-muted)]">assistant → </span>search_notes(&quot;Q3
        roadmap&quot;)
      </div>
      <div className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 text-[var(--fl-text)]">
        <span className="text-[var(--fl-muted)]">assistant → </span>append_to_daily_note(…)
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--fl-accent)] bg-[var(--fl-accent-soft)] px-3 py-2 text-[var(--fl-text)]">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
        />
        <span className="min-w-0 truncate">commit 9e1b4c0 · Update daily/2026-10-12.md</span>
      </div>
    </div>
  );
}
