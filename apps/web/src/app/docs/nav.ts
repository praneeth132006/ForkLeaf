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
        summary:
          "Rich text, split and source view, the formatting bar, images, and the slash commands.",
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
        slug: "reading",
        title: "Reading a note",
        summary:
          "Following links, the hover card that says where they go, reading a linked file, reading and citing a PDF, and locking a note so reading it cannot change it.",
      },
      {
        slug: "citation-links",
        title: "The citation link format",
        summary:
          "How a quotation from a PDF is written into a note, field by field — a relative path plus a standard fragment, so other tools can read and write the same links.",
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
      {
        slug: "features",
        title: "What notes-as-commits gets you",
        summary:
          "Replay, blame, runnable blocks, review as a pull request, links to files, freshness, publishing from a private notebook, and capturing sources — with where each button is.",
      },
    ],
  },
  {
    title: "Everyday features",
    pages: [
      {
        slug: "slash-menu",
        title: "The / menu and All tools",
        summary:
          "Every block and every feature, grouped, one keystroke away — and the same list as buttons.",
      },
      {
        slug: "journal",
        title: "Templates, today's note & weekly review",
        summary: "Notes you write often, a note for every day, and a weekly look back.",
      },
      {
        slug: "tasks",
        title: "To-dos",
        summary: "Check boxes with due dates, and one list of every open to-do in the notebook.",
      },
      {
        slug: "flashcards",
        title: "Flashcards",
        summary:
          "Question :: Answer cards, both-way cards, multi-line cards and fill-in-the-blanks, with spaced repetition.",
      },
      {
        slug: "resurfacing",
        title: "Worth revisiting",
        summary: "A few older notes each day, chosen for what you are working on.",
      },
      {
        slug: "views",
        title: "Graph, board, table & focus",
        summary: "The notebook as a map, a board or a spreadsheet — or nothing but the note.",
      },
      {
        slug: "saving",
        title: "Saving from the web",
        summary:
          "The extension, share sheet and bookmarklet, and the repository that files every save by kind and month.",
      },
      {
        slug: "running-code",
        title: "Running code, with input",
        summary: "Run bash, Python and JavaScript blocks — including programs that ask for input.",
      },
      {
        slug: "voice-notes",
        title: "Voice notes",
        summary: "Record into a note, with an optional transcript.",
      },
      {
        slug: "encrypted-notes",
        title: "Encrypted notes",
        summary: "Seal a note so only its passphrase can read it.",
      },
      {
        slug: "importing",
        title: "Importing from Obsidian & Notion",
        summary: "Bring a vault or an export across, links and pictures included.",
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
          "The notes repo, connecting and disconnecting repositories, publishing a note as a page, branches, subdirectories and switching between them.",
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
    title: "Connect",
    pages: [
      {
        slug: "browser-extension",
        title: "Browser extension",
        summary:
          "Install Save to ForkLeaf in Chrome, Edge, Brave or Arc, and save pages, quotes, links and pictures with one click.",
      },
      {
        slug: "mcp",
        title: "Connect an AI assistant (MCP)",
        summary:
          "Let Claude Code, Claude Desktop, Cursor or any MCP client search, read and write your notebook — step by step.",
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
        summary: "How the GitHub token is held, and what protects your notes and your history.",
      },
    ],
  },
  {
    title: "Help",
    pages: [
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
      {
        slug: "support",
        title: "Contact support",
        summary:
          "Where to write when the documentation does not have it, what to include, and how long a reply takes.",
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
