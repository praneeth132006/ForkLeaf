import React from "react";
import Link from "next/link";

import { COMPARISON_APPS as APPS, COMPARISON_ROWS as ROWS, COMPETITORS } from "@/lib/comparisons";

/**
 * ForkLeaf against the apps people actually have open.
 *
 * The section above this one compares *categories* — a hosted app, a local
 * folder, editing on github.com — which is an honest way to describe a
 * decision but not the way anybody asks the question. They ask "why not
 * Notion", and an answer that never says the word Notion reads like an answer
 * that cannot be given.
 *
 * The rows themselves live in `lib/comparisons`, shared with the
 * `/compare/[slug]` pages, so the table and the per-app pages cannot disagree.
 * The row that matters most — where the file ends up — is first, because
 * every other row follows from it, and the four points underneath say what the
 * rows add up to rather than leaving the reader to work it out.
 */

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

/**
 * The named-products half of the "why this" argument.
 *
 * A block rather than a section — {@link Why} owns the heading — but it keeps
 * `id="compare"`, because the nav has always pointed at the table itself and
 * a reader who clicks "Compare" wants the rows, not the paragraph three
 * screens above them.
 */
export function ComparisonBlock() {
  return (
    <>
      <div className="mt-20 border-t border-[var(--fl-border)] pt-12">
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fl-text)]">
          And by name
        </h3>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--fl-muted)]">
          Nine questions to ask before you put a decade of thinking somewhere. Notion, OneNote,
          Obsidian and Evernote answer them too — these are their answers, not ours about them.
        </p>
      </div>

      {/* Wide tables scroll inside themselves; the page must never scroll
          sideways because of one. */}
      <div
        id="compare"
        className="fl-anchor mt-8 overflow-x-auto rounded-2xl border border-[var(--fl-border)]"
      >
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

      <p className="mt-6 text-[14.5px] text-[var(--fl-muted)]">
        One at a time, with how to move across:{" "}
        {COMPETITORS.map((competitor, index) => (
          <React.Fragment key={competitor.slug}>
            {index > 0 && " · "}
            <Link href={`/compare/${competitor.slug}`} className="fl-link">
              ForkLeaf vs {competitor.name}
            </Link>
          </React.Fragment>
        ))}
      </p>
    </>
  );
}
