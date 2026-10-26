import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteShell } from "@/components/SiteShell";
import { JsonLd, breadcrumbLd, faqLd } from "@/components/JsonLd";
import { COMPARISON_ROWS, COMPETITORS, findCompetitor } from "@/lib/comparisons";

/** One page per app — static, since nothing about a comparison is per-request. */
export function generateStaticParams() {
  return COMPETITORS.map((competitor) => ({ slug: competitor.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const competitor = findCompetitor(slug);
  if (!competitor) return {};

  return {
    // Absolute: the title is already written the way people search it, and
    // "· ForkLeaf" after "ForkLeaf vs Obsidian — …" would say it twice.
    title: { absolute: competitor.title },
    description: competitor.description,
    alternates: { canonical: `/compare/${competitor.slug}` },
    openGraph: {
      title: competitor.title,
      description: competitor.description,
      url: `/compare/${competitor.slug}`,
      // A page's own `openGraph` replaces the layout's rather than merging
      // with it, so the share image has to be named again here.
      images: ["/opengraph-image"],
    },
  };
}

/**
 * ForkLeaf against one app.
 *
 * The page somebody lands on from "Obsidian alternative" or "ForkLeaf vs
 * Notion". It answers in the order they are asking: the one-line difference,
 * the rows side by side, when the other app is the better choice, when
 * ForkLeaf is, and how to move — which is the question that decides whether
 * trying it is cheap.
 */
export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const competitor = findCompetitor(slug);
  if (!competitor) notFound();

  const others = COMPETITORS.filter((other) => other.slug !== competitor.slug);

  return (
    <SiteShell>
      <JsonLd
        data={[
          faqLd(competitor.faq),
          breadcrumbLd([
            ["ForkLeaf", "/"],
            ["Compare", "/compare"],
            [`ForkLeaf vs ${competitor.name}`, `/compare/${competitor.slug}`],
          ]),
        ]}
      />

      <div className="mx-auto w-full max-w-5xl px-6 pb-24">
        <header className="pb-10 pt-16 sm:pt-20">
          <nav aria-label="Breadcrumb" className="mb-4 text-[13px] text-[var(--fl-muted)]">
            <Link href="/compare" className="transition-colors hover:text-[var(--fl-text)]">
              Compare
            </Link>
            <span aria-hidden="true" className="mx-1.5">
              /
            </span>
            <span className="text-[var(--fl-text)]">{competitor.name}</span>
          </nav>
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
            {competitor.name} alternative
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--fl-text)] sm:text-[3.25rem]">
            ForkLeaf vs {competitor.name}
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-[var(--fl-muted)]">
            {competitor.verdict}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/editor" className="fl-btn fl-btn-primary">
              Try it without an account
            </Link>
            <Link href="/docs/importing" className="fl-btn fl-btn-ghost">
              How importing works
            </Link>
          </div>
        </header>

        {/* Wide tables scroll inside themselves; the page never scrolls sideways. */}
        <section aria-labelledby="side-by-side" className="mt-4">
          <h2
            id="side-by-side"
            className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fl-text)]"
          >
            Side by side
          </h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--fl-border)]">
            <table className="w-full min-w-[36rem] border-collapse text-left text-[14px]">
              <caption className="sr-only">ForkLeaf compared with {competitor.name}</caption>
              <thead>
                <tr className="border-b border-[var(--fl-border)] bg-[var(--fl-elevated)]">
                  <th scope="col" className="w-48 px-4 py-3 font-semibold text-[var(--fl-muted)]">
                    <span className="text-[11px] uppercase tracking-[0.14em]">Question</span>
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-[var(--fl-accent)]">
                    ForkLeaf
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-[var(--fl-text)]">
                    {competitor.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr
                    key={row.criterion}
                    className="border-b border-[var(--fl-border)] last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-4 align-top font-medium text-[var(--fl-text)]"
                    >
                      {row.criterion}
                    </th>
                    <td className="bg-[var(--fl-accent-soft)] px-4 py-4 align-top leading-relaxed text-[var(--fl-text)]">
                      {row.cells.ForkLeaf}
                    </td>
                    <td className="px-4 py-4 align-top leading-relaxed text-[var(--fl-muted)]">
                      {row.cells[competitor.name]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="Which to choose" className="mt-16 grid gap-4 md:grid-cols-2">
          <ChoiceCard title={`Choose ${competitor.name} if…`} items={competitor.pickThemIf} />
          <ChoiceCard title="Choose ForkLeaf if…" items={competitor.pickForkLeafIf} accent />
        </section>

        <section aria-labelledby="switching" className="mt-16">
          <h2
            id="switching"
            className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fl-text)]"
          >
            Moving from {competitor.name}
          </h2>
          <ol className="mt-6 max-w-2xl list-decimal space-y-3 pl-5 text-[15.5px] leading-relaxed text-[var(--fl-text)] marker:text-[var(--fl-muted)]">
            {competitor.switching.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-[var(--fl-muted)]">
            Nothing is locked in on the way in, either: your notes stay plain Markdown in your own
            repository, so changing your mind later means opening the same folder in something else.
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
            {competitor.faq.map((item) => (
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

        <nav
          aria-label="Other comparisons"
          className="mt-16 border-t border-[var(--fl-border)] pt-8"
        >
          <p className="text-[13px] uppercase tracking-[0.12em] text-[var(--fl-muted)]">
            Other comparisons
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            {others.map((other) => (
              <li key={other.slug}>
                <Link href={`/compare/${other.slug}`} className="fl-link">
                  ForkLeaf vs {other.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/github-notes" className="fl-link">
                Why keep notes in GitHub
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </SiteShell>
  );
}

function ChoiceCard({
  title,
  items,
  accent = false,
}: {
  title: string;
  items: readonly string[];
  accent?: boolean;
}) {
  return (
    <div
      className={`fl-card p-6 ${accent ? "border-[var(--fl-accent)] bg-[var(--fl-accent-soft)]" : ""}`}
    >
      <h2 className="text-[17px] font-semibold tracking-tight text-[var(--fl-text)]">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[14.5px] leading-relaxed text-[var(--fl-text)]">
            <span
              aria-hidden="true"
              className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${
                accent ? "bg-[var(--fl-accent)]" : "bg-[var(--fl-muted)]"
              }`}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
