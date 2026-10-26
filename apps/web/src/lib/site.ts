/**
 * The public face of the site, for the things search engines and link
 * previews read: canonical URLs, the sitemap, structured data and llms.txt.
 *
 * Unlike `app-url`, this has no request to fall back on — a sitemap is built
 * once, not per visitor — so the production origin is the default and the
 * environment only overrides it. A preview deployment that announced its own
 * generated hostname as canonical would be telling Google to index the
 * preview instead of the site.
 *
 * Deliberately not `NEXT_PUBLIC_APP_URL`: that is where the OAuth round trip
 * returns to, which can be a `*.vercel.app` hostname serving the same pages.
 * Canonicals have to name the one domain that should rank, or the two copies
 * compete with each other in search.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.forkleaf.in").replace(
  /\/+$/,
  "",
);

export const SITE_NAME = "ForkLeaf";

export const SITE_TAGLINE = "Markdown notes stored in your own GitHub repository";

/** The one-paragraph description used wherever a page does not have its own. */
export const SITE_DESCRIPTION =
  "A free, open-source, local-first Markdown workspace whose storage is a GitHub repository you own. Wikilinks, backlinks, offline editing, a visual Mermaid diagram studio and real git history — over plain .md files, with no lock-in.";

/** An absolute URL on the public site. */
export function siteUrl(path = "/"): string {
  return new URL(path, `${SITE_URL}/`).toString();
}
