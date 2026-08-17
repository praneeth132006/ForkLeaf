import React from "react";
import Link from "next/link";
import { SectionHeading } from "./HowItWorks";

const POINTS = [
  {
    title: "No database of ours",
    body: "There is no ForkLeaf notes table. Notes are files in your repository, and the only thing we ever hold is your session cookie.",
  },
  {
    title: "Your token never reaches the browser",
    body: "The GitHub access token is encrypted into an httpOnly cookie the server alone can open. Every API call is proxied, so no script on the page can read it.",
  },
  {
    title: "Leaving costs nothing",
    body: "Clone the repo. That is the export. Your notes were already plain Markdown in a normal git history the whole time.",
  },
] as const;

const LINKS = [
  { label: "How it works", href: "/docs/how-it-works" },
  { label: "Security model", href: "/docs/security" },
  { label: "Self-hosting", href: "/docs/self-hosting" },
] as const;

/**
 * The trust section: the part of the pitch that is about what ForkLeaf *cannot*
 * do to you, which for a notes app is most of the pitch.
 */
export function Ownership() {
  return (
    <section id="ownership" className="border-y border-[var(--fl-border)] bg-[var(--fl-elevated)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-24">
        <SectionHeading
          eyebrow="Ownership"
          title="Most notes apps ask you to trust them. This one is arranged so you don't have to."
        />

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {POINTS.map((point) => (
            <div key={point.title}>
              <h3 className="text-[17px] font-semibold tracking-tight text-[var(--fl-text)]">
                {point.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--fl-muted)]">
                {point.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3.5 py-2 text-[14px] text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
            >
              {link.label} →
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
