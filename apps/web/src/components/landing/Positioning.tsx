import React from "react";
import { SectionHeading } from "./SectionHeading";

/**
 * Where ForkLeaf sits.
 *
 * Everything else on this page describes the product. This section describes
 * the *decision* — the one a reader is actually making, which is not "is this
 * good" but "is this better than the three things I already have open".
 *
 * Written as an honest comparison rather than a competitor table with red
 * crosses in it. Every alternative here is a reasonable choice that some people
 * should keep using, and saying so is what makes the column about ForkLeaf
 * worth believing.
 */

const COMPARISONS = [
  {
    them: "A hosted notes app",
    theirStrength: "Beautiful, syncs everywhere, and someone else runs it.",
    theCatch:
      "Your writing lives in their database, in their format, behind their pricing. The export button is a promise you cannot test until you need it.",
    ours: "Your notes are already plain files in your own repository. There is no export, because there was never an import.",
  },
  {
    them: "A local folder of Markdown",
    theirStrength: "Genuinely yours, fast, and nothing can take it away.",
    theCatch:
      "It is one folder on one machine. Syncing it, versioning it and reading it on your phone are three problems you now own.",
    ours: "The same plain files, with git doing the syncing and the history, and a real editor on every device with a browser.",
  },
  {
    them: "Editing Markdown on GitHub",
    theirStrength: "The storage is already right — it is the repository itself.",
    theCatch:
      "No links between notes, no search worth the name, no diagrams you can see, and nothing at all when the train goes into a tunnel.",
    ours: "Wikilinks, backlinks, full-text search, a visual diagram builder, and an editor that keeps working offline.",
  },
] as const;

const AUDIENCES = [
  {
    who: "Engineers who already live in git",
    why: "Your notes end up in the same place as your code, reviewed with the same tools, and `git log` finally covers your thinking as well as your commits.",
  },
  {
    who: "Anyone who has been burned by a shutdown",
    why: "The failure mode of ForkLeaf disappearing is that you keep a repository full of Markdown files. That is the whole disaster.",
  },
  {
    who: "People writing documentation in the open",
    why: "The notes and the docs are the same files. Propose a change as a pull request; publish a page straight to GitHub Pages.",
  },
  {
    who: "Anyone who thinks in diagrams",
    why: "A Mermaid studio that does not make you learn Mermaid first — and the output renders on GitHub, in your README, everywhere.",
  },
] as const;

export function Positioning() {
  return (
    <section id="why" className="mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Where this fits"
        title="You already have somewhere to put notes. Here is the honest case for moving."
        body="Three reasonable alternatives, what each is genuinely good at, and the specific thing ForkLeaf does differently."
      />

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {COMPARISONS.map((row) => (
          <article key={row.them} className="fl-card flex flex-col p-6">
            <h3 className="text-[16px] font-semibold tracking-tight text-[var(--fl-text)]">
              {row.them}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--fl-muted)]">
              {row.theirStrength}
            </p>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
              The catch
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--fl-muted)]">
              {row.theCatch}
            </p>

            <div className="mt-5 flex-1 rounded-xl border border-[var(--fl-accent)]/35 bg-[var(--fl-accent-soft)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-accent)]">
                With ForkLeaf
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--fl-text)]">{row.ours}</p>
            </div>
          </article>
        ))}
      </div>

      {/* ── Who it is for ──────────────────────────────────────────────── */}
      <div className="mt-16 border-t border-[var(--fl-border)] pt-12">
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fl-text)]">
          It is probably for you if…
        </h3>

        <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {AUDIENCES.map((audience) => (
            <div key={audience.who} className="flex gap-3.5">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
              />
              <div>
                <dt className="text-[15.5px] font-semibold tracking-tight text-[var(--fl-text)]">
                  {audience.who}
                </dt>
                <dd className="mt-1.5 max-w-md text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
                  {audience.why}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
