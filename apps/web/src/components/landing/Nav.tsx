import Link from "next/link";
import { ForkLeafLogo } from "@/components/Brand";
import { REPO_URL } from "@/lib/constants";
import { ThemeToggle } from "./ThemeToggle";
import { SectionLink } from "./SectionLink";

/**
 * Landing navigation.
 *
 * Sticky with a blurred backdrop so the hero's dot grid scrolls under it rather
 * than colliding with the links.
 *
 * The section links go through `SectionLink` because this header is rendered on
 * every page, not just the home page. Written as bare `#features` they did
 * nothing at all from `/terms`, `/privacy` and `/docs` — the fragment resolved
 * against a page that has no such section, so the click only changed the URL.
 */

const SECTIONS = [
  { hash: "#how", label: "How it works" },
  { hash: "#toolkit", label: "What it does" },
  { hash: "#features", label: "Features" },
  { hash: "#pricing", label: "Pricing" },
] as const;

export function Nav({
  githubAvailable,
  signedIn = false,
}: {
  githubAvailable: boolean;
  /** Swaps the sign-in button for a way back into the signed-in app. */
  signedIn?: boolean;
}) {
  const linkClass = "transition-colors hover:text-[var(--fl-text)]";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--fl-border)]/70 bg-[var(--fl-bg)]/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
        <Link href="/" className="shrink-0 text-[var(--fl-text)]">
          <ForkLeafLogo textClassName="text-[1.0625rem]" />
        </Link>

        <nav
          aria-label="Sections"
          className="hidden items-center gap-6 text-sm text-[var(--fl-muted)] lg:flex"
        >
          {SECTIONS.map((section) => (
            <SectionLink key={section.hash} hash={section.hash} className={linkClass}>
              {section.label}
            </SectionLink>
          ))}
          <Link className={linkClass} href="/docs">
            Docs
          </Link>
          <a className={linkClass} href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />

          <Link
            href="/editor"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)] sm:block"
          >
            Open editor
          </Link>

          {signedIn ? (
            <Link href="/dashboard" className="fl-btn fl-btn-primary !px-4 !py-2 !text-sm">
              Dashboard
            </Link>
          ) : (
            githubAvailable && (
              <a href="/api/auth/github" className="fl-btn fl-btn-primary !px-4 !py-2 !text-sm">
                <GitHubGlyph />
                Sign in
              </a>
            )
          )}
        </div>
      </div>
    </header>
  );
}

export function GitHubGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
