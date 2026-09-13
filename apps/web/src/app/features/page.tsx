import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";
import { FeatureCatalog } from "@/components/FeatureCatalog";
import { FEATURE_CATEGORIES, allFeatures } from "@/lib/feature-catalog";

export const metadata = {
  title: "Features",
  description:
    "Everything ForkLeaf does: writing, linking, flashcards, boards, saving from the web, reading papers, diagrams, history and publishing — all as plain files in your own GitHub repository.",
};

/**
 * Every feature, on a page of its own.
 *
 * The home page shows a dozen highlights; this answers "can it do X?" for all
 * of them. The list itself is data in `lib/feature-catalog`, so it is checked
 * by tests and cannot drift into advertising something that is not built.
 */
export default function FeaturesPage() {
  const total = allFeatures().length;
  const fresh = allFeatures().filter((feature) => feature.tags?.includes("new")).length;

  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-6xl px-6 pb-24">
        <header className="pb-10 pt-16 sm:pt-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
            Features
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--fl-text)] sm:text-[3.25rem]">
            Everything ForkLeaf does
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[var(--fl-muted)]">
            A notebook of plain Markdown files in your own GitHub repository — and the linking,
            remembering, reading and publishing a real notebook needs. Every card says where to find
            it; almost all of it is one ⌘K away.
          </p>

          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            {[
              [String(total), "features"],
              [String(FEATURE_CATEGORIES.length), "areas"],
              [String(fresh), "new this release"],
              ["0", "databases holding your notes"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="text-3xl font-semibold tracking-tight text-[var(--fl-text)]">
                  {value}
                  <span className="ml-2 text-[14px] font-normal text-[var(--fl-muted)]">
                    {label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/editor" className="fl-btn fl-btn-primary">
              Open the editor
            </Link>
            <Link href="/docs" className="fl-btn fl-btn-ghost">
              Read the docs
            </Link>
          </div>
        </header>

        <FeatureCatalog />
      </div>
    </SiteShell>
  );
}
