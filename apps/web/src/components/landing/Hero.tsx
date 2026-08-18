import Link from "next/link";
import { AppPreview } from "./AppPreview";
import { GitHubGlyph } from "./Nav";

/**
 * The hero.
 *
 * One enormous claim, one sentence explaining it, one button. Everything the
 * previous version carried alongside that — a "New" pill, two competing
 * call-to-action buttons of equal weight, a licence badge, a caveat about local
 * storage — split the visitor's attention three ways before they had decided
 * whether they cared.
 *
 * The display line is set in Instrument Serif at a size that only works because
 * it is short. Resist lengthening it.
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
        <div className="fl-rise mx-auto max-w-3xl pb-2 pt-24 text-center md:pt-32">
          <h1 className="font-serif text-[3.5rem] font-normal leading-[0.98] tracking-[-0.02em] text-[var(--fl-text)] sm:text-[5rem] md:text-[6rem]">
            Notes you own
          </h1>

          <p className="mx-auto mt-7 max-w-lg text-[17px] leading-[1.65] text-[var(--fl-muted)]">
            ForkLeaf is a Markdown editor that writes straight into a GitHub repository you already
            have. Every note is a real file. Every save is a real commit.
          </p>

          <div className="mt-9 flex justify-center">
            {githubAvailable ? (
              <a
                href="/api/auth/github"
                className="fl-btn fl-btn-primary !rounded-full !px-6 !py-3.5"
              >
                <GitHubGlyph />
                Continue with GitHub
              </a>
            ) : (
              <Link href="/editor" className="fl-btn fl-btn-primary !rounded-full !px-6 !py-3.5">
                Start writing
              </Link>
            )}
          </div>

          <p className="mt-4 text-[13px] text-[var(--fl-muted)]">
            {githubAvailable ? (
              <>
                Free · Opens in your browser ·{" "}
                <Link
                  href="/editor"
                  className="underline decoration-[var(--fl-border-strong)] underline-offset-[3px] transition-colors hover:text-[var(--fl-text)]"
                >
                  or try it without an account
                </Link>
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
        <div className="fl-rise pt-24 [animation-delay:140ms] md:pt-32">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
