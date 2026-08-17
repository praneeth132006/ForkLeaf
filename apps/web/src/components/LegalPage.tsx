import React from "react";
import Link from "next/link";

/** Where privacy and data requests go. */
export const CONTACT_EMAIL = "praneeth132006b@gmail.com";

/**
 * The date shown on the legal pages.
 *
 * Hardcoded on purpose. Rendering `new Date()` here would make the policy claim
 * it was revised today on every single page load, which is worse than a stale
 * date — it is a false statement about a legal document. Bump it by hand when
 * the text actually changes.
 */
export const LAST_UPDATED = "17 August 2026";

/** Shared frame for the privacy policy and terms: title, date, and back link. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-14">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--fl-accent)]">
        Legal
      </p>
      <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--fl-text)]">
        {title}
      </h1>
      <p className="mt-3 text-[13.5px] text-[var(--fl-muted)]">Last updated {LAST_UPDATED}</p>

      <div className="mt-10">{children}</div>

      <div className="mt-16 flex flex-wrap gap-2 border-t border-[var(--fl-border)] pt-8 text-[13.5px]">
        <Link
          href="/privacy"
          className="rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          className="rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
        >
          Terms &amp; Conditions
        </Link>
        <Link
          href="/docs"
          className="rounded-lg border border-[var(--fl-border)] px-3 py-2 text-[var(--fl-text)] transition-colors hover:border-[var(--fl-accent)] hover:text-[var(--fl-accent)]"
        >
          Documentation
        </Link>
      </div>
    </div>
  );
}
