import React from "react";
import Link from "next/link";
import { SectionHeading } from "./SectionHeading";

/**
 * The last five objections.
 *
 * Everything above this section is an argument. This is the part where somebody
 * who has been convinced still does not click, because of one unanswered
 * question they are slightly embarrassed to have. Answering those on the page
 * is worth more than another feature card.
 *
 * Native `<details>` rather than a bespoke accordion: it is keyboard-operable,
 * screen-reader-correct and findable with the browser's own Find on page,
 * without a line of JavaScript.
 */

const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Do I have to connect GitHub?",
    a: (
      <>
        No. The editor works with no account at all — notes are stored on that device and nothing
        leaves it. Connecting GitHub is what adds sync, history and reading the same notes on
        another machine. You can start without it and connect later;{" "}
        <Link href="/editor" className="fl-link">
          open the editor
        </Link>{" "}
        and see.
      </>
    ),
  },
  {
    q: "What exactly is ForkLeaf asking permission to do?",
    a: (
      <>
        The hosted app requests GitHub&rsquo;s <code className="fl-code">repo</code> scope, which is
        broad — it is the narrowest classic scope that can write to a private repository. It is used
        only to read and commit Markdown in the repositories you connect. The token is encrypted
        into an httpOnly cookie the browser cannot read. If that is more than you want to grant,{" "}
        <Link href="/docs/self-hosting#github-app" className="fl-link">
          run your own copy with a GitHub App
        </Link>{" "}
        scoped to a single repository.
      </>
    ),
  },
  {
    q: "What happens to my notes if ForkLeaf shuts down?",
    a: (
      <>
        Nothing. They are Markdown files in a repository on your own GitHub account, in a normal git
        history. Clone it and carry on in any editor that reads text. This is the entire reason the
        app is built this way.
      </>
    ),
  },
  {
    q: "Is it really free, and what is the catch?",
    a: (
      <>
        Free, all of it, no tiers. The expensive part of a notes app is storage, and ForkLeaf has
        none — your notes sit in your GitHub account, not ours. The project is open source under
        Apache-2.0 and funded by optional sponsorship. There is no paid plan being held back.
      </>
    ),
  },
  {
    q: "Will it work with the notes I already have?",
    a: (
      <>
        If they are Markdown, yes — point ForkLeaf at a repository that already has{" "}
        <code className="fl-code">.md</code> files in it and it reads them where they are, including
        subdirectories and existing front matter. Obsidian-style{" "}
        <code className="fl-code">[[wikilinks]]</code> are the dialect it speaks natively.
      </>
    ),
  },
  {
    q: "Can I use it offline?",
    a: (
      <>
        That is the default. Every keystroke is written to IndexedDB on your device first; the
        commit queue drains to GitHub when there is a network again, and the status bar always says
        plainly what is saved where.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" className="fl-anchor mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Before you sign in"
        title="The questions worth answering first"
        body="The rest are in the documentation, which is written for the same reader."
      />

      {/* `items-start` matters: grid items stretch to their row's height by
          default, so opening one card inflated the closed card beside it into a
          tall box of empty space. Each card should be as tall as its own
          content and no taller. */}
      <div className="mt-12 grid items-start gap-3 lg:grid-cols-2">
        {QUESTIONS.map((item) => (
          <details
            key={item.q}
            className="fl-card group p-5 transition-colors hover:border-[var(--fl-border-strong)] [&[open]]:border-[var(--fl-border-strong)]"
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[15.5px] font-medium tracking-tight text-[var(--fl-text)] [&::-webkit-details-marker]:hidden">
              {item.q}
              <span
                aria-hidden="true"
                className="mt-1 shrink-0 text-[var(--fl-muted)] transition-transform duration-200 group-open:rotate-45"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </span>
            </summary>

            <p className="mt-3 text-[14.5px] leading-[1.65] text-[var(--fl-muted)]">{item.a}</p>
          </details>
        ))}
      </div>

      <p className="mt-8 text-[14px] text-[var(--fl-muted)]">
        More in the{" "}
        <Link href="/docs/faq" className="fl-link">
          full FAQ
        </Link>
        , the{" "}
        <Link href="/docs/security" className="fl-link">
          security model
        </Link>{" "}
        and{" "}
        <Link href="/docs/privacy-and-data" className="fl-link">
          what data is stored
        </Link>
        .
      </p>
    </section>
  );
}
