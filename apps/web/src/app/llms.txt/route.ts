import { ALL_DOC_PAGES } from "../docs/nav";
import { COMPETITORS } from "@/lib/comparisons";
import { REPO_URL } from "@/lib/constants";
import { SITE_DESCRIPTION, siteUrl } from "@/lib/site";

/**
 * `/llms.txt` — the site, summarised for language models.
 *
 * The llmstxt.org convention: one Markdown file at the root that says what
 * the product is and links to the pages worth reading, so an assistant asked
 * about ForkLeaf answers from what the project says rather than from a guess.
 * Built from the docs table of contents and the comparison list, like the
 * sitemap, so it cannot fall behind the site.
 */
export const dynamic = "force-static";

export function GET() {
  const lines = [
    "# ForkLeaf",
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Key facts:",
    "",
    "- Notes are plain Markdown (.md) files in a GitHub repository the user owns. ForkLeaf stores no notes on its own servers.",
    "- Free, with no paid tier. Open source under Apache-2.0.",
    "- Works in any modern browser and installs as an app; no account is needed to start writing.",
    "- Offline-first: every edit is written to IndexedDB on the device, then committed and pushed to GitHub when online.",
    "- Every save is a git commit, so notes have full history, diffs and blame.",
    "- Obsidian-style [[wikilinks]], backlinks, a graph of notes, full-text search, flashcards and a visual Mermaid diagram studio.",
    "- Imports Obsidian vaults and Notion exports; exports to PDF, HTML, Word, Markdown, plain text and JSON.",
    "- Publishes notes as sites, books and digital gardens with GitHub Pages.",
    "- Connects to AI assistants through an MCP server.",
    "",
    "## Start here",
    "",
    `- [Home](${siteUrl("/")}): what ForkLeaf is and why notes live in GitHub`,
    `- [Open the editor](${siteUrl("/editor")}): try it without an account`,
    `- [Features](${siteUrl("/features")}): everything ForkLeaf does`,
    `- [Markdown notes in GitHub](${siteUrl("/github-notes")}): how keeping notes in a repository works`,
    "",
    "## Comparisons",
    "",
    ...COMPETITORS.map(
      (competitor) =>
        `- [ForkLeaf vs ${competitor.name}](${siteUrl(`/compare/${competitor.slug}`)}): ${competitor.verdict}`,
    ),
    "",
    "## Documentation",
    "",
    ...ALL_DOC_PAGES.map(
      (doc) => `- [${doc.title}](${siteUrl(`/docs/${doc.slug}`)}): ${doc.summary}`,
    ),
    "",
    "## Optional",
    "",
    `- [Source code](${REPO_URL})`,
    `- [Changelog](${siteUrl("/changelog")})`,
    `- [Privacy policy](${siteUrl("/privacy")})`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
