import React from "react";
import Link from "next/link";
import { ForkLeafLogo } from "@/components/Brand";
import {
  ARCHITECTURE_URL,
  CONTRIBUTING_URL,
  ISSUES_URL,
  LICENSE_URL,
  REPO_URL,
  SECURITY_URL,
  SELF_HOSTING_URL,
} from "@/lib/constants";

/**
 * Site footer.
 *
 * Every link here goes somewhere real. The previous version advertised a
 * Twitter, a Discord, a changelog and a community page that do not exist, which
 * is a worse first impression than having fewer links.
 */
const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how" },
      { label: "Pricing", href: "#pricing" },
      { label: "Open the editor", href: "/editor" },
    ],
  },
  {
    heading: "Docs",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Getting started", href: "/docs/getting-started" },
      { label: "Diagrams", href: "/docs/diagrams" },
      { label: "GitHub & sync", href: "/docs/sync" },
      { label: "Self-hosting", href: "/docs/self-hosting" },
      { label: "FAQ", href: "/docs/faq" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "Source", href: REPO_URL },
      { label: "Issues", href: ISSUES_URL },
      { label: "Contributing", href: CONTRIBUTING_URL },
      { label: "Architecture", href: ARCHITECTURE_URL },
      { label: "Licence (Apache-2.0)", href: LICENSE_URL },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Security model", href: "/docs/security" },
      { label: "Report a vulnerability", href: SECURITY_URL },
      { label: "Your data", href: "/docs/privacy-and-data" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-[var(--fl-border)] bg-[var(--fl-bg)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
          <div>
            <ForkLeafLogo textClassName="text-[1.0625rem]" />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-[var(--fl-muted)]">
              A Markdown editor that keeps your notes as plain files in your own GitHub repository.
              Local-first, open source, no lock-in.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="mb-3.5 text-[13px] font-semibold text-[var(--fl-text)]">
                {column.heading}
              </h2>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink href={link.href}>{link.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-[var(--fl-border)] pt-6 text-[13px] text-[var(--fl-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ForkLeaf · Apache-2.0</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <FooterLink href="/privacy">Privacy</FooterLink>
            <FooterLink href="/terms">Terms</FooterLink>
            <span>Your notes are in your repository, not ours.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const className =
    "text-[14px] text-[var(--fl-muted)] transition-colors hover:text-[var(--fl-text)]";

  // In-page anchors and app routes stay internal; everything else is the
  // repository on github.com and should open in its own tab.
  if (href.startsWith("#") || href.startsWith("/")) {
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
