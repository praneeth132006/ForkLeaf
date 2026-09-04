import Link from "next/link";
import { AppPreview } from "./AppPreview";
import { GitHubGlyph } from "./Nav";
import { SectionLink } from "./SectionLink";

/**
 * The hero.
 *
 * It has to answer three questions before the visitor scrolls, in this order:
 * what is this, why is it different, and what happens if I press the button.
 *
 * 1. The display line makes the claim. It is set in Instrument Serif at a size
 *    that only works because it is short — resist lengthening it.
 * 2. One sentence says what the thing actually is, because "notes you own" is
 *    a promise and not a product.
 * 3. The button says what it costs and what it will ask for, next to itself.
 *    An unpriced button with an OAuth screen behind it is the single most
 *    common reason a developer closes the tab.
 *
 * What is deliberately *not* here is the capability list.
 *
 * Fifteen named capabilities used to sit between the paragraph and the button,
 * on the reasoning that a reader told only "notes in your own repo" would
 * assume they were being offered a text box over an API. The reasoning was
 * right and the remedy was wrong: fifteen pills read as texture rather than as
 * words, so the list that existed to be *read* was the one thing on the page
 * nobody read, and it pushed the button below the fold to do it.
 *
 * The inventory is a section of its own further down, grouped by the job each
 * capability belongs to, where a reader who wants it arrives having already
 * decided to look. Nothing was dropped in the move — the three capabilities
 * that were named only here (running a code block, archiving a web source,
 * line-by-line blame) are named there now.
 */

export function Hero({ githubAvailable }: { githubAvailable: boolean }) {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient field behind the copy. Two layers: a dot grid for texture and a
          wide soft glow for depth, both masked out well before they reach the
          text so nothing competes with the headline. */}
      <div
        aria-hidden="true"
        className="fl-dotgrid pointer-events-none absolute inset-x-0 top-0 h-[720px] opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_10%,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-260px] h-[560px] w-[1000px] -translate-x-1/2 rounded-full bg-[var(--fl-accent)] opacity-[0.09] blur-[150px]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        {/* ── Statement ─────────────────────────────────────────────────── */}
        <div className="fl-rise mx-auto max-w-3xl pb-2 pt-20 text-center md:pt-28">
          {/* The category, stated flatly. A serif headline about ownership is
              evocative and tells you nothing about what you are looking at. */}
          <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3.5 py-1.5 text-[12.5px] text-[var(--fl-muted)]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
            />
            Markdown notes, in your own GitHub repo
            <span className="hidden sm:inline">· open source</span>
          </p>

          <h1 className="font-serif text-[2.75rem] font-normal leading-[1] tracking-[-0.02em] text-[var(--fl-text)] sm:text-[4.25rem] sm:leading-[0.98] md:text-[5.5rem]">
            Notes that outlive
            <br />
            the app that made them
          </h1>

          {/* Two sentences, and they are the two that decide it: what the
              thing is, and where the writing ends up. Everything this used to
              add — the .md file, the local-first save, the commits under your
              own name — is answered by scrolling, and a reader who has not yet
              been given a reason to scroll will not read it here either. */}
          <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-[1.6] text-[var(--fl-muted)] sm:mt-7 sm:text-[17.5px] sm:leading-[1.62]">
            A full Markdown workspace — linked notes, offline search, a visual diagram studio, real
            version history — whose database is a{" "}
            <em className="not-italic text-[var(--fl-text)]">GitHub repository you already own</em>.
            Nothing is stored on our servers, and there is no ForkLeaf database to be locked out of.
          </p>

          {/* ── Call to action ──────────────────────────────────────────── */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {githubAvailable ? (
              <>
                <a href="/sign-in" className="fl-btn fl-btn-primary !rounded-full !px-6 !py-3.5">
                  <GitHubGlyph />
                  Continue with GitHub
                </a>
                <Link href="/editor" className="fl-btn fl-btn-ghost !rounded-full !px-6 !py-3.5">
                  Try it without an account
                </Link>
              </>
            ) : (
              <Link href="/editor" className="fl-btn fl-btn-primary !rounded-full !px-6 !py-3.5">
                Start writing
              </Link>
            )}
          </div>

          {/* The narrower-scope invitation used to sit above this line. It
              pointed at `/sign-in` — the same address as the button directly
              above it — so it was explanation rather than an affordance, and
              the explanation is given properly in the ownership section this
              line already links to. */}
          <p className="mt-4 text-[13px] text-[var(--fl-muted)]">
            {githubAvailable ? (
              <>
                Free forever · No card, no trial ·{" "}
                <SectionLink
                  hash="#ownership"
                  className="underline decoration-[var(--fl-border-strong)] underline-offset-[3px] transition-colors hover:text-[var(--fl-text)]"
                >
                  exactly what GitHub access this asks for
                </SectionLink>
              </>
            ) : (
              <>Free · Opens in your browser · No install, no account</>
            )}
          </p>
        </div>

        {/* ── Product ───────────────────────────────────────────────────── */}
        {/* Deliberately tall and cropped by the fold: the frame continuing past
            the bottom of the viewport is what makes the page feel worth
            scrolling. */}
        <div className="fl-rise pt-20 [animation-delay:140ms] md:pt-24">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
