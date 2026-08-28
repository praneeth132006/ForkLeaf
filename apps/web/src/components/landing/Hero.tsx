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
 * 2. The paragraph under it says what the thing actually is, in the plainest
 *    words available, because "notes you own" is a promise and not a product.
 * 3. The chips name the capabilities, because somebody reading a headline about
 *    ownership still does not know whether this can draw a diagram.
 * 4. The button says what it costs and what it will ask for, next to itself.
 *    An unpriced button with an OAuth screen behind it is the single most
 *    common reason a developer closes the tab.
 */

/**
 * Named capabilities, in the order a writer would meet them.
 *
 * The list is long on purpose. "Notes in your own repo" is a storage decision,
 * and a reader who has only been told that is entitled to assume they are
 * being offered a text box over an API — so the chips say, before anybody
 * scrolls, that this is a full notebook: it links, it searches, it draws, it
 * remembers, it publishes, and it opens the files already on your disk.
 *
 * Every one of these is in the repository today. Nothing aspirational goes in
 * this list; the moment one entry turns out to be a plan, the reader is right
 * to stop believing the other eleven.
 */
const CAPABILITIES = [
  "Rich, split & source editing",
  "[[Wikilinks]] & backlinks",
  "Offline full-text search",
  "Visual Mermaid studio",
  "Real commit history",
  "Version compare & restore",
  "Conflicts shown, never merged",
  "Pull requests from the editor",
  "Publish to GitHub Pages",
  "PDF, Word & HTML export",
  "Opens the .md files on your disk",
  "Runs the code in your notes",
  "Web sources, archived",
  "Line-by-line blame",
  "Works offline",
] as const;

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

          <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-[1.6] text-[var(--fl-muted)] sm:mt-7 sm:text-[17.5px] sm:leading-[1.62]">
            ForkLeaf is a full Markdown workspace — linked notes, offline search, a visual diagram
            studio, real version history, exports and publishing — and its database is a{" "}
            <em className="not-italic text-[var(--fl-text)]">GitHub repository you already own</em>.
            Every note is a plain{" "}
            <code className="font-mono text-[15px] text-[var(--fl-text)]">.md</code> file. It saves
            to your device as you type, then turns those edits into real commits under your own
            name. Nothing is stored on our servers, and there is no ForkLeaf database to be locked
            out of.
          </p>

          <ul className="mx-auto mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[12.5px] text-[var(--fl-muted)]">
            {CAPABILITIES.map((item) => (
              <li
                key={item}
                className="rounded-full border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-1"
              >
                {item}
              </li>
            ))}
          </ul>

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

          {githubAvailable && (
            /* Said here rather than discovered on GitHub's own consent screen.
               The default grant covers every repository the account can reach,
               which is a great deal to hand a notes app — so the narrower one
               is offered next to it instead of being a thing you would have to
               know to ask for. */
            <p className="mt-3 text-[12.5px] text-[var(--fl-muted)]">
              Keeping notes in public repositories?{" "}
              <a href="/sign-in" className="fl-link">
                Grant public-repository access only
              </a>
              .
            </p>
          )}

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
