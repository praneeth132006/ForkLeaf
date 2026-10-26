import type { MetadataRoute } from "next";
import { ALL_DOC_PAGES } from "./docs/nav";
import { COMPETITORS } from "@/lib/comparisons";
import { siteUrl } from "@/lib/site";

/**
 * Every public page, for search engines.
 *
 * Built from the same tables the site's own navigation reads — the docs table
 * of contents and the comparison list — so a page added there is in the
 * sitemap without anybody remembering to add it here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "monthly",
  ) => ({ url: siteUrl(path), changeFrequency, priority });

  return [
    page("/", 1, "weekly"),
    page("/editor", 0.9),
    page("/features", 0.9, "weekly"),
    page("/github-notes", 0.9),
    page("/compare", 0.8),
    ...COMPETITORS.map((competitor) => page(`/compare/${competitor.slug}`, 0.8)),
    page("/docs", 0.8, "weekly"),
    ...ALL_DOC_PAGES.map((doc) => page(`/docs/${doc.slug}`, 0.6)),
    page("/changelog", 0.5, "weekly"),
    page("/support", 0.4),
    page("/privacy", 0.2, "yearly"),
    page("/terms", 0.2, "yearly"),
  ];
}
