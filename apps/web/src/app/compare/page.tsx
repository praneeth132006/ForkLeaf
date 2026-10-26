import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";
import { JsonLd, breadcrumbLd } from "@/components/JsonLd";
import { ComparisonBlock } from "@/components/landing/Comparison";
import { COMPETITORS } from "@/lib/comparisons";

export const metadata = {
  title: { absolute: "ForkLeaf compared with Obsidian, Notion, Evernote and OneNote" },
  description:
    "How ForkLeaf compares with Obsidian, Notion, Evernote and OneNote: where your notes end up, the format, history, sync, offline editing, collaboration and price.",
  alternates: { canonical: "/compare" },
};

/**
 * Every comparison on one page: a card per app for the reader who already
 * knows which one they are leaving, and the full table for the one who does
 * not.
 */
export default function CompareIndex() {
  return (
    <SiteShell>
      <JsonLd
        data={breadcrumbLd([
          ["ForkLeaf", "/"],
          ["Compare", "/compare"],
        ])}
      />
      <div className="mx-auto w-full max-w-6xl px-6 pb-24">
        <header className="pb-10 pt-16 sm:pt-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
            Compare
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--fl-text)] sm:text-[3.25rem]">
            ForkLeaf and the apps you already know
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[var(--fl-muted)]">
            Every app here can hold your notes. The difference is where they end up: in ForkLeaf, a
            Markdown file in a GitHub repository with your name on it.
          </p>
        </header>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMPETITORS.map((competitor) => (
            <li key={competitor.slug}>
              <Link
                href={`/compare/${competitor.slug}`}
                className="fl-card group block h-full p-5 transition-colors hover:border-[var(--fl-accent)]"
              >
                <span className="text-[16px] font-semibold text-[var(--fl-text)] group-hover:text-[var(--fl-accent)]">
                  ForkLeaf vs {competitor.name}
                </span>
                <span className="mt-2 block text-[14px] leading-relaxed text-[var(--fl-muted)]">
                  {competitor.pickForkLeafIf[0]}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <ComparisonBlock />
      </div>
    </SiteShell>
  );
}
