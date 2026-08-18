"use client";

import Link from "next/link";
import { EVERYTHING } from "@/lib/plans";
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
    <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-24">
      <SectionHeading
        eyebrow="Pricing"
        title="Free. All of it. No tiers."
        body="Your notes sit in your own GitHub account, so there is no storage for us to charge you for and no paywall between you and your writing. If ForkLeaf ever disappears, your notes are already in your repository and keep working without it."
      />

      <div className="mt-12 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <article className="fl-card flex flex-col border-[var(--fl-accent)] p-7 shadow-[var(--fl-shadow)]">
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

          <Link href="/editor" className="fl-btn fl-btn-primary mt-6 w-full">
            Start writing
          </Link>

          <ul className="mt-7 grid gap-2.5 text-[14px] text-[var(--fl-muted)] sm:grid-cols-2">
            {EVERYTHING.map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <Check />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </article>

        <Sponsor />
      </div>
    </section>
  );
}

/**
 * The sponsorship ask.
 *
 * GitHub's own card is an iframe, which cannot inherit the page's theme and
 * cannot be styled — so it sits inside a card that carries the framing, and the
 * iframe supplies only the button and the tier count.
 */
function Sponsor() {
  return (
    <article className="fl-card flex flex-col p-7">
      <h3 className="text-[17px] font-semibold tracking-tight text-[var(--fl-text)]">
        Sponsor the work
      </h3>
      <p className="mt-1 text-[14px] text-[var(--fl-muted)]">
        ForkLeaf is built by one person in the open. Sponsoring is entirely optional and buys you
        nothing extra — every feature is already yours. It just means the work continues.
      </p>

      {/* GitHub fixes the card at 225px and fills most of it with nothing when
          there are no tiers to show. The frame is clipped to the height its
          content actually occupies rather than left as a well of dead space. */}
      <div className="mt-6 h-[150px] overflow-hidden rounded-xl border border-[var(--fl-border)]">
        <iframe
          src="https://github.com/sponsors/praneeth132006/card"
          title="Sponsor praneeth132006"
          height="225"
          width="600"
          loading="lazy"
          className="block w-full"
          style={{ border: 0 }}
        />
      </div>
    </article>
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
