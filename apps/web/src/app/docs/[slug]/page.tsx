import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ALL_DOC_PAGES, docNeighbours, findDocPage } from "../nav";
import { DOC_CONTENT } from "../content";

/** Every documentation page is static — there is nothing per-request about them. */
export function generateStaticParams() {
  return ALL_DOC_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findDocPage(slug);
  if (!page) return {};

  return { title: page.title, description: page.summary };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const page = findDocPage(slug);
  const Content = DOC_CONTENT[slug];
  // Both have to exist: a slug in the table of contents with no article is as
  // broken as an article nobody can navigate to.
  if (!page || !Content) notFound();

  const { previous, next } = docNeighbours(slug);

  return (
    <article className="min-w-0">
      <nav aria-label="Breadcrumb" className="mb-4 text-[13px] text-[var(--fl-muted)]">
        <Link href="/docs" className="transition-colors hover:text-[var(--fl-text)]">
          Documentation
        </Link>
        <span aria-hidden="true" className="mx-1.5">
          /
        </span>
        <span className="text-[var(--fl-text)]">{page.title}</span>
      </nav>

      <h1 className="text-[2.25rem] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--fl-text)]">
        {page.title}
      </h1>

      <div className="mt-8 max-w-2xl">
        <Content />
      </div>

      <nav
        aria-label="More documentation"
        className="mt-16 grid gap-3 border-t border-[var(--fl-border)] pt-8 sm:grid-cols-2"
      >
        {previous ? (
          <Link
            href={`/docs/${previous.slug}`}
            className="fl-card group p-4 transition-colors hover:border-[var(--fl-accent)]"
          >
            <span className="text-[11.5px] uppercase tracking-[0.12em] text-[var(--fl-muted)]">
              ← Previous
            </span>
            <span className="mt-1 block text-[14.5px] font-medium text-[var(--fl-text)] group-hover:text-[var(--fl-accent)]">
              {previous.title}
            </span>
          </Link>
        ) : (
          <span />
        )}

        {next && (
          <Link
            href={`/docs/${next.slug}`}
            className="fl-card group p-4 text-right transition-colors hover:border-[var(--fl-accent)] sm:col-start-2"
          >
            <span className="text-[11.5px] uppercase tracking-[0.12em] text-[var(--fl-muted)]">
              Next →
            </span>
            <span className="mt-1 block text-[14.5px] font-medium text-[var(--fl-text)] group-hover:text-[var(--fl-accent)]">
              {next.title}
            </span>
          </Link>
        )}
      </nav>
    </article>
  );
}
