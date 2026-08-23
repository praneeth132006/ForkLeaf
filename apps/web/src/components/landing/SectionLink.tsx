"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A link to a section of the landing page that also works from a page which
 * does not have that section.
 *
 * The nav and the footer are rendered on every page, but "Features", "How it
 * works" and "Pricing" only exist on `/`. Written as bare `#features` they
 * resolved against whatever page you happened to be on, so from the terms,
 * privacy and docs pages clicking them just appended a fragment to the URL and
 * did nothing at all — the single most common way a site feels broken.
 *
 * Prefixing every one of them with `/` unconditionally would be worse in the
 * other direction: it turns an in-page scroll on the home page into a
 * navigation. So the href is resolved against the current path.
 */
export function sectionHref(pathname: string, hash: string): string {
  const fragment = hash.startsWith("#") ? hash : `#${hash}`;
  return pathname === "/" ? fragment : `/${fragment}`;
}

export function SectionLink({
  hash,
  className,
  children,
}: {
  /** The section id, with or without the leading `#`. */
  hash: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onHome = (pathname ?? "/") === "/";
  const href = sectionHref(pathname ?? "/", hash);

  // On the home page this is an in-page jump, and `Link` keeps it one.
  if (onHome) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  // Coming from another page it is a real navigation, and a plain anchor is
  // deliberate: the App Router changes the URL to `/#features` but does not
  // scroll to it, because the target does not exist in the DOM at the moment
  // the fragment is applied — the home page is long, and the section is
  // thousands of pixels below a five-viewport scroll story. A full load hands
  // the fragment to the browser, which resolves it after layout and gets it
  // right every time. This is a marketing header; a document load is a fair
  // price for a link that works.
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
