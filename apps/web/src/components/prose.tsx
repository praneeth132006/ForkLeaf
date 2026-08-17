import React from "react";
import Link from "next/link";

/**
 * Typographic building blocks for the documentation, privacy policy and terms.
 *
 * These pages are hand-written TSX rather than MDX so that every element is a
 * real component with real styling — no `@tailwindcss/typography` guessing at
 * what a `<table>` inside a `<blockquote>` should look like, and no build step
 * to add a page.
 */

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-14 scroll-mt-24 border-t border-[var(--fl-border)] pt-8 text-[1.6rem] font-semibold tracking-[-0.02em] text-[var(--fl-text)] first:mt-0 first:border-0 first:pt-0"
    >
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3
      {...(id ? { id } : {})}
      className="mt-9 scroll-mt-24 text-[1.15rem] font-semibold tracking-[-0.015em] text-[var(--fl-text)]"
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[15.5px] leading-[1.75] text-[var(--fl-muted)]">{children}</p>;
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[17px] leading-[1.7] text-[var(--fl-muted)]">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-4 space-y-2 text-[15.5px] leading-[1.7] text-[var(--fl-muted)]">
      {children}
    </ul>
  );
}

export function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[var(--fl-accent)]" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15.5px] leading-[1.7] text-[var(--fl-muted)] marker:text-[var(--fl-accent)] marker:font-mono marker:text-[13px]">
      {children}
    </ol>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-[var(--fl-border)] bg-[var(--fl-elevated)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--fl-text)]">
      {children}
    </code>
  );
}

export function Pre({ children, label }: { children: string; label?: string }) {
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-[var(--fl-border)]">
      {label && (
        <div className="border-b border-[var(--fl-border)] bg-[var(--fl-elevated)] px-4 py-2 font-mono text-[11.5px] text-[var(--fl-muted)]">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto bg-[var(--fl-inverse-bg)] px-4 py-3.5 font-mono text-[12.5px] leading-[1.65] text-[var(--fl-inverse-text)]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Note({
  kind = "info",
  children,
}: {
  kind?: "info" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const tone = {
    info: "border-[var(--fl-accent)]/40 bg-[var(--fl-accent-soft)]",
    warn: "border-[var(--fl-warn)]/40 bg-[var(--fl-warn)]/10",
    danger: "border-[var(--fl-danger)]/40 bg-[var(--fl-danger)]/8",
  }[kind];

  return (
    <div className={`mt-5 rounded-xl border px-4 py-3.5 text-[14.5px] leading-[1.7] ${tone}`}>
      <div className="text-[var(--fl-text)]">{children}</div>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--fl-border)]">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="bg-[var(--fl-elevated)]">
            {head.map((cell) => (
              <th
                key={cell}
                className="whitespace-nowrap px-4 py-2.5 text-left font-semibold text-[var(--fl-text)]"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-[var(--fl-border)]">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-4 py-2.5 align-top leading-[1.6] text-[var(--fl-muted)] [&>strong]:text-[var(--fl-text)]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const className =
    "text-[var(--fl-accent)] underline decoration-[var(--fl-accent)]/40 underline-offset-[3px] transition-colors hover:decoration-[var(--fl-accent)]";

  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}

/** A definition-style pair, used heavily in the reference sections. */
export function Def({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-l-2 border-[var(--fl-border)] pl-4">
      <p className="text-[14.5px] font-semibold text-[var(--fl-text)]">{term}</p>
      <p className="mt-1 text-[14.5px] leading-[1.7] text-[var(--fl-muted)]">{children}</p>
    </div>
  );
}
