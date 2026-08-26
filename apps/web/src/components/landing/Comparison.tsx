import React from "react";
import { SectionHeading } from "./SectionHeading";

/**
 * ForkLeaf against the apps people actually have open.
 *
 * The section above this one compares *categories* — a hosted app, a local
 * folder, editing on github.com — which is an honest way to describe a
 * decision but not the way anybody asks the question. They ask "why not
 * Notion", and an answer that never says the word Notion reads like an answer
 * that cannot be given.
 *
 * So the products are named and the table is written to be checked: every cell
 * is something a reader can verify in an afternoon, which is the only kind of
 * claim worth making about a competitor. The row that matters most — where the
 * file ends up — is first, because every other row follows from it, and the
 * four points underneath say what the rows add up to rather than leaving the
 * reader to work it out.
 *
 * Accurate about the alternatives, and unapologetic about the conclusion.
 * Nothing here is a dig at a good product; the argument is that a note you own
 * outright beats a note you have excellent access to, and the table is how
 * that gets shown rather than asserted. Anything a vendor can change tomorrow
 * — exact prices, plan names — is deliberately not quoted, so this cannot rot
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
      ForkLeaf: "A Mermaid studio; the diagram renders on GitHub as well",
      Notion: "Mermaid in code blocks",
      OneNote: "Freehand drawing and shapes",
      Obsidian: "Mermaid, plus plugins",
      Evernote: "Sketches",
    },
  },
  {
    criterion: "Collaboration",
    cells: {
      ForkLeaf: "Pull requests and review — proposed, discussed, then merged",
      Notion: "Live multiplayer editing — genuinely excellent",
      OneNote: "Shared notebooks",
      Obsidian: "A paid add-on, or none",
      Evernote: "Shared notes",
    },
  },
  {
    criterion: "If the company disappears",
    cells: {
      ForkLeaf: "Nothing happens. The notes were never here",
      Notion: "You have whatever you exported before it happened",
      OneNote: "Files in OneDrive, in a format only OneNote reads",
      Obsidian: "You still have your folder — same answer, and a good one",
      Evernote: "You have an ENEX file to find a converter for",
    },
  },
  {
    criterion: "Price",
    cells: {
      ForkLeaf: "Free, open source, and no account to close",
      Notion: "Free tier, then per person per month",
      OneNote: "Free with a Microsoft account",
      Obsidian: "Free for personal use; sync and publish cost extra",
      Evernote: "Free tier with limits, then paid",
    },
  },
];

/**
 * What the table adds up to.
 *
 * Four claims rather than a shrug, because the table's whole job is to lead
 * somewhere: a reader who has just compared nine rows is asking "so what", and
 * "it depends on your needs" is the answer that loses them. Each one is a
 * statement the row above it can be checked against.
 */
const ARGUMENTS: { title: string; body: string }[] = [
  {
    title: "The file is the product",
    body: "Everywhere else the file is an export — a lossy copy you make when you are already leaving. Here it is the original, written the moment you stop typing, readable by every tool that has ever opened a text file.",
  },
  {
    title: "History you did not have to buy",
    body: "Not a version panel with a retention window. Real commits: what changed, when, why, and the ability to bring back a paragraph you deleted in March. That is a feature nobody else can sell you, because it is git.",
  },
  {
    title: "Nothing to migrate, ever again",
    body: "The last migration you do is the one into a repository. Change your mind about ForkLeaf and your notes do not move — you just open the same folder in something else. That is what makes trying this cheap.",
  },
  {
    title: "Your notes go where your work already lives",
    body: "Beside the code, in the review flow your team already runs, published to GitHub Pages when you want them read. No integration, no connector, no export step: the same repository, the same pull request, the same history.",
  },
];

export function Comparison() {
  return (
    <section id="compare" className="fl-anchor mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Side by side"
        title="Every other notes app is a rented room. This one is a deed."
        body="Nine questions to ask before you put a decade of thinking somewhere. Notion, OneNote, Obsidian and Evernote answer them too — these are their answers, not ours about them."
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

      {/* ── The argument the table is making ───────────────────────────── */}
      <div className="mt-16 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {ARGUMENTS.map((point) => (
          <div key={point.title} className="flex gap-3.5">
            <span
              aria-hidden="true"
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
            />
            <div>
              <p className="text-[15.5px] font-semibold tracking-tight text-[var(--fl-text)]">
                {point.title}
              </p>
              <p className="mt-1.5 max-w-md text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
                {point.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-14 max-w-3xl text-[16px] leading-relaxed text-[var(--fl-text)]">
        Every app in that table can hold your notes today. One of them still can in ten years
        without your permission, your payment or your password — because it is not an app holding
        them at all. It is a folder of Markdown in a repository with your name on it, and ForkLeaf
        is the window you happen to be reading it through.
      </p>
    </section>
  );
}
