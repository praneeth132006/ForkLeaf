import React from "react";
import { SectionHeading } from "./SectionHeading";

/**
 * ForkLeaf against the apps people actually have open.
 *
 * The section above this one compares *categories* — a hosted app, a local
 * folder, editing on github.com — which is the honest way to describe a
 * decision but not the way anybody asks the question. They ask "why not
 * Notion", and an answer that never says the word Notion reads like an answer
 * that cannot be given.
 *
 * So the products are named, and the table is written to be checkable: every
 * cell is something a reader can verify in an afternoon, and the row that
 * matters most — where the file ends up — is the first one. Their strengths
 * are in the table too, and the paragraph underneath says plainly what
 * ForkLeaf is worse at, because a comparison that finds no fault with itself
 * is an advertisement and gets read as one.
 *
 * Facts current as of writing; anything a vendor can change tomorrow (exact
 * prices, plan names) is deliberately not quoted, so this cannot quietly rot
 * into something untrue.
 */

const APPS = ["ForkLeaf", "Notion", "OneNote", "Obsidian", "Evernote"] as const;

type App = (typeof APPS)[number];

const ROWS: { criterion: string; note?: string; cells: Record<App, string> }[] = [
  {
    criterion: "Where a note ends up",
    note: "The thing everything else follows from.",
    cells: {
      ForkLeaf: "A .md file in a GitHub repository you own",
      Notion: "A row in Notion's database, on Notion's servers",
      OneNote: "A .one notebook in OneDrive",
      Obsidian: "A .md file in a folder on that device",
      Evernote: "A note in Evernote's cloud",
    },
  },
  {
    criterion: "Format",
    cells: {
      ForkLeaf: "Markdown — readable in any editor, for ever",
      Notion: "Blocks. Markdown export exists and loses things",
      OneNote: "A proprietary binary format",
      Obsidian: "Markdown",
      Evernote: "ENEX, an XML format only Evernote writes",
    },
  },
  {
    criterion: "History",
    cells: {
      ForkLeaf: "Every save is a git commit — diffs, blame, revert",
      Notion: "Page history, on paid plans, for a limited window",
      OneNote: "Recent versions, per page",
      Obsidian: "Nothing built in; a plugin or git of your own",
      Evernote: "Note history on paid plans",
    },
  },
  {
    criterion: "Sync",
    cells: {
      ForkLeaf: "git push, to a repository you already pay nothing for",
      Notion: "Theirs, included, and required",
      OneNote: "OneDrive, included",
      Obsidian: "A paid add-on, or a folder-sync tool you wire up",
      Evernote: "Theirs, limited on the free tier",
    },
  },
  {
    criterion: "Offline",
    cells: {
      ForkLeaf: "Fully — edits queue locally and push when you reconnect",
      Notion: "Partial, and not something to rely on",
      OneNote: "Yes",
      Obsidian: "Yes — it is a local app",
      Evernote: "Partial, on paid plans",
    },
  },
  {
    criterion: "Diagrams",
    cells: {
      ForkLeaf: "A Mermaid studio, and the output renders on GitHub too",
      Notion: "Mermaid in code blocks",
      OneNote: "Freehand drawing and shapes",
      Obsidian: "Mermaid, plus plugins",
      Evernote: "Sketches",
    },
  },
  {
    criterion: "Collaboration",
    cells: {
      ForkLeaf: "Pull requests and review, the way code is collaborated on",
      Notion: "Live multiplayer editing — genuinely excellent",
      OneNote: "Shared notebooks",
      Obsidian: "A paid add-on, or none",
      Evernote: "Shared notes",
    },
  },
  {
    criterion: "If the company disappears",
    cells: {
      ForkLeaf: "You still have a repository full of Markdown",
      Notion: "You have whatever you exported before it happened",
      OneNote: "Files in OneDrive, in a format only OneNote reads",
      Obsidian: "You still have your folder — same answer, and a good one",
      Evernote: "You have an ENEX file to find a converter for",
    },
  },
  {
    criterion: "Price",
    cells: {
      ForkLeaf: "Free and open source; bring your own repository",
      Notion: "Free tier, then per person per month",
      OneNote: "Free with a Microsoft account",
      Obsidian: "Free for personal use; sync and publish cost extra",
      Evernote: "Free tier with limits, then paid",
    },
  },
];

/** What each of them is best at, said without qualification. */
const CREDIT: { app: Exclude<App, "ForkLeaf">; strength: string }[] = [
  {
    app: "Notion",
    strength:
      "Databases, templates and real-time collaboration. If a team runs on a wiki with views and permissions, this is still the answer.",
  },
  {
    app: "OneNote",
    strength:
      "Handwriting, a stylus and free-form pages. Nothing here comes close for taking notes on a tablet in a lecture.",
  },
  {
    app: "Obsidian",
    strength:
      "The plugin ecosystem, the graph, and a decade of thought about linking. Your files stay yours there too — it is the closest neighbour on this page.",
  },
  {
    app: "Evernote",
    strength:
      "Web clipping and search over scanned documents, which it has been refining for years.",
  },
];

export function Comparison() {
  return (
    <section id="compare" className="fl-anchor mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Side by side"
        title="ForkLeaf, Notion, OneNote, Obsidian and Evernote"
        body="Nine questions worth asking before you move a decade of notes into anything. Their answers as well as ours."
      />

      {/* Wide tables scroll inside themselves; the page must never scroll
          sideways because of one. */}
      <div className="mt-12 overflow-x-auto rounded-2xl border border-[var(--fl-border)]">
        <table className="w-full min-w-[56rem] border-collapse text-left text-[13.5px]">
          <caption className="sr-only">
            How ForkLeaf compares with Notion, OneNote, Obsidian and Evernote
          </caption>
          <thead>
            <tr className="border-b border-[var(--fl-border)] bg-[var(--fl-elevated)]">
              <th scope="col" className="w-48 px-4 py-3 font-semibold text-[var(--fl-muted)]">
                <span className="text-[11px] uppercase tracking-[0.14em]">Question</span>
              </th>
              {APPS.map((app) => (
                <th
                  key={app}
                  scope="col"
                  className={`px-4 py-3 font-semibold ${
                    app === "ForkLeaf" ? "text-[var(--fl-accent)]" : "text-[var(--fl-text)]"
                  }`}
                >
                  {app}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.criterion} className="border-b border-[var(--fl-border)] last:border-0">
                <th scope="row" className="px-4 py-4 align-top font-medium text-[var(--fl-text)]">
                  {row.criterion}
                  {row.note && (
                    <span className="mt-1 block text-[12px] font-normal leading-snug text-[var(--fl-muted)]">
                      {row.note}
                    </span>
                  )}
                </th>
                {APPS.map((app) => (
                  <td
                    key={app}
                    className={`px-4 py-4 align-top leading-relaxed ${
                      app === "ForkLeaf"
                        ? "bg-[var(--fl-accent-soft)] text-[var(--fl-text)]"
                        : "text-[var(--fl-muted)]"
                    }`}
                  >
                    {row.cells[app]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Credit where it is due ─────────────────────────────────────── */}
      <div className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {CREDIT.map((entry) => (
          <div key={entry.app} className="flex gap-3.5">
            <span
              aria-hidden="true"
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
            />
            <div>
              <p className="text-[15.5px] font-semibold tracking-tight text-[var(--fl-text)]">
                What {entry.app} does better
              </p>
              <p className="mt-1.5 max-w-md text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
                {entry.strength}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-12 max-w-3xl text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
        And what ForkLeaf is worse at, so you hear it here rather than a week in: there is no
        real-time multiplayer cursor, no mobile app beyond the browser, no handwriting, and setting
        it up means having a GitHub account and picking a repository. It is a writing tool for
        people who want their notes to be files — if what you need is a shared workspace with
        permissions and databases, the row above is telling you to use Notion.
      </p>
    </section>
  );
}
