import Link from "next/link";
import { ForkLeafMark } from "@/components/Brand";
import { GitHubGlyph } from "./Nav";

/**
 * The closing ask.
 *
 * Every colour here used to be a hardcoded green from a palette the app no
 * longer uses, which meant this panel ignored both the theme and the accent the
 * user had chosen — the one block on the page that did not change when they
 * changed it. It reads from the tokens now like everything else.
 *
 * The reassurance line under the buttons is doing real work: this is the second
 * time a visitor is being asked to sign in, and the answer to "what am I
 * agreeing to" has to be next to the button, not four sections up.
 */
export function CallToAction({ githubAvailable }: { githubAvailable: boolean }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-8 py-16 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-[640px] -translate-x-1/2 rounded-full bg-[var(--fl-accent)] opacity-[0.16] blur-[110px]"
        />

        <div className="relative">
          <span className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] text-[var(--fl-accent)]">
            <ForkLeafMark className="h-6 w-6" />
          </span>

          <h2 className="mx-auto max-w-xl font-serif text-[2.25rem] font-normal leading-[1.05] tracking-[-0.02em] text-[var(--fl-text)] sm:text-[3rem]">
            Write the first note. It is a commit by the time you look up.
          </h2>

          <p className="mx-auto mt-5 max-w-lg text-[16px] leading-relaxed text-[var(--fl-muted)]">
            Free, open source, and stored in a repository you already own. Nothing to install and
            nothing to migrate off later.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {githubAvailable && (
              <a href="/api/auth/github" className="fl-btn fl-btn-primary !rounded-full !px-6">
                <GitHubGlyph />
                Continue with GitHub
              </a>
            )}
            <Link href="/editor" className="fl-btn fl-btn-ghost !rounded-full !px-6">
              Open the editor
            </Link>
          </div>

          <p className="mt-4 text-[13px] text-[var(--fl-muted)]">
            No card. No trial. Your notes never touch our servers.
          </p>
        </div>
      </div>
    </section>
  );
}
