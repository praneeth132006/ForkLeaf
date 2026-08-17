import Link from "next/link";
import { HeroSplitDemo } from "@/components/HeroSplitDemo";
import { FeatureSections } from "@/components/FeatureSections";
import { DocumentationPreview } from "@/components/DocumentationPreview";
import { Footer } from "@/components/Footer";
import { githubOAuthConfigured } from "@/lib/session";
import { SignInError } from "@/components/SignInError";

const REPO_URL = "https://github.com/praneeth132006/MarkDown";

export const metadata = {
  title: "mdnotion — markdown notes, backed by your own GitHub repo",
  description:
    "A local-first markdown editor with first-class Mermaid diagrams. Your notes live in your own GitHub repository: unlimited storage, real version history, and no lock-in.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const githubAvailable = githubOAuthConfigured();

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[var(--color-paper)] font-sans text-[var(--color-ink)]">
      {/* ── Navigation ────────────────────────────────────────────────── */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-trail-teal)] font-serif text-xl font-bold leading-none text-[var(--color-paper)]"
          >
            M
          </span>
          <span className="font-serif text-2xl font-semibold tracking-tight text-[var(--color-basalt)]">
            mdnotion
          </span>
        </div>

        <nav className="hidden items-center gap-8 font-medium text-[var(--color-mist)] md:flex">
          <a href="#features" className="transition-colors hover:text-[var(--color-ink)]">
            Features
          </a>
          <a href="#docs" className="transition-colors hover:text-[var(--color-ink)]">
            Documentation
          </a>
          <a href={REPO_URL} className="transition-colors hover:text-[var(--color-ink)]">
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/editor"
            className="rounded-md px-4 py-2 font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-chalk)]"
          >
            Try it now
          </Link>

          {githubAvailable && (
            <a
              href="/api/auth/github"
              className="rounded-md bg-[var(--color-signal-amber)] px-5 py-2.5 font-semibold text-[var(--color-basalt)] shadow-sm transition-opacity hover:opacity-90"
            >
              Continue with GitHub
            </a>
          )}
        </div>
      </header>

      {error && <SignInError code={error} />}

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex w-full flex-1 flex-col items-center pb-12 pt-12 text-center">
        <p className="mb-4 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-mist)]">
          Open source · Apache-2.0 · Self-hostable
        </p>

        <h1 className="mx-auto max-w-4xl px-6 font-serif text-5xl font-bold leading-[1.1] tracking-tight text-[var(--color-basalt)] md:text-6xl">
          Markdown notes that live in
          <span className="text-[var(--color-trail-teal)]"> your own GitHub repo</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl px-6 text-lg leading-relaxed text-[var(--color-mist)]">
          Write in a Notion-style editor, draw Mermaid diagrams without remembering the syntax, and
          export anywhere. Every note is a plain markdown file with real git history — so it works
          offline, and you can walk away with all of it whenever you want.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 px-6">
          <Link
            href="/editor"
            className="rounded-md bg-[var(--color-basalt)] px-6 py-3 font-semibold text-[var(--color-paper)] transition-opacity hover:opacity-90"
          >
            Start writing — no account needed
          </Link>
          <a
            href={REPO_URL}
            className="rounded-md border border-[var(--color-border)] px-6 py-3 font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-chalk)]"
          >
            View source
          </a>
        </div>

        <p className="mt-3 px-6 text-xs text-[var(--color-mist)]">
          Notes are stored on your device until you connect GitHub.
        </p>

        <div className="mt-14 w-full px-6">
          <HeroSplitDemo />
        </div>
      </main>

      <FeatureSections />
      <DocumentationPreview />

      {/* ── Open source ───────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-4xl px-6 py-20 text-center">
        <h2 className="font-serif text-3xl font-bold text-[var(--color-basalt)]">
          Free, and yours to keep
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--color-mist)]">
          mdnotion is Apache-2.0 licensed with no paid tier and no hosted storage to pay for — your
          notes sit in your GitHub account, which is why storage is effectively unlimited. Run the
          hosted version, or self-host it in a few minutes.
        </p>

        <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
          {[
            {
              title: "No lock-in",
              body: "Plain .md files in a normal git repo. Clone it, edit it in any editor, delete us.",
            },
            {
              title: "No servers of ours",
              body: "Your token stays in an encrypted cookie; your notes never touch a database we run.",
            },
            {
              title: "Contributions welcome",
              body: "Good first issues, a documented architecture, and a full test suite.",
            },
          ].map((card) => (
            <div key={card.title} className="rounded-lg border border-[var(--color-border)] p-4">
              <h3 className="mb-1 font-semibold text-[var(--color-ink)]">{card.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--color-mist)]">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
