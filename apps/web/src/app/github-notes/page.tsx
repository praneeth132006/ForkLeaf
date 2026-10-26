import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";
import { JsonLd, breadcrumbLd, faqLd, softwareApplicationLd } from "@/components/JsonLd";
import type { PlainFaq } from "@/lib/comparisons";

const TITLE = "Markdown notes stored in GitHub — a notes app for your own repository";
const DESCRIPTION =
  "Keep your notes as Markdown files in a GitHub repository you own. ForkLeaf is a free, open-source notes app that syncs to GitHub, works offline, and turns every save into a git commit.";

export const metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/github-notes" },
  // A page's own `openGraph` replaces the layout's rather than merging with
  // it, so the share image has to be named again here.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/github-notes",
    images: ["/opengraph-image"],
  },
};

/**
 * The page for the people who already had the idea.
 *
 * "Can I just keep my notes in a GitHub repo?" is a question developers ask
 * long before they hear of ForkLeaf, and the usual answers — edit on
 * github.com, or a folder plus `git commit` by hand — both work and both stop
 * being pleasant around the hundredth note. This page meets that search: yes,
 * here is what git gives a notebook, and here is the part ForkLeaf does so you
 * do not have to.
 */

const STEPS: { title: string; body: string }[] = [
  {
    title: "Pick a repository",
    body: "A new private one, or one that already has Markdown in it. ForkLeaf reads .md files where they are, sub-folders and front matter included.",
  },
  {
    title: "Write",
    body: "A real editor: rich text that is Markdown underneath, [[wikilinks]], backlinks, tables, Mermaid diagrams and pasted images. Every keystroke is saved on your device first.",
  },
  {
    title: "It commits for you",
    body: "Changes are pushed to GitHub as ordinary commits when there is a network. Offline, they wait in a queue, and the status bar says what is saved where.",
  },
];

const FROM_GIT: { title: string; body: string }[] = [
  {
    title: "History that never expires",
    body: "Every save is a commit. Diff any two versions of a note, see who wrote a paragraph and when, and bring back what you deleted months ago.",
  },
  {
    title: "Sync on every device, free",
    body: "Private repositories cost nothing on GitHub, and git already solved syncing. Open the same notes on a laptop, a work machine or a phone browser.",
  },
  {
    title: "Review like code",
    body: "Propose a change on a branch and merge it through a pull request. A GitHub Actions check can fail a pull request that leaves a link pointing at nothing.",
  },
  {
    title: "Publish with GitHub Pages",
    body: "Turn a folder into a public site, a book or a digital garden from the same repository — no export, no second copy.",
  },
  {
    title: "Readable everywhere",
    body: "The files render on github.com, open in VS Code and Obsidian, and build in Hugo or Jekyll. Nothing about them needs ForkLeaf.",
  },
  {
    title: "Nothing to be locked out of",
    body: "ForkLeaf stores no notes on its servers. If it vanished tomorrow you would clone the repository and carry on.",
  },
];

const FAQ: PlainFaq[] = [
  {
    q: "Can I use GitHub to store my notes?",
    a: "Yes. A GitHub repository is a good home for notes: Markdown renders on github.com, private repositories are free, and git keeps the full history. ForkLeaf adds a proper editor on top, with linking, search, diagrams and automatic commits, so you never run git by hand.",
  },
  {
    q: "Is ForkLeaf free?",
    a: "Yes, completely, with no paid tier. ForkLeaf is open source under Apache-2.0. Your notes are stored in your own GitHub account, so there is no storage for ForkLeaf to charge for.",
  },
  {
    q: "Can my notes repository be private?",
    a: "Yes. Sign in with the standard GitHub permission to use private repositories, or with public-repository access only if you prefer a narrower grant.",
  },
  {
    q: "Do I need to know git?",
    a: "No. ForkLeaf commits and pushes for you, and shows conflicts in plain language when the same note changed in two places. If you do know git, everything is ordinary commits you can work with from the command line.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. Edits are written to IndexedDB on your device before anything else, and pushed to GitHub when you reconnect.",
  },
];

export default function GithubNotesPage() {
  return (
    <SiteShell>
      <JsonLd
        data={[
          softwareApplicationLd(),
          faqLd(FAQ),
          breadcrumbLd([
            ["ForkLeaf", "/"],
            ["Notes in GitHub", "/github-notes"],
          ]),
        ]}
      />

      <div className="mx-auto w-full max-w-5xl px-6 pb-24">
        <header className="pb-12 pt-16 sm:pt-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
            Notes in GitHub
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--fl-text)] sm:text-[3.25rem]">
            Keep your notes as Markdown in your own GitHub repository
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[var(--fl-muted)]">
            You already trust GitHub with your code. ForkLeaf is a notes app that writes plain{" "}
            <code className="fl-code">.md</code> files to a repository you own — with linking,
            search, diagrams and offline editing — and commits them for you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/editor" className="fl-btn fl-btn-primary">
              Open the editor
            </Link>
            <Link href="/docs/getting-started" className="fl-btn fl-btn-ghost">
              Getting started
            </Link>
          </div>
        </header>

        <section aria-labelledby="how" className="mt-4">
          <h2
            id="how"
            className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fl-text)]"
          >
            How it works
          </h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="fl-card p-5">
                <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-accent)]">
                  Step {index + 1}
                </span>
                <h3 className="mt-2 text-[16px] font-semibold text-[var(--fl-text)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="git" className="mt-16">
          <h2
            id="git"
            className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fl-text)]"
          >
            What git gives a notebook
          </h2>
          <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FROM_GIT.map((point) => (
              <div key={point.title} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fl-accent)]"
                />
                <div>
                  <h3 className="text-[15.5px] font-semibold tracking-tight text-[var(--fl-text)]">
                    {point.title}
                  </h3>
                  <p className="mt-1.5 max-w-md text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
                    {point.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="alternatives" className="mt-16">
          <h2
            id="alternatives"
            className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fl-text)]"
          >
            Why not just edit on github.com?
          </h2>
          <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[var(--fl-text)]">
            You can, and for one file it is fine. For a notebook, github.com has no [[wikilinks]] or
            backlinks, no search across what you wrote, no offline editing, and a commit for every
            save made by hand. A folder with <code className="fl-code">git</code> on the command
            line works too — until you want your notes on a machine without it. ForkLeaf keeps the
            repository and removes the chores.
          </p>
          <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[var(--fl-muted)]">
            Coming from another app? See{" "}
            <Link href="/compare/obsidian" className="fl-link">
              ForkLeaf vs Obsidian
            </Link>
            ,{" "}
            <Link href="/compare/notion" className="fl-link">
              ForkLeaf vs Notion
            </Link>{" "}
            or{" "}
            <Link href="/compare" className="fl-link">
              every comparison
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="questions" className="mt-16">
          <h2
            id="questions"
            className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fl-text)]"
          >
            Questions
          </h2>
          <div className="mt-6 grid items-start gap-3 lg:grid-cols-2">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="fl-card group p-5 transition-colors hover:border-[var(--fl-border-strong)] [&[open]]:border-[var(--fl-border-strong)]"
              >
                <summary className="cursor-pointer list-none text-[15px] font-medium text-[var(--fl-text)]">
                  {item.q}
                </summary>
                <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
