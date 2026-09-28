/**
 * Everything ForkLeaf does, as data.
 *
 * The features page reads this, and a test holds it to a few rules: every
 * entry says how to reach it, ids are unique, and no category is empty. It is
 * the web version of `features.md` at the root of the repository — when a
 * feature ships, it goes in both.
 */

export type FeatureTag = "new" | "github";

export interface Feature {
  id: string;
  title: string;
  /** One or two sentences: what it is for. */
  summary: string;
  /** How to reach it — a command, a shortcut or a place in the app. */
  how: string;
  tags?: readonly FeatureTag[];
  /** A documentation page with the full setup, for features that need one. */
  docs?: string;
}

export interface FeatureCategory {
  id: string;
  title: string;
  blurb: string;
  features: readonly Feature[];
}

export const FEATURE_CATEGORIES: readonly FeatureCategory[] = [
  {
    id: "writing",
    title: "Writing",
    blurb: "An editor for plain Markdown files that does not make you think about Markdown.",
    features: [
      {
        id: "three-views",
        title: "Three views of one file",
        summary:
          "Rich text that formats as you type, a split view with live preview, or the raw source. Switching never rewrites the file.",
        how: "Rich / Split / Source in the header, or ⌘1 ⌘2 ⌘3",
      },
      {
        id: "insert-menu",
        title: "Press / for anything",
        summary:
          "Headings, lists, to-dos, tables, code, images, YouTube videos, footnotes and diagrams — in every view.",
        how: "Type / at the start of a line",
      },
      {
        id: "paste-images",
        title: "Paste images straight in",
        summary:
          "Screenshots are committed to assets/ and linked by a relative path, so they still render on github.com.",
        how: "Paste or drop a picture into a note",
      },
      {
        id: "properties",
        title: "Properties are real front matter",
        summary:
          "Title, tags and anything else you add are YAML at the top of the file, readable by Obsidian, Jekyll and Hugo.",
        how: "The properties panel on the right",
      },
      {
        id: "templates",
        title: "Templates",
        summary:
          "Any note in templates/ becomes a starting point, with {{title}}, {{date}} and {{weekday}} filled in.",
        how: "⌘K → New note from template",
        tags: ["new"],
      },
      {
        id: "today",
        title: "A note for today",
        summary:
          "journal/YYYY-MM-DD.md, made from templates/daily.md when you have one — somewhere for the day's scraps.",
        how: "⌘K → Open today's note",
        tags: ["new"],
      },
      {
        id: "focus",
        title: "Focus mode",
        summary:
          "The file tree, tabs, panels and status bar step away, and come back exactly as they were.",
        how: "⌘⇧F",
        tags: ["new"],
      },
      {
        id: "encrypt",
        title: "Encrypted notes",
        summary:
          "Seal a note with a passphrase: its words, title and tags are unreadable on GitHub or anywhere else without it.",
        how: "⌘K → Encrypt this note…",
        tags: ["new"],
      },
      {
        id: "voice",
        title: "Voice notes",
        summary:
          "Record a thought, keep the audio beside the note and play it from there — with an optional transcript.",
        how: "⌘K → Record a voice note",
        tags: ["new"],
      },
      {
        id: "lock",
        title: "Lock a note",
        summary:
          "Stop stray keystrokes from editing a note you read constantly, without stopping sync.",
        how: "The padlock in the header, or ⌘⇧L",
      },
      {
        id: "run-code",
        title: "Code blocks that run",
        summary:
          "bash, Python and JavaScript blocks run in a throwaway virtual machine and write their output into the note.",
        how: "The Run button on a code block",
        tags: ["github"],
      },
      {
        id: "local-files",
        title: "Opens the .md files on your computer",
        summary:
          "Install ForkLeaf and it becomes a Markdown editor for your operating system; ⌘S writes the file back.",
        how: "⌘K → Open a file from this computer",
      },
    ],
  },
  {
    id: "organising",
    title: "Organising and remembering",
    blurb: "Ways to see a notebook as more than a list of files.",
    features: [
      {
        id: "wikilinks",
        title: "Links and backlinks",
        summary:
          "[[Wikilinks]] in the Obsidian dialect. Every note shows what links to it, quoting the line the link is on.",
        how: "Type [[ in a note; backlinks are in the right panel",
      },
      {
        id: "search",
        title: "Search every word",
        summary:
          "Full-text, ranked, offline — and notes linked to the one you are in float to the top.",
        how: "⌘K",
      },
      {
        id: "graph",
        title: "Graph of your notes",
        summary: "Every note as a dot and every link as a line, starting near the note you are in.",
        how: "⌘K → Show the graph of my notes",
        tags: ["new"],
      },
      {
        id: "todos",
        title: "Every open to-do in one list",
        summary:
          "Unticked boxes from across the notebook, overdue first. Tick one there and it is ticked in its note.",
        how: "⌘K → Show every open to-do",
        tags: ["new"],
      },
      {
        id: "board",
        title: "A folder as a board",
        summary: "Cards in columns by status. Drag one and the note's status property changes.",
        how: "⌘K → Show this folder as a board",
        tags: ["new"],
      },
      {
        id: "table",
        title: "A folder as a table",
        summary: "Every note's properties as columns you can sort, filter and edit in place.",
        how: "⌘K → Show this folder as a table",
        tags: ["new"],
      },
      {
        id: "learned-this-month",
        title: "What I learned this month",
        summary:
          "A journal page built from the month's new notes, flashcard progress and decisions, which you can publish.",
        how: "⌘K → What I learned this month",
        tags: ["new"],
      },
      {
        id: "health-badge",
        title: "Notebook health badge",
        summary:
          "A README badge for your notes repository showing broken links, stale notes and your review streak.",
        how: "/ → Notebook health badge",
        tags: ["new", "github"],
      },
      {
        id: "decisions",
        title: "Decision notes",
        summary:
          "Options with pros and cons weighed and scored, and the chosen option kept with a dated history of the decision.",
        how: "/ → Decision",
        tags: ["new"],
      },
      {
        id: "claim-checker",
        title: "Claim checker",
        summary:
          "While you write, underline sentences that nothing in your notes or saved sources backs, and see what backs the rest.",
        how: "⌘K → Check claims in this note",
        tags: ["new"],
      },
      {
        id: "map-note",
        title: "Map this note",
        summary:
          "A canvas of the note and every note it links with, laid out automatically, right in the note.",
        how: "/ → Map this note",
        tags: ["new"],
      },
      {
        id: "hands-free",
        title: "Hands-free review",
        summary:
          "A note's cards read aloud and answered by voice, each graded on its schedule — for studying while walking.",
        how: "/ → Flashcards: review by voice",
        tags: ["new"],
      },
      {
        id: "shared-decks",
        title: "Decks you can fork",
        summary:
          "Share a note's flashcards as a public GitHub repository; others copy it, keep their progress private, and pull in your updates.",
        how: "/ → Flashcards: shared deck",
        tags: ["new", "github"],
      },
      {
        id: "course",
        title: "A folder as a course",
        summary:
          "A folder's notes as lessons ordered by how they link, with progress, cards per lesson and a quiz at the end — in the note.",
        how: "/ → Course from a folder",
        tags: ["new"],
      },
      {
        id: "spaced-reading",
        title: "Spaced reading",
        summary:
          "Highlights from PDFs and quotes saved from the web come back a few a day, in the note, on the flashcard schedule.",
        how: "/ → Spaced reading",
        tags: ["new"],
      },
      {
        id: "explain-back",
        title: "Explain it back",
        summary:
          "Hide a note, write down what you remember, and see it side by side with the original — every sentence marked by what you forgot.",
        how: "⌘K → Explain it back",
        tags: ["new"],
      },
      {
        id: "flashcards",
        title: "Flashcards",
        summary:
          "Type Question :: Answer and press Enter: it becomes a card in the note that you turn over and grade in place, or review them all at once, on a spaced-repetition schedule that syncs with the notebook.",
        how: "Type Question :: Answer, or / → Flashcard",
        tags: ["new"],
      },
      {
        id: "flashcards-quick",
        title: "Cards from what you wrote",
        summary:
          "Select text and press + Card to make it an answer, or Blank to hide those words in the sentence. The status bar says how many cards are due; one click starts studying.",
        how: "Select text → + Card or Blank · ⌘⇧Y to study",
        tags: ["new"],
      },
      {
        id: "fading",
        title: "Fading from memory",
        summary:
          "Every note gets a forgetting curve from when you last opened it. The dashboard shows the notes you came back to before and are now losing, with Reread and Test myself.",
        how: "Dashboard → Fading from memory",
        tags: ["new"],
      },
      {
        id: "ai-receipts",
        title: "What the AI has read",
        summary:
          "A receipt for every send from this browser to a model: when, which provider and model, which note and how much of it, and what was asked. Kept on this device; the note's text is never stored in it.",
        how: "⌘K → See what the AI has read, or Receipts in the assistant",
        tags: ["new"],
      },
      {
        id: "meaning-search",
        title: "Search by meaning",
        summary:
          "Finds notes about the same thing in other words, learned from how your own notes use them — built on this device, nothing downloaded or sent. Steps in by itself when no note has the words you typed.",
        how: "Dashboard → search → By meaning",
        tags: ["new"],
      },
      {
        id: "scheduled-notes",
        title: "Scheduled notes",
        summary:
          "Give a template a schedule property — daily, weekdays, weekly, monthly or a day like friday — and its note is made the first time you open ForkLeaf in that period. Only ever for the current one.",
        how: "templates/ → add property schedule",
        tags: ["new"],
      },
      {
        id: "then-and-now",
        title: "Then and now",
        summary:
          "The note as it was a month, six months or a year ago, beside today's — words, paragraphs added and let go, and the diff. Read from the repository's own history.",
        how: "⌘K → This note, then and now",
        tags: ["new", "github"],
      },
      {
        id: "map-of-contents",
        title: "Map of contents",
        summary:
          "Writes a list of every note linked with this one and every note sharing its tags into the note, as ordinary [[links]]. Run it again to refresh it.",
        how: "⌘K → Write this note's map of contents",
        tags: ["new"],
      },
      {
        id: "present",
        title: "Present a note",
        summary:
          "The open note full screen, a slide per section — or per --- line if it has them — with diagrams and maths as they are in the note.",
        how: "⌘K → Present this note",
        tags: ["new"],
      },
      {
        id: "math",
        title: "Maths",
        summary:
          '$E=mc^2$ inline and $$…$$ blocks, typeset with KaTeX in the preview. Prices stay prices: "$5 and $10" is not a formula.',
        how: "Type $…$ or $$…$$",
        tags: ["new"],
      },
      {
        id: "diagram-cards",
        title: "Cards from diagrams",
        summary:
          "In a note tagged flashcards, every arrow in a flowchart or state diagram and every branch of a mind map becomes a card: what comes after this step?",
        how: "Tag the note flashcards",
        tags: ["new"],
      },
      {
        id: "weekly-review",
        title: "Weekly review",
        summary:
          "A note listing what you started, worked on and deleted this week, and what is overdue.",
        how: "⌘K → Write this week's review",
        tags: ["new"],
      },
      {
        id: "dashboard",
        title: "Dashboard",
        summary: "Every note across every connected repository, indexed by title, tag and folder.",
        how: "⌘⇧D",
        tags: ["github"],
      },
    ],
  },
  {
    id: "saving",
    title: "Saving from the web",
    blurb: "Keep what you find elsewhere, with where it came from.",
    features: [
      {
        id: "save-anywhere",
        title: "Save from anywhere",
        summary:
          "Share a page, a quote, a link or a picture into inbox/. ForkLeaf always shows what will be saved and asks first.",
        how: "Share → ForkLeaf on a phone, or the bookmarklet from ⌘K",
        tags: ["new"],
      },
      {
        id: "extension",
        title: "Save to ForkLeaf extension",
        summary:
          "One click, or a right-click on a selection, link or image. No account and no host permissions.",
        how: "Alt+Shift+S, or right-click → Save to ForkLeaf — in Chrome, Edge, Brave, Arc or Firefox",
        docs: "/docs/browser-extension",
        tags: ["new"],
      },
      {
        id: "everything-saved",
        title: "Everything you saved",
        summary:
          "The inbox as a grid — quotes as quotes, pictures as pictures — with filters and search.",
        how: "⌘K → Show everything I saved",
        tags: ["new"],
      },
      {
        id: "capture",
        title: "Sources that survive link rot",
        summary: "A citation with the page's real title, when you read it, and an archived copy.",
        how: "⌘K → Capture a web page as a source",
        tags: ["github"],
      },
      {
        id: "hover-cards",
        title: "Link hover cards",
        summary:
          "See a link's title, description and picture before opening it — fetched so the site never sees you.",
        how: "Hover a link in a note",
      },
    ],
  },
  {
    id: "papers",
    title: "Reading papers",
    blurb: "PDFs are part of the notebook, not attachments to it.",
    features: [
      {
        id: "pdf-reader",
        title: "Read a PDF beside your note",
        summary:
          "Its own table of contents, find that matches through hyphenation, and a pane you can resize.",
        how: "Click a .pdf in the sidebar, or drop one on the window",
      },
      {
        id: "quote",
        title: "Quote into a note",
        summary:
          "A citation that records the sentence, not the page, so it still finds the passage after the paper is revised.",
        how: "Select text in the document → Quote into note",
      },
      {
        id: "highlights",
        title: "Highlights as a text file",
        summary:
          "Highlights live in a markdown file beside the PDF. The PDF itself is never touched.",
        how: "Select text → Highlight",
      },
      {
        id: "paper-notes",
        title: "Everything you wrote about a paper",
        summary:
          "Every note quoting a document, with the passage it took and the page, in the paper's own order.",
        how: "The Notes tab beside the document",
      },
      {
        id: "follow",
        title: "Paper and note on the same page",
        summary:
          "Moving through the note turns the document to the page you are writing about, and back.",
        how: "Read beside a note in Split or Source view",
      },
      {
        id: "search-documents",
        title: "Search inside your documents",
        summary: "⌘K finds words in every PDF you have opened, and opens it at the page.",
        how: "⌘K and type a phrase",
      },
    ],
  },
  {
    id: "diagrams",
    title: "Diagrams",
    blurb: "Mermaid, without having to remember Mermaid.",
    features: [
      {
        id: "diagram-gallery",
        title: "Templates for every diagram type",
        summary:
          "Flowcharts, sequence, state, ER, Gantt, mind maps, timelines and more, each drawn as a preview.",
        how: "/ → Diagram",
      },
      {
        id: "visual-builder",
        title: "Draw instead of type",
        summary:
          "Drag boxes and pull arrows for six diagram types; the Mermaid is written for you.",
        how: "Visual mode in the diagram editor",
      },
      {
        id: "clickable-boxes",
        title: "A box can be a note",
        summary: "Put a [[wikilink]] in a label and the box opens that note.",
        how: 'A["[[Deploy runbook]]"]',
      },
      {
        id: "diagram-diff",
        title: "See a diagram change",
        summary:
          "Two versions of a diagram compared as graphs, so a renamed box reads as a rename.",
        how: "Diagram changes in a pull request",
        tags: ["github"],
      },
    ],
  },
  {
    id: "history",
    title: "History and checks",
    blurb: "Git already keeps everything. These are ways to use that.",
    features: [
      {
        id: "version-history",
        title: "Every version of every note",
        summary:
          "The commit log for a note, any old version readable, and a replay of how it was written.",
        how: "Properties panel → Version history",
        tags: ["github"],
      },
      {
        id: "blame",
        title: "Where did this paragraph come from?",
        summary: "When each paragraph last changed, and what it said before.",
        how: "⌘K → See when each paragraph was written",
        tags: ["github"],
      },
      {
        id: "time-machine",
        title: "The notebook on any date",
        summary: "The files that existed that day, each readable as it stood. Read-only.",
        how: "⌘K → Show me my notebook as it was on…",
        tags: ["github"],
      },
      {
        id: "deleted",
        title: "Bring back a deleted note",
        summary:
          "Notes that are gone now, read from the history and restored at the path they had.",
        how: "⌘K → Bring back a deleted note",
        tags: ["new", "github"],
      },
      {
        id: "rewrite",
        title: "Try a rewrite",
        summary:
          "Rewrite a note on a branch, compare it with the original, then keep it or throw it away.",
        how: "⌘K → Try a rewrite of this note",
        tags: ["github"],
      },
      {
        id: "stale",
        title: "Notes that say they have gone stale",
        summary:
          "Links to files that have gone, links to no note, and claims nobody has checked in years.",
        how: "⌘K → Check which of my notes have gone stale",
      },
      {
        id: "notebook-check-action",
        title: "Notebook check on every pull request",
        summary:
          "A GitHub Actions workflow that fails a pull request which leaves a note pointing at a missing file or a link to no note.",
        how: "Copy docs/workflows/notebook-check.yml into .github/workflows",
        tags: ["new", "github"],
      },
      {
        id: "citations",
        title: "Are my quotations still true?",
        summary:
          "Every quotation checked against its document, with a one-press fix for a moved page.",
        how: "⌘K → Check my citations against their documents",
        tags: ["github"],
      },
    ],
  },
  {
    id: "sharing",
    title: "Sync, sharing and export",
    blurb: "Your repository, your files, and nothing held hostage.",
    features: [
      {
        id: "local-first",
        title: "Local first, synced to GitHub",
        summary:
          "Every keystroke is saved in the browser first. Changes are pushed as tidy commits and wait while you are offline.",
        how: "Automatic; ⌘S pushes now",
      },
      {
        id: "conflicts",
        title: "Real conflict resolution",
        summary:
          "Edit a note on two devices and ForkLeaf shows both versions instead of picking one.",
        how: "Appears when it happens",
        tags: ["github"],
      },
      {
        id: "publish",
        title: "Publish a note, or a folder as a book",
        summary:
          "Pages committed to your own repository and served by GitHub Pages, with links between notes intact.",
        how: "⌘K → Publish this note as a page",
        tags: ["github"],
      },
      {
        id: "suggestions",
        title: "Readers can suggest corrections",
        summary:
          "Published pages carry Suggest an edit; read and accept suggestions without leaving ForkLeaf.",
        how: "⌘K → See what other people have suggested",
        tags: ["github"],
      },
      {
        id: "propose",
        title: "Review a note like code",
        summary:
          "Propose changes to a repository you cannot push to, and review pull requests as rendered notes.",
        how: "⌘K → Review this note as a pull request",
        tags: ["github"],
      },
      {
        id: "borrow",
        title: "Borrow a note",
        summary:
          "Link to a note in someone else's notebook, pinned to the version you read — nothing is copied.",
        how: "⌘K → Borrow a note from another notebook",
        tags: ["github"],
      },
      {
        id: "assistant",
        title: "An assistant beside the note",
        summary:
          "Claude, GPT, Gemini or a model on your own machine, in a column next to what you are writing — with the note as context, and every answer one button from being part of it. Your key, kept in this browser; nothing passes through ForkLeaf.",
        how: "⌥⌘A, or the sparkle in the header",
        docs: "/docs/assistant",
        tags: ["new"],
      },
      {
        id: "mcp",
        title: "Use your notebook from an AI assistant",
        summary:
          "An MCP server so Claude and other assistants can search, read and write your notes, talking to GitHub directly.",
        how: "All tools → Connect an AI assistant: paste one address, sign in",
        docs: "/docs/mcp",
        tags: ["new", "github"],
      },
      {
        id: "slash-tools",
        title: "Every feature in the / menu",
        summary:
          "Blocks and tools together — flashcards, to-dos, voice notes, graph, encryption, history — grouped and searchable, beside the line you are typing.",
        how: "Type / at the start of a line, then keep typing to search",
        tags: ["new"],
      },
      {
        id: "program-input",
        title: "Code that asks for input",
        summary:
          "Runnable Python, shell and JavaScript blocks can read input — ForkLeaf asks for the answers before the run.",
        how: "Run a block that uses input(), then fill in Program input",
        tags: ["new"],
      },
      {
        id: "saves-repo",
        title: "A repository for everything you save",
        summary:
          "Pages, quotes, links and pictures saved from the web are filed into a private forkleaf-saves repository by kind and month, with an index.",
        how: "Save with the extension, share sheet or bookmarklet",
        docs: "/docs/saving",
        tags: ["new", "github"],
      },
      {
        id: "canvases",
        title: "Canvases",
        summary:
          "A board of cards, notes, links and groups joined by arrows, drawn in the note where you make it and saved as JSON Canvas so it opens in Obsidian too.",
        how: "/ → Canvas, or click a .canvas file",
        docs: "/docs/canvases",
        tags: ["new"],
      },
      {
        id: "ask",
        title: "Ask your notebook",
        summary:
          "Ask a question and get the passages in your notes that answer it, quoted with the note and line. No AI, nothing leaves the device.",
        how: "/ → Ask your notebook",
        docs: "/docs/ask",
        tags: ["new"],
      },
      {
        id: "meetings",
        title: "Meeting notes",
        summary:
          "Start a meeting note, then pull out decisions, action items with owners and dates, and open questions into a summary.",
        how: "/ → Start meeting notes, then / → Pull out decisions and to-dos",
        docs: "/docs/meetings",
        tags: ["new"],
      },
      {
        id: "resurfacing",
        title: "Worth revisiting",
        summary:
          "A few older notes each day — linked to what you are writing, written on this day, or long forgotten — with why each was chosen.",
        how: "Document panel → Worth revisiting, or / → Open a note worth revisiting",
        docs: "/docs/resurfacing",
        tags: ["new"],
      },
      {
        id: "weekly-stale",
        title: "Stale notes in the weekly review",
        summary:
          "The weekly review lists notes pointing at things that no longer exist, and notes that have gone out of date.",
        how: "/ → Write this week's review → Worth a look",
        tags: ["new"],
      },
      {
        id: "import",
        title: "Import from Obsidian or Notion",
        summary:
          "Bring a vault or a Notion export across, with embeds turned into images and links rewritten to still work.",
        how: "⌘K → Import notes from Obsidian or Notion",
        tags: ["new"],
      },
      {
        id: "export",
        title: "Export anywhere",
        summary:
          "PDF, Word, HTML, Markdown, plain text or JSON, made in your browser with diagrams included.",
        how: "⌘⇧E",
      },
    ],
  },
];

export function allFeatures(
  categories: readonly FeatureCategory[] = FEATURE_CATEGORIES,
): Feature[] {
  return categories.flatMap((category) => [...category.features]);
}

/** Categories cut down to the features matching every word typed and the chosen tag. */
export function searchFeatures(
  query: string,
  onlyTag: FeatureTag | null = null,
  categories: readonly FeatureCategory[] = FEATURE_CATEGORIES,
): FeatureCategory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return categories
    .map((category) => ({
      ...category,
      features: category.features.filter((feature) => {
        if (onlyTag && !feature.tags?.includes(onlyTag)) return false;
        const haystack =
          `${feature.title} ${feature.summary} ${feature.how} ${category.title}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      }),
    }))
    .filter((category) => category.features.length > 0);
}
