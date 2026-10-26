/**
 * ForkLeaf against the apps people actually have open, as data.
 *
 * Two places read this: the table on the home page, which shows every app at
 * once, and the `/compare/[slug]` pages, which take one app at a time for the
 * reader who searched "ForkLeaf vs Obsidian" or "Notion alternative". Keeping
 * both on one table means a correction made for one is made for the other.
 *
 * Every cell is written to be checked: something a reader can verify in an
 * afternoon, which is the only kind of claim worth making about a competitor.
 * Anything a vendor can change tomorrow — exact prices, plan names — is
 * deliberately not quoted, so none of this can rot into something untrue.
 */
export const COMPARISON_APPS = ["ForkLeaf", "Notion", "OneNote", "Obsidian", "Evernote"] as const;

export type ComparisonApp = (typeof COMPARISON_APPS)[number];

export interface ComparisonRow {
  criterion: string;
  note?: string;
  cells: Record<ComparisonApp, string>;
}

export const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    criterion: "Where a note ends up",
    note: "The thing everything else follows from.",
    cells: {
      ForkLeaf: "A .md file in a GitHub repository you own",
      Notion: "A row in Notion's database, on Notion's servers",
      OneNote: "A .one notebook in OneDrive",
      Obsidian: "A .md file in a folder on that device",
      Evernote: "A note in Evernote's cloud",
    },
  },
  {
    criterion: "Format",
    cells: {
      ForkLeaf: "Markdown — readable in any editor, for ever",
      Notion: "Blocks. Markdown export exists and loses things",
      OneNote: "A proprietary binary format",
      Obsidian: "Markdown",
      Evernote: "ENEX, an XML format only Evernote writes",
    },
  },
  {
    criterion: "History",
    cells: {
      ForkLeaf: "Every save is a git commit — diffs, blame, revert",
      Notion: "Page history, on paid plans, for a limited window",
      OneNote: "Recent versions, per page",
      Obsidian: "Nothing built in; a plugin or git of your own",
      Evernote: "Note history on paid plans",
    },
  },
  {
    criterion: "Sync",
    cells: {
      ForkLeaf: "git push, to a repository you already pay nothing for",
      Notion: "Theirs, included, and required",
      OneNote: "OneDrive, included",
      Obsidian: "A paid add-on, or a folder-sync tool you wire up",
      Evernote: "Theirs, limited on the free tier",
    },
  },
  {
    criterion: "Offline",
    cells: {
      ForkLeaf: "Fully — edits queue locally and push when you reconnect",
      Notion: "Partial, and not something to rely on",
      OneNote: "Yes",
      Obsidian: "Yes — it is a local app",
      Evernote: "Partial, on paid plans",
    },
  },
  {
    criterion: "Diagrams",
    cells: {
      ForkLeaf: "A Mermaid studio; the diagram renders on GitHub as well",
      Notion: "Mermaid in code blocks",
      OneNote: "Freehand drawing and shapes",
      Obsidian: "Mermaid, plus plugins",
      Evernote: "Sketches",
    },
  },
  {
    criterion: "Collaboration",
    cells: {
      ForkLeaf: "Pull requests and review — proposed, discussed, then merged",
      Notion: "Live multiplayer editing — genuinely excellent",
      OneNote: "Shared notebooks",
      Obsidian: "A paid add-on, or none",
      Evernote: "Shared notes",
    },
  },
  {
    criterion: "If the company disappears",
    cells: {
      ForkLeaf: "Nothing happens. The notes were never here",
      Notion: "You have whatever you exported before it happened",
      OneNote: "Files in OneDrive, in a format only OneNote reads",
      Obsidian: "You still have your folder — same answer, and a good one",
      Evernote: "You have an ENEX file to find a converter for",
    },
  },
  {
    criterion: "Price",
    cells: {
      ForkLeaf: "Free, open source, and no account to close",
      Notion: "Free tier, then per person per month",
      OneNote: "Free with a Microsoft account",
      Obsidian: "Free for personal use; sync and publish cost extra",
      Evernote: "Free tier with limits, then paid",
    },
  },
];

/** A question and its answer, in plain text so it can also be structured data. */
export interface PlainFaq {
  q: string;
  a: string;
}

/**
 * One `/compare/[slug]` page.
 *
 * The shape is the same for every app on purpose — what it is, where it wins,
 * where ForkLeaf wins, how to move — because a comparison that only lists the
 * other product's weaknesses reads as an advert, and nobody trusts an advert
 * with a decade of notes. "Pick it instead if…" is the section that makes the
 * rest believable.
 */
export interface Competitor {
  slug: string;
  name: Exclude<ComparisonApp, "ForkLeaf">;
  /** The `<title>`, written the way people search it. */
  title: string;
  description: string;
  /** The one-sentence answer, above the fold. */
  verdict: string;
  /** Where the other app is genuinely the better choice. */
  pickThemIf: readonly string[];
  /** Where ForkLeaf is. */
  pickForkLeafIf: readonly string[];
  /** Moving across, step by step. */
  switching: readonly string[];
  faq: readonly PlainFaq[];
}

export const COMPETITORS: readonly Competitor[] = [
  {
    slug: "obsidian",
    name: "Obsidian",
    title: "ForkLeaf vs Obsidian — an Obsidian alternative with free GitHub sync",
    description:
      "ForkLeaf and Obsidian both keep notes as plain Markdown with [[wikilinks]]. ForkLeaf syncs through a GitHub repository you own — free, with every save a git commit — and runs in any browser with nothing to install.",
    verdict:
      "Both keep your notes as Markdown files you own. Obsidian keeps them in a folder on each device and sells sync as an add-on; ForkLeaf keeps them in a GitHub repository, so sync, history and publishing come from git — free, and in any browser.",
    pickThemIf: [
      "You rely on a specific community plugin — Obsidian's plugin ecosystem is far larger than anything else in this space.",
      "You want a native desktop app that never touches a network, and you are happy to sync folders yourself or pay for Sync.",
      "Your vault holds files you would rather never put in any git repository, private or not.",
    ],
    pickForkLeafIf: [
      "You want sync between devices without paying for it or wiring up a folder-sync tool — a private GitHub repository does it.",
      "You want real version history: every save is a commit you can diff, blame and revert, not a snapshot with a retention window.",
      "You want to open your notes on a machine you cannot install software on — ForkLeaf is a web app that also installs as one.",
      "You want to publish some notes as a site; GitHub Pages does that from the same repository.",
      "Your notes belong beside code, reviewed in pull requests like everything else your team writes.",
    ],
    switching: [
      "Open ForkLeaf and sign in with GitHub, then create or connect the repository your notes will live in.",
      "⌘K → Import notes from Obsidian or Notion, choose Obsidian vault, and pick the vault folder.",
      "Folders and front matter come across as they are; ![[picture.png]] embeds become ordinary images and .obsidian and .trash are left behind.",
      "Your [[wikilinks]] keep working — it is the dialect ForkLeaf speaks natively — and the files still open in Obsidian afterwards.",
    ],
    faq: [
      {
        q: "Is ForkLeaf a free alternative to Obsidian Sync?",
        a: "Yes. ForkLeaf syncs through a GitHub repository you own, and private repositories are free on GitHub. Every save is a git commit, so you also get full version history at no cost. ForkLeaf itself is free and open source with no paid tier.",
      },
      {
        q: "Can I keep using Obsidian and ForkLeaf on the same notes?",
        a: "Yes. Both read and write plain Markdown with [[wikilinks]] and YAML front matter, so a repository ForkLeaf writes to can also be opened as an Obsidian vault. Boards are saved as JSON Canvas, the open format Obsidian uses, so they open in both.",
      },
      {
        q: "Does ForkLeaf support Obsidian plugins?",
        a: "No. ForkLeaf is a different application, not an Obsidian client. Many things people install plugins for — backlinks, graph view, Mermaid diagrams, to-dos, flashcards, git history — are built in.",
      },
      {
        q: "Is ForkLeaf open source? Obsidian is not.",
        a: "ForkLeaf is open source under the Apache-2.0 licence, and the code is on GitHub. Your notes are never stored on ForkLeaf's servers — they are files in your own repository.",
      },
    ],
  },
  {
    slug: "notion",
    name: "Notion",
    title: "ForkLeaf vs Notion — a Notion alternative where you own the files",
    description:
      "Notion stores pages as blocks in its own database. ForkLeaf stores every note as a Markdown file in a GitHub repository you own — offline-first, with real git history, free and open source.",
    verdict:
      "Notion is an excellent shared workspace whose pages live in Notion's database. ForkLeaf is a notebook whose pages are Markdown files in your own GitHub repository — readable without ForkLeaf, versioned by git, and yours if the app ever goes away.",
    pickThemIf: [
      "Your team edits the same page at the same time — Notion's live multiplayer editing is genuinely excellent.",
      "You build databases, relations and dashboards; Notion's databases go well beyond what plain files can be.",
      "Nobody on the team has, or wants, a GitHub account.",
    ],
    pickForkLeafIf: [
      "You want your notes as files you can read in any editor, not blocks you have to export and lose things from.",
      "You want to write offline and trust that it works — ForkLeaf writes every keystroke to the device first.",
      "You want history without a retention window: every save is a git commit.",
      "You want notes beside your code, reviewed in pull requests and published to GitHub Pages.",
      "You want something that costs nothing per person and holds nothing on its own servers.",
    ],
    switching: [
      "In Notion: Settings → Export all workspace content → Markdown & CSV, then unzip the export.",
      "Open ForkLeaf, sign in with GitHub and choose the repository your notes will live in.",
      "⌘K → Import notes from Obsidian or Notion, choose Notion export, and pick the unzipped folder.",
      "The long ids Notion adds to file names are removed and links are rewritten to match. Database tables (CSV) are skipped, and the import says so.",
    ],
    faq: [
      {
        q: "Can I import my Notion workspace into ForkLeaf?",
        a: "Yes. Export your workspace from Notion as Markdown & CSV, unzip it, and import the folder in ForkLeaf. Pages, folders, links and pictures come across; Notion's random ids are stripped from file names and links are rewritten. Database tables are skipped and listed.",
      },
      {
        q: "Does ForkLeaf have real-time collaboration like Notion?",
        a: "Not live multiplayer editing. ForkLeaf collaborates the way code does: changes are proposed on a branch, discussed in a pull request and then merged, with the whole history kept in git.",
      },
      {
        q: "Does ForkLeaf work offline?",
        a: "Yes, and by default. Every edit is written to IndexedDB on your device first; the commit queue pushes to GitHub when there is a network again, and the status bar says what is saved where.",
      },
      {
        q: "What happens to my notes if ForkLeaf shuts down?",
        a: "Nothing. They are Markdown files in a repository on your own GitHub account. Clone it and keep going in any text editor.",
      },
    ],
  },
  {
    slug: "evernote",
    name: "Evernote",
    title: "ForkLeaf vs Evernote — a free, open-source Evernote alternative",
    description:
      "Evernote keeps notes in its cloud and exports them as ENEX. ForkLeaf keeps every note as plain Markdown in a GitHub repository you own — free, open source, offline-first and with full version history.",
    verdict:
      "Evernote keeps your notes in Evernote's cloud, and on the way out hands you an ENEX file. ForkLeaf never holds them at all: every note is a Markdown file in your own GitHub repository, free, with full history.",
    pickThemIf: [
      "You depend on Evernote's web clipper and its search inside scanned documents and images.",
      "You want an app that handles everything — including storage — with no account anywhere else.",
    ],
    pickForkLeafIf: [
      "You want notes in a format every text editor reads, not one only Evernote writes.",
      "You want history and offline editing without a paid plan.",
      "You want no note limits, no device limits and no tier to upgrade to.",
      "You want to link notes to each other with [[wikilinks]] and see the backlinks.",
    ],
    switching: [
      "Convert your ENEX export to Markdown with an open-source converter such as yarle or evernote2md.",
      "Open ForkLeaf, sign in with GitHub and choose the repository your notes will live in.",
      "Use Import → Markdown files and choose the converted folder; pictures beside the notes are copied too.",
    ],
    faq: [
      {
        q: "Is ForkLeaf a free Evernote alternative?",
        a: "Yes. ForkLeaf is free and open source with no paid tier, no note limit and no device limit. Notes are stored in your own GitHub repository rather than on ForkLeaf's servers.",
      },
      {
        q: "Can ForkLeaf import Evernote notes?",
        a: "Not ENEX directly. Convert the export to Markdown with an open-source tool such as yarle, then import the folder of Markdown files in ForkLeaf.",
      },
      {
        q: "Can I save web pages into ForkLeaf?",
        a: "Yes. ForkLeaf has a bookmarklet and a share target that save a page into the inbox/ folder of your notebook as a Markdown note.",
      },
    ],
  },
  {
    slug: "onenote",
    name: "OneNote",
    title: "ForkLeaf vs OneNote — Markdown notes instead of a proprietary notebook",
    description:
      "OneNote stores notebooks in a proprietary format in OneDrive. ForkLeaf stores every note as plain Markdown in a GitHub repository you own, with wikilinks, Mermaid diagrams and real git history.",
    verdict:
      "OneNote is a free-form canvas whose notebooks live in OneDrive in a format only OneNote reads. ForkLeaf is a Markdown notebook whose pages are plain files in your own GitHub repository.",
    pickThemIf: [
      "You write by hand with a pen or stylus — OneNote's ink and free-form canvas are its real strength.",
      "Your organisation already lives in Microsoft 365 and shares notebooks there.",
    ],
    pickForkLeafIf: [
      "You type, and want structure — headings, lists, tables, code — that survives outside the app.",
      "You want notes that link to each other with [[wikilinks]] and backlinks.",
      "You want diagrams as text, with a Mermaid studio, that render on GitHub too.",
      "You want every change in git history, and your notes beside your code.",
    ],
    switching: [
      "Export OneNote pages to Word, then convert them to Markdown with a tool such as Pandoc.",
      "Open ForkLeaf, sign in with GitHub and choose the repository your notes will live in.",
      "Use Import → Markdown files and choose the converted folder.",
    ],
    faq: [
      {
        q: "Is ForkLeaf a good OneNote alternative for developers?",
        a: "It is built for that. Notes are Markdown files in a GitHub repository, diagrams are Mermaid, code blocks are first class, and every change is a git commit you can review in a pull request.",
      },
      {
        q: "Does ForkLeaf support handwriting?",
        a: "No. ForkLeaf is a typed Markdown editor. You can paste or drop pictures of handwritten notes into a note, and they are committed to the repository alongside it.",
      },
    ],
  },
];

export function findCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((competitor) => competitor.slug === slug);
}
