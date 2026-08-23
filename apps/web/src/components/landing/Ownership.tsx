import Link from "next/link";
import { SectionHeading } from "./SectionHeading";

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
    <section
      id="ownership"
      className="fl-anchor border-y border-[var(--fl-border)] bg-[var(--fl-elevated)]"
    >
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

        {/* ── What the OAuth screen will ask for ─────────────────────── */}
        {/* Put here, in the open, because the sign-in screen is where a
            security-minded reader decides whether to trust any of the above —
            and "grant access to all your repositories" is what they see. An
            explanation that only exists in the docs arrives after they have
            already closed the tab. */}
        <div className="mt-12 rounded-2xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-6 sm:p-7">
          <h3 className="text-[17px] font-semibold tracking-tight text-[var(--fl-text)]">
            Before you press sign in: what GitHub will ask you to grant
          </h3>

          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[var(--fl-muted)]">
            The hosted app requests the{" "}
            <code className="rounded bg-[var(--fl-elevated)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--fl-text)]">
              repo
            </code>{" "}
            scope. That is broad, and we would rather say so than have you discover it on the
            consent screen. It is the narrowest <em>classic</em> scope GitHub offers that can write
            to a private repository — there is no &ldquo;only this one repo&rdquo; classic scope to
            ask for instead.
          </p>

          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-[13.5px] font-semibold text-[var(--fl-text)]">
                What it is used for
              </dt>
              <dd className="mt-1 text-[13.5px] leading-relaxed text-[var(--fl-muted)]">
                Reading and committing Markdown files in the repositories you connect. Nothing else
                is ever fetched.
              </dd>
            </div>
            <div>
              <dt className="text-[13.5px] font-semibold text-[var(--fl-text)]">
                Where the token lives
              </dt>
              <dd className="mt-1 text-[13.5px] leading-relaxed text-[var(--fl-muted)]">
                Encrypted in an httpOnly cookie on the server. It is never sent to the browser and
                never appears in a URL.
              </dd>
            </div>
            <div>
              <dt className="text-[13.5px] font-semibold text-[var(--fl-text)]">
                If that is too much
              </dt>
              <dd className="mt-1 text-[13.5px] leading-relaxed text-[var(--fl-muted)]">
                Run your own copy with a GitHub App and grant it a single repository — or use
                ForkLeaf with no account at all, on this device only.
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/docs/self-hosting#github-app"
              className="fl-btn fl-btn-ghost !py-2 !text-[13.5px]"
            >
              Set it up with a GitHub App
            </Link>
            <Link href="/editor" className="fl-btn fl-btn-ghost !py-2 !text-[13.5px]">
              Try it without an account
            </Link>
          </div>
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
