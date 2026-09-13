"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FEATURE_CATEGORIES,
  allFeatures,
  searchFeatures,
  type FeatureTag,
} from "@/lib/feature-catalog";

/**
 * The features page's list: every feature, grouped, searchable.
 *
 * A search box and a "New" filter rather than a longer page, because the
 * question somebody arrives with is usually "can it do X?", and scrolling
 * sixty cards to find out is the slow way to answer it.
 */
export function FeatureCatalog() {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<FeatureTag | null>(null);
  const shown = useMemo(() => searchFeatures(query, tag), [query, tag]);
  const total = allFeatures().length;
  const count = allFeatures(shown).length;

  return (
    <div>
      <div className="sticky top-[61px] z-30 -mx-6 border-b border-[var(--fl-border)]/70 bg-[var(--fl-bg)]/85 px-6 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Can it…?"
            aria-label="Search features"
            className="w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 text-[14px] text-[var(--fl-text)] outline-none focus:border-[var(--fl-accent)] sm:w-72"
          />
          <button
            type="button"
            aria-pressed={tag === "new"}
            onClick={() => setTag((current) => (current === "new" ? null : "new"))}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              tag === "new"
                ? "border-transparent bg-[var(--fl-accent)] text-[var(--fl-accent-contrast)]"
                : "border-[var(--fl-border)] text-[var(--fl-muted)] hover:text-[var(--fl-text)]"
            }`}
          >
            New
          </button>
          {/* One scrolling row on a phone: wrapped, seven links made the sticky
              bar tall enough to cover a third of the screen. */}
          <nav
            aria-label="Categories"
            className="-mx-6 flex w-[calc(100%+3rem)] gap-1.5 overflow-x-auto whitespace-nowrap px-6 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 lg:ml-auto"
          >
            {FEATURE_CATEGORIES.map((category) => (
              <a
                key={category.id}
                href={`#${category.id}`}
                className="rounded-full px-2.5 py-1 text-[12.5px] text-[var(--fl-muted)] transition-colors hover:bg-[var(--fl-elevated)] hover:text-[var(--fl-text)]"
              >
                {category.title}
              </a>
            ))}
          </nav>
        </div>
        <p role="status" className="mt-2 text-[12.5px] text-[var(--fl-muted)]">
          {count === total ? `${total} features` : `${count} of ${total} features`}
        </p>
      </div>

      {shown.length === 0 && (
        <p className="py-16 text-center text-[15px] text-[var(--fl-muted)]">
          Nothing matches that yet.{" "}
          <Link href="/support" className="text-[var(--fl-accent)] underline underline-offset-2">
            Tell us what you were looking for
          </Link>
          .
        </p>
      )}

      {shown.map((category) => (
        <section key={category.id} id={category.id} className="fl-anchor scroll-mt-40 pt-14">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--fl-text)]">
              {category.title}
            </h2>
            <span className="text-[13px] text-[var(--fl-muted)]">{category.features.length}</span>
          </div>
          <p className="mt-1.5 max-w-2xl text-[15px] text-[var(--fl-muted)]">{category.blurb}</p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {category.features.map((feature) => (
              <li
                key={feature.id}
                id={feature.id}
                className="fl-card flex flex-col p-5 transition-colors hover:border-[var(--fl-border-strong)]"
              >
                <div className="flex items-start gap-2">
                  <h3 className="flex-1 text-[16px] font-semibold leading-snug tracking-tight text-[var(--fl-text)]">
                    {feature.title}
                  </h3>
                  {feature.tags?.includes("new") && (
                    <span className="shrink-0 rounded-full bg-[var(--fl-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--fl-accent)]">
                      New
                    </span>
                  )}
                </div>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[var(--fl-muted)]">
                  {feature.summary}
                </p>
                <p className="mt-4 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-3 py-2 font-mono text-[12px] leading-snug text-[var(--fl-text)]">
                  {feature.how}
                </p>
                {feature.tags?.includes("github") && (
                  <p className="mt-2 text-[11.5px] text-[var(--fl-muted)]">
                    Needs a connected GitHub repository
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
