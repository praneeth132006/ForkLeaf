import React from "react";
import type { PlainFaq } from "@/lib/comparisons";
import { REPO_URL } from "@/lib/constants";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";

/**
 * Structured data, for search engines and the assistants that read them.
 *
 * Nothing here is shown to a person; it restates what the page already says in
 * a vocabulary (schema.org) that a crawler does not have to guess at. That is
 * what turns a result into one with an FAQ under it, and what lets an
 * assistant answer "is ForkLeaf free?" from the page rather than a guess.
 *
 * `<` is escaped because this is a script element: a note title containing
 * `</script>` would otherwise end the element early and run whatever followed.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** ForkLeaf as a piece of software — the entity every other page refers to. */
export function softwareApplicationLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": siteUrl("/#software"),
    name: SITE_NAME,
    url: siteUrl("/"),
    description: SITE_DESCRIPTION,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, Windows, macOS, Linux, ChromeOS, Android, iOS",
    image: siteUrl("/brand/forkleaf-icon-512.png"),
    isAccessibleForFree: true,
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    codeRepository: REPO_URL,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Notes stored as Markdown files in your own GitHub repository",
      "Offline-first editing with a local commit queue",
      "Wikilinks, backlinks and a graph of your notes",
      "Visual Mermaid diagram studio",
      "Every save is a git commit with full history",
      "Export to PDF, HTML, Word, Markdown, plain text and JSON",
      "Publishing to GitHub Pages",
      "Import from Obsidian and Notion",
    ],
  };
}

export function organizationLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": siteUrl("/#organization"),
    name: SITE_NAME,
    url: siteUrl("/"),
    logo: siteUrl("/brand/forkleaf-icon-512.png"),
    sameAs: [REPO_URL],
  };
}

export function websiteLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": siteUrl("/#website"),
    name: SITE_NAME,
    url: siteUrl("/"),
    publisher: { "@id": siteUrl("/#organization") },
  };
}

export function faqLd(questions: readonly PlainFaq[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** A trail of `[name, path]` pairs, home first. */
export function breadcrumbLd(
  trail: readonly (readonly [string, string])[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: siteUrl(path),
    })),
  };
}
