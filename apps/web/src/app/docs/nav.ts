/**
 * The documentation table of contents.
 *
 * Single source of truth for the sidebar, the index page cards and the
 * previous/next links at the foot of each article, so a new page cannot appear
 * in one place and be missing from the others.
 */
export interface DocPage {
  slug: string;
  title: string;
  summary: string;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    title: "Start here",
    pages: [
      {
        slug: "getting-started",
        title: "Getting started",
        summary:
          "Write your first note, sign in with GitHub, and understand what happens to your text.",
      },
      {
        slug: "how-it-works",
        title: "How ForkLeaf works",
        summary:
          "The whole architecture in one page: local-first storage, the sync queue, and why there is no database.",
      },
    ],
  },
  {
    title: "Writing",
    pages: [
      {
        slug: "editor",
        title: "The editor",
        summary: "Rich text, split and source view, the insert menu, and the slash commands.",
      },
      {
        slug: "diagrams",
        title: "Diagrams",
        summary:
          "Every Mermaid diagram type, the visual builder, the source editor, and how they are stored.",
      },
      {
        slug: "properties",
        title: "Properties & front matter",
        summary: "Titles, tags and custom fields, and how they map onto YAML in the file.",
      },
      {
        slug: "export",
        title: "Exporting",
        summary: "Markdown, PDF, HTML, Word, plain text and JSON — all produced in your browser.",
      },
      {
        slug: "shortcuts",
        title: "Keyboard shortcuts",
        summary: "Every shortcut in the app, in one table.",
      },
    ],
  },
  {
    title: "GitHub",
    pages: [
      {
        slug: "signing-in",
        title: "Signing in",
        summary:
          "What the GitHub OAuth flow does, which permissions it asks for, and why it needs them.",
      },
      {
        slug: "repositories",
        title: "Repositories & workspaces",
        summary:
          "The notes repo, connecting your own repositories, branches, subdirectories and switching between them.",
      },
      {
        slug: "sync",
        title: "Syncing & commits",
        summary:
          "How edits become commits, what the status bar means, offline behaviour and commit squashing.",
      },
      {
        slug: "conflicts",
        title: "Conflicts",
        summary: "What happens when two devices edit the same note, and how to resolve it.",
      },
    ],
  },
  {
    title: "Account",
    pages: [
      {
        slug: "plans",
        title: "What it costs",
        summary: "Free, all of it, with no tiers — and what funds the project instead.",
      },
      {
        slug: "privacy-and-data",
        title: "Your data",
        summary: "Exactly what ForkLeaf stores, where, and how to get rid of all of it.",
      },
      {
        slug: "security",
        title: "Security model",
        summary:
          "Token handling, the OAuth CSRF defence, sanitisation, and the commit-rewrite guard.",
      },
    ],
  },
  {
    title: "Running it yourself",
    pages: [
      {
        slug: "self-hosting",
        title: "Self-hosting",
        summary: "Deploy your own ForkLeaf: environment variables, OAuth app setup, and hosting.",
      },
      {
        slug: "firebase",
        title: "Firebase setup",
        summary: "Wiring up product analytics and the thin user record.",
      },
      {
        slug: "troubleshooting",
        title: "Troubleshooting",
        summary: "The errors people actually hit, and what each one means.",
      },
      {
        slug: "faq",
        title: "FAQ",
        summary: "Short answers to the questions that come up most.",
      },
    ],
  },
];

export const ALL_DOC_PAGES: DocPage[] = DOC_SECTIONS.flatMap((section) => section.pages);

export function findDocPage(slug: string): DocPage | undefined {
  return ALL_DOC_PAGES.find((page) => page.slug === slug);
}

/** Previous and next in reading order, for the footer links. */
export function docNeighbours(slug: string): { previous?: DocPage; next?: DocPage } {
  const index = ALL_DOC_PAGES.findIndex((page) => page.slug === slug);
  if (index === -1) return {};

  return {
    ...(index > 0 ? { previous: ALL_DOC_PAGES[index - 1]! } : {}),
    ...(index < ALL_DOC_PAGES.length - 1 ? { next: ALL_DOC_PAGES[index + 1]! } : {}),
  };
}
