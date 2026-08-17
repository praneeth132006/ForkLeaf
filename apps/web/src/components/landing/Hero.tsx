import React from "react";
import Link from "next/link";
import { AppPreview } from "./AppPreview";
import { GitHubGlyph } from "./Nav";

/**
 * The hero.
 *
 * One claim, stated plainly, then the product. Everything the old hero carried
 * that was not that — the licence badge, the "no account needed" caveat, the
 * self-hosting note — has moved to the sections that are actually about those
 * things. A visitor should be able to answer "what is this and do I want it?"
 * without scrolling.
 */
export function Hero({ githubAvailable }: { githubAvailable: boolean }) {
  return (
    <section className="relative overflow-hidden">
      {/* Decorative field behind the copy: a dot grid faded out at the edges so
          it never competes with the text sitting on top of it. */}
      <div
        aria-hidden="true"
        className="fl-dotgrid pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-[0.55] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_20%,transparent_75%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-180px] h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[var(--fl-accent)] opacity-[0.07] blur-[130px]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-20 md:pt-28">
        <div className="fl-rise mx-auto max-w-3xl text-center">
          <a
            href="#how"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--fl-border)] bg-[var(--fl-surface)] py-1 pl-1 pr-3.5 text-[13px] text-[var(--fl-muted)] transition-colors hover:border-[var(--fl-border-strong)]"
          >
            <span className="rounded-full bg-[var(--fl-accent-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fl-accent)]">
              New
            </span>
            Your notes are commits now
          </a>

          <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.06] tracking-[-0.03em] text-[var(--fl-text)] sm:text-6xl">
            The notes app that
            <br className="hidden sm:block" />{" "}
            <span className="font-serif font-normal italic text-[var(--fl-accent)]">you</span> own
            the database of.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-[var(--fl-muted)]">
            ForkLeaf is a Markdown editor whose storage is a GitHub repository you already have.
            Every note is a real <code className="font-mono text-[15px]">.md</code> file. Every save
            is a real commit. Nothing lives on a server we run.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {githubAvailable ? (
              <a href="/api/auth/github" className="fl-btn fl-btn-primary">
                <GitHubGlyph />
                Continue with GitHub
              </a>
            ) : (
              <Link href="/editor" className="fl-btn fl-btn-primary">
                Start writing
              </Link>
            )}
            <Link href="/editor" className="fl-btn fl-btn-ghost">
              Try it without an account
            </Link>
          </div>

          <p className="mt-4 text-[13px] text-[var(--fl-muted)]">
            Free and open source · Works offline · No note ever touches our servers
          </p>
        </div>

        <div className="fl-rise mt-16 [animation-delay:120ms]">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
