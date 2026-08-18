"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOC_SECTIONS } from "./nav";

/**
 * Documentation sidebar.
 *
 * A client component only because it needs the current pathname to mark the
 * active page — everything it renders is static.
 */
export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="space-y-6">
      <Link
        href="/docs"
        className={`block text-[13.5px] font-semibold transition-colors ${
          pathname === "/docs"
            ? "text-[var(--fl-accent)]"
            : "text-[var(--fl-text)] hover:text-[var(--fl-accent)]"
        }`}
      >
        Overview
      </Link>

      {DOC_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fl-muted)]">
            {section.title}
          </h2>
          <ul className="space-y-0.5 border-l border-[var(--fl-border)]">
            {section.pages.map((page) => {
              const href = `/docs/${page.slug}`;
              const active = pathname === href;

              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`-ml-px block border-l py-1.5 pl-3.5 text-[13.5px] transition-colors ${
                      active
                        ? "border-[var(--fl-accent)] font-medium text-[var(--fl-accent)]"
                        : "border-transparent text-[var(--fl-muted)] hover:border-[var(--fl-border-strong)] hover:text-[var(--fl-text)]"
                    }`}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
