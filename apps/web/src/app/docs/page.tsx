import Link from "next/link";
import { DOC_SECTIONS } from "./nav";

export const metadata = {
  title: "Documentation",
  description:
    "Everything about ForkLeaf: writing, diagrams, GitHub sync, conflicts, exports, plans and security.",
};

export default function DocsIndex() {
  return (
    <div>
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
        Documentation
      </p>
      <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--fl-text)]">
        Everything ForkLeaf does, and how
      </h1>
      <p className="mt-5 max-w-2xl text-[17px] leading-[1.7] text-[var(--fl-muted)]">
        ForkLeaf is a Markdown editor whose storage is a GitHub repository you own. These pages
        cover how to use it, how it behaves when the network disappears, exactly what it stores
        about you, and how to run your own copy.
      </p>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/docs/getting-started" className="fl-btn fl-btn-primary">
          Start reading
        </Link>
        <Link href="/editor" className="fl-btn fl-btn-ghost">
          Open the editor
        </Link>
      </div>

      <div className="mt-16 space-y-12">
        {DOC_SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
              {section.title}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {section.pages.map((page) => (
                <Link
                  key={page.slug}
                  href={`/docs/${page.slug}`}
                  className="fl-card group p-4 transition-all hover:-translate-y-px hover:border-[var(--fl-accent)] hover:shadow-[var(--fl-shadow)]"
                >
                  <h3 className="text-[15px] font-semibold text-[var(--fl-text)]">
                    {page.title}
                    <span
                      aria-hidden="true"
                      className="ml-1.5 inline-block text-[var(--fl-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--fl-accent)]"
                    >
                      →
                    </span>
                  </h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--fl-muted)]">
                    {page.summary}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
