"use client";

import Link from "next/link";
import { EVERYTHING } from "@/lib/plans";
import { SPONSOR_URL } from "@/lib/constants";
import { SectionHeading } from "./SectionHeading";

/**
 * Pricing — or rather, the absence of it.
 *
 * There are no tiers. Every feature ships to everyone, because the expensive
 * part of a notes app is storage and ForkLeaf has none: the notes live in the
 * user's own GitHub account. What is left to charge for would be access to
 * their own writing, which is the one thing this app exists to avoid.
 *
 * Funding is a sponsorship, asked for once, next to the thing it pays for.
 */
export function Pricing() {
  return (
    <section id="pricing" className="fl-anchor mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Pricing"
        title="Free. All of it. No tiers."
        body="Your notes sit in your own GitHub account, so there is no storage for us to charge you for and no paywall between you and your writing. If ForkLeaf ever disappears, your notes are already in your repository and keep working without it."
      />

      {/* One card, full width, with the sponsorship as a band underneath.
          It used to be a two-column grid, and the sponsorship column was a
          GitHub iframe: a fixed 225px box that cannot inherit the page's theme
          and cannot be styled, sitting in a card stretched to match the tall
          feature list beside it. The result was a pale widget floating in a
          well of dead space. A band has no height to match and nothing to
          embed. */}
      <div className="mt-12">
        <article className="fl-card flex flex-col border-[var(--fl-accent)] p-7 shadow-[var(--fl-shadow)] sm:p-9">
          <h3 className="text-[17px] font-semibold tracking-tight text-[var(--fl-text)]">
            Everything
          </h3>
          <p className="mt-1 text-[14px] text-[var(--fl-muted)]">
            The whole application, for everyone.
          </p>

          <p className="mt-5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight text-[var(--fl-text)]">
              Free
            </span>
            <span className="text-[14px] text-[var(--fl-muted)]">forever</span>
          </p>

          <Link
            href="/editor"
            className="fl-btn fl-btn-primary mt-6 w-full sm:w-auto sm:self-start sm:!px-8"
          >
            Start writing
          </Link>

          <ul className="mt-8 grid gap-x-8 gap-y-3 text-[14px] text-[var(--fl-muted)] sm:grid-cols-2 lg:grid-cols-3">
            {EVERYTHING.map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <Check />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <Sponsor />
    </section>
  );
}

/**
 * The sponsorship ask.
 *
 * Written in markup rather than embedded from github.com. The official card is
 * an iframe: it cannot inherit the page's tokens, cannot be sized to its own
 * content, and pulls a third-party frame into a page whose entire argument is
 * that nothing here phones home. A link and a button say the same thing, match
 * the theme, and cost nothing to load.
 *
 * A band rather than a card, so it reads as a footnote to the pricing above it
 * rather than as the second of two options.
 */
function Sponsor() {
  return (
    <aside className="mt-4 rounded-[18px] border border-[var(--fl-border)] bg-[var(--fl-elevated)]">
      <div className="flex flex-col gap-6 p-7 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <div className="flex gap-4">
          <span
            aria-hidden="true"
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] text-[var(--fl-accent)] sm:flex"
          >
            <HeartGlyph />
          </span>

          <div>
            <h3 className="text-[17px] font-semibold tracking-tight text-[var(--fl-text)]">
              Sponsor the work
            </h3>
            <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
              ForkLeaf is built by one person in the open. Sponsoring is entirely optional and buys
              you nothing extra — every feature is already yours, and always will be. It just means
              the work continues.
            </p>
          </div>
        </div>

        <a
          href={SPONSOR_URL}
          target="_blank"
          rel="noreferrer"
          className="fl-btn fl-btn-ghost shrink-0 !border-[var(--fl-border-strong)] bg-[var(--fl-surface)]"
        >
          <HeartGlyph className="h-4 w-4" />
          Sponsor on GitHub
        </a>
      </div>
    </aside>
  );
}

function HeartGlyph({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 16.5S3 12.4 3 7.9A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 7 1.9c0 4.5-7 8.6-7 8.6Z" />
    </svg>
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[var(--fl-accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2.5 8.5 3.5 3.5 7.5-8" />
    </svg>
  );
}
