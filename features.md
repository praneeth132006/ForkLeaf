# ForkLeaf features

Everything ForkLeaf can do, and how to do it. Almost everything is reachable
from the command palette: press **⌘K** (Ctrl+K on Windows and Linux) and type
a few words of what you want.

Notes are plain markdown files in your own GitHub repository (or in this
browser, before you connect one). Every feature below writes ordinary files, so
nothing only works inside ForkLeaf.

- [Roadmap checklist](#roadmap-checklist)
- [Writing](#writing)
- [Everyday writing](#everyday-writing)
- [Links between notes](#links-between-notes)
- [Search](#search)
- [Reading PDFs](#reading-pdfs)
- [Diagrams](#diagrams)
- [Checks and history](#checks-and-history)
- [Sync and GitHub](#sync-and-github)
- [Publishing and exporting](#publishing-and-exporting)
- [Desktop](#desktop)
- [Keyboard shortcuts](#keyboard-shortcuts)

---

## Roadmap checklist

Being built in this order. Ticked items are shipped and documented below.

- [x] Templates, today's note, every open to-do, focus mode
- [x] Bring back a deleted note
- [x] Graph view of the links between notes
- [x] Kanban board for a folder
- [x] Database views over note properties (table)
- [x] Flashcards from notes, with spaced repetition
- [x] Weekly review written from your notes
- [x] Save from anywhere: share sheet, bookmarklet and save address
- [x] Browser extension (save pages, quotes, images) and the Mind view
- [x] Encrypted notes
- [x] Notebook checks as a GitHub Action
- [x] MCP server so AI assistants can use your notebook
- [x] Voice notes
- [x] Import from Obsidian and Notion

---

## Writing

| Feature                    | How to use it                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Three views of a note**  | The Rich / Split / Source switch in the header, or **⌘1 / ⌘2 / ⌘3**. Switching never rewrites the file.                                                                                  |
| **Insert anything**        | Type **/** at the start of a line for headings, lists, to-dos, tables, code, images, YouTube videos, footnotes and diagrams. Works in all three views.                                   |
| **Formatting toolbar**     | Bold, italic, strikethrough, code, highlight, lists, links, images, tables and dividers. In Split and Source it edits the markdown itself.                                               |
| **Paste images**           | Paste or drop a picture. On a connected repository it is committed to `assets/` and linked by a relative path.                                                                           |
| **Properties**             | The Title and Tags fields in the right-hand panel are the note's YAML front matter, so notes open correctly in Obsidian, Jekyll and Hugo.                                                |
| **Outline and statistics** | The right-hand panel shows headings, word count, reading time and to-do progress.                                                                                                        |
| **Lock a note**            | The padlock in the header, or **⌘⇧L**. Stops typing and pasting without stopping reading or incoming sync.                                                                               |
| **Resize the columns**     | Drag the seam between two panels. Double-click it to reset.                                                                                                                              |
| **Try a rewrite**          | ⌘K → **Try a rewrite of this note**. You work on a git branch; **Compare**, **Keep it** or **Throw it away** from the bar at the top.                                                    |
| **Borrow a note**          | ⌘K → **Borrow a note from another notebook**, then `owner/name`. Writes a link pinned to the version you read — nothing is copied.                                                       |
| **Capture a web page**     | ⌘K → **Capture a web page as a source…**. Writes the address, the time you read it and a Wayback Machine copy into the note.                                                             |
| **Run code blocks**        | `bash`, `python` and `javascript` blocks have a **Run** button. Output is written under the block, and code runs in a throwaway virtual machine, never on your computer.                 |
| **Open files from disk**   | ⌘K → **Open a file from this computer…**, or "Open with ForkLeaf" from your operating system. **⌘S** writes the file back to where it came from; **⇧⌘S** is Save as (Chromium browsers). |

## Everyday writing

### Templates

1. Put any markdown file in a `templates/` folder — or open a note and choose
   ⌘K → **Save this note as a template**.
2. ⌘K → **New note from template: _name_**, give it a title.

These placeholders are filled in when the note is made:

| Placeholder     | Becomes             |
| --------------- | ------------------- |
| `{{title}}`     | The title you typed |
| `{{date}}`      | Today, `2026-09-13` |
| `{{time}}`      | Now, `14:05`        |
| `{{weekday}}`   | `Sunday`            |
| `{{yesterday}}` | `2026-09-12`        |
| `{{tomorrow}}`  | `2026-09-14`        |

Any other `{{braces}}` are left alone. A template's tags and other properties
are copied; its title and dates are not.

### Today's note

⌘K → **Open today's note** opens `journal/YYYY-MM-DD.md`, creating it if
needed. Write `templates/daily.md` to decide what a new day looks like;
otherwise it starts with the date, a to-do list and a notes section.

### Every open to-do

⌘K → **Show every open to-do** lists every unticked `- [ ]` in the notebook.

- Tick a box in the list and it is ticked in its note.
- Give a to-do a date with `📅 2026-09-14` or `due: 2026-09-14`. Overdue items
  come first and are marked.
- To-dos inside code blocks and in `templates/` are ignored.

### Flashcards

Write a card as one line in any note:

```markdown
Capital of Portugal :: Lisbon

- Mitochondria :: the powerhouse of the cell
```

⌘K → **Review flashcards** shows the cards due today, then new ones (up to 20
a session).

1. Read the question, press **Show answer** (or **Space**).
2. Grade it: **Again**, **Hard**, **Good** or **Easy** (or **1**–**4**). Each
   button shows when the card will come back.
3. A card you forgot comes round again before the session ends.

The schedule is kept in `reviews/flashcards.md`, a table with one row per card,
so it syncs to every device. Delete a row to start that card over. Lines in
code blocks, tables, headings and inline code are never cards, so `std :: vector`
is safe. Same spelling as Obsidian's spaced-repetition plugin.

### Save from anywhere

Keep a page, a quote, a link or an image from outside ForkLeaf. It lands as a
note in `inbox/`, with the address, the site and the date as properties.

- **From your phone:** install ForkLeaf from the browser, then use **Share →
  ForkLeaf** in any app.
- **From any browser:** ⌘K → **Copy the Save to ForkLeaf bookmarklet**, make a
  new bookmark, and paste it as the address. Press it on any page to save the
  page — or, with text selected, to save that text as a quote.
- **From anything else:** open
  `/editor?save=1&kind=quote&url=…&title=…&text=…` (`kind` is `page`, `quote`,
  `link` or `image`).

ForkLeaf always asks **Save to your notebook?** first, showing exactly what will
be written, because anyone can put that address in a link. It also tells you
when you have saved the same link before. Only `http` and `https` addresses are
kept.

### Browser extension

**Save to ForkLeaf** lives in `apps/extension`. Load it from
`chrome://extensions` → **Developer mode** → **Load unpacked**, then set your
ForkLeaf address in its **Options**.

- Toolbar button or **Alt+Shift+S** saves the page — or the selected text as a
  quote.
- Right-click a page, selection, link or image → **Save … to ForkLeaf**.

It opens ForkLeaf's save address, so ForkLeaf still asks before saving. It needs
no account and no host permissions. See `apps/extension/README.md`.

### Everything you saved

⌘K → **Show everything I saved** shows the inbox as a grid: quotes as quotes,
pictures as pictures, links with their site, newest first.

- Filter by **Quotes**, **Links**, **Notes** or **Images**, or search inside all
  of them (titles, text, sites and tags).
- Click a card to open its note; **Original** opens the page it came from.
- Pictures load through ForkLeaf's image proxy, so the sites never see you
  looking.

### Weekly review

⌘K → **Write this week's review** makes `journal/YYYY-wWW.md` (for example
`journal/2026-w37.md`) and opens it. It lists:

- **Started** — notes created this week, and how many words they came to
- **Worked on** — notes changed this week
- **Deleted** — notes removed this week (connected repositories only)
- **Overdue** and **Coming up** — dated to-dos, with a link to their note
- **Looking back** — an empty heading for your own thoughts

Running it again the same week opens the existing review instead of making a
second one. Weeks start on Monday. To-dos are copied as plain lines, not boxes,
so they are not counted twice in **Show every open to-do**.

### Encrypted notes

⌘K → **Encrypt this note…**, choose a passphrase, type it twice and tick that
you understand it cannot be recovered.

- The words, title and tags are sealed with AES-256-GCM; the key comes from
  your passphrase and never leaves the browser. **The filename is not
  encrypted** — rename the note first if the name is private.
- Opening the note asks for the passphrase. It then edits normally and stays
  open until you close the tab or ⌘K → **Lock this encrypted note**.
- ⌘K → **Remove encryption from this note** writes it back as plain text.
- On github.com the file says it is encrypted and shows only sealed text.
- Its properties cannot be edited in the panel while it is encrypted, and
  search, backlinks and to-dos do not see inside it.

### Voice notes

⌘K → **Record a voice note**, then **Start recording**, **Stop**, listen back,
and **Add to note**.

- The recording is saved in `assets/` beside the note, like a pasted picture,
  and a **Listen to the recording** link is added to the end of the note.
- In Split and Source view, and on published pages, that link plays as an
  audio player. On github.com it is a link to the file.
- Up to 10 minutes a recording (a file is committed in one request of up to
  3 MB).
- **Write a transcript as well** is optional and off by default. Your browser
  does the transcribing, not ForkLeaf — Chrome sends the audio to Google — and
  the transcript is quoted under the recording.
- Not available in an encrypted note, whose recording would be stored
  unencrypted.

### Focus mode

**⌘⇧F** (or ⌘K → **Enter focus mode**) hides the file tree, tabs, side panel
and status bar. Press it again, or **Leave focus** in the corner, to get your
layout back.

## Links between notes

| Feature                       | How to use it                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Wikilinks**                 | `[[Note title]]`, `[[path/to/note]]`, `[[note\|shown text]]`, `[[note#heading]]`.                                     |
| **Backlinks**                 | The right-hand panel lists every note linking to this one, with the line the link is on.                              |
| **Links to unwritten notes**  | Drawn muted rather than broken. Click one to create the note.                                                         |
| **Link hover cards**          | Hover an external link to see its title, description and picture — fetched by the server, so the site never sees you. |
| **Links to repository files** | `[[repo:scripts/deploy.sh]]`, optionally pinned with `@a1b2c3d`. Opens the file in place.                             |
| **Clickable diagram boxes**   | A `[[wikilink]]` in a Mermaid label makes the box open that note.                                                     |

## Seeing the notebook

### Graph

⌘K → **Show the graph of my notes**. Every note is a dot and every `[[link]]`
between two notes is a line.

- Opens on the notes within two links of the one you are in. **Whole notebook**
  shows everything; tick **Notes with no links** to include unlinked notes.
- Scroll to zoom, drag to move, **Reset view** to fit everything again.
- Point at a note to light up its neighbours. Type in **Find a note** to pick
  one out. Click (or Tab to it and press Enter) to open it.

### Board

⌘K → **Show this folder as a board**.

- Notes in the folder (and its subfolders) are laid out in columns by their
  `status` property. **Columns from** switches to any other property.
- Drag a card to another column — or use the menu on the card — and that
  note's property is changed. Moving a card to **No status** removes it.
- **Add** makes a new, empty column to move cards into.
- **Notes in** switches folder.

### Table

⌘K → **Show this folder as a table**.

- One row per note, one column per property the notes have.
- Click a column header to sort; click it again to reverse. Numbers sort as
  numbers, and empty cells go last.
- Type in **Filter** to show only rows containing every word.
- Click a cell to edit it; **Enter** saves, **Esc** cancels. Lists stay lists
  (`a, b, c`), numbers stay numbers, and an empty cell removes the property.
- **Add** gives every row a new property column to fill in.

The board and table store nothing of their own: every change is written into
the note's front matter. Notes in `templates/` are left out, and a note locked
on this device is not changed.

## Search

- **⌘K** searches every word of every note, ranked, with the matching line
  quoted. `"Quoted phrases"` must match exactly.
- Notes linked to the one you have open rank higher.
- The text of PDFs you have opened is searched too, under **Documents**.
- The **dashboard** (⌘⇧D) indexes every note across every connected repository.

## Reading PDFs

| Feature                          | How to use it                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Open a PDF**                   | Click a `.pdf` in the sidebar, drop one on the window, or ⌘K → **Open a PDF…**.                                                   |
| **Choose where PDFs open**       | ⌘K → **Open PDFs in this window / beside the note / in their own browser tab**.                                                   |
| **Quote into note**              | Select text → **Quote into note**. Writes a blockquote and a link that finds the sentence even after revisions.                   |
| **Highlights**                   | Select text → **Highlight**. Stored as lines in `<document>.highlights.md` beside the PDF.                                        |
| **Notes about this paper**       | The **Notes** tab beside a document lists every note quoting it.                                                                  |
| **Start a note from a paper**    | **Write about this** — title, author, date and section headings filled in.                                                        |
| **Follow along**                 | Read beside a note in Split or Source view: the cursor and the page follow each other through your citations.                     |
| **Scans**                        | Commit the recognised text as `<name>.text.md` (a `## Page 1` heading per page), or ⌘K → **Keep this document's text beside it**. |
| **Save a PDF into the notebook** | **Save to notebook** commits a dropped file to `papers/`.                                                                         |
| **Copy a citation link**         | Select text → **Copy link** for `paper.pdf#page=12&q=…`.                                                                          |

## Diagrams

- **/ → Diagram** or the toolbar button opens a gallery of 14 templates:
  flowchart, sequence, class, state, ER, Gantt, mind map, pie, journey,
  timeline, git graph, quadrant and more.
- **Visual** mode lets you drag boxes and draw arrows for flowchart, sequence,
  class, state, ER and mind-map diagrams. **Source** mode has autocomplete and
  plain-language errors.
- **Open in tab** gives a diagram its own browser tab, saving into the note as
  you edit.
- Stored as ordinary ` ```mermaid ` blocks, so they render on github.com.

## Checks and history

| Feature                             | How to use it                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Version history**                 | Properties panel → **Version history**: every commit of the note, with a diff.                                                                                                                            |
| **Replay how a note was written**   | ⌘K → **Replay how this note was written**.                                                                                                                                                                |
| **When each paragraph was written** | ⌘K → **See when each paragraph was written**; point at a paragraph to see what it used to say.                                                                                                            |
| **The notebook on a past date**     | ⌘K → **Show me my notebook as it was on…**. Read-only.                                                                                                                                                    |
| **Bring back a deleted note**       | ⌘K → **Bring back a deleted note**, pick how far back, preview, then **Bring it back**. Restored at its old path with its properties; a note that was only moved is marked. Needs a connected repository. |
| **Stale notes**                     | ⌘K → **Check which of my notes have gone stale**: missing files, dead links, aged claims.                                                                                                                 |
| **Citation check**                  | ⌘K → **Check my citations against their documents**, with one-press page-number fixes.                                                                                                                    |
| **What changed in a PDF**           | ⌘K → **See what changed in this document**, then pick a page to compare side by side.                                                                                                                     |
| **Unused images**                   | Lists images no note refers to, so they can be removed.                                                                                                                                                   |

### Notebook check on every pull request

Copy `docs/workflows/notebook-check.yml` into your notes repository as
`.github/workflows/notebook-check.yml`. On every pull request that touches
markdown, and every push to `main`, it:

- checks that every file a note points at exists and every `[[link]]` finds a
  note, reading the notes at that exact commit;
- writes a report to the job summary and marks each broken reference on its
  file;
- fails only for broken references — notes that may have aged are listed as
  worth re-reading, never failed;
- warns and passes if ForkLeaf cannot be reached.

Public repositories need nothing else. For a private one, set the repository
variable `FORKLEAF_SEND_TOKEN` to `true` so the job's own short-lived
`GITHUB_TOKEN` is sent with the request, or run your own ForkLeaf and set
`FORKLEAF_URL`.

### Use your notebook from an AI assistant

`packages/mcp` is an MCP server, so Claude Code, Claude Desktop or any other
MCP client can work with your notes. Give it a GitHub token for your notes
repository and add it to your assistant — the setup is in
`packages/mcp/README.md`.

| Tool                   | What the assistant can do                           |
| ---------------------- | --------------------------------------------------- |
| `search_notes`         | Search every note, with the line each match is on   |
| `list_notes`           | List the notes, or those in one folder              |
| `read_note`            | Read a note in full, with the notes that link to it |
| `write_note`           | Create or replace a note, as one commit             |
| `append_to_daily_note` | Add to today's `journal/YYYY-MM-DD.md`              |

It talks to GitHub directly, never through ForkLeaf. It will not touch anything
but notes, anything in a hidden folder, or anything outside the notebook, and it
neither shows nor overwrites encrypted notes. Set `FORKLEAF_READ_ONLY=true` to
offer only the tools that read.

### Import from Obsidian or Notion

⌘K → **Import notes from Obsidian or Notion**, pick the source, choose the
folder, check what will come across, then **Import**.

- **Obsidian:** choose the vault folder. Folders and front matter come across
  as they are; `![[picture.png]]` embeds become ordinary images pointing at
  where the picture landed, and `![[Note]]` embeds become `[[Note]]` links.
  `.obsidian` settings and `.trash` are left behind.
- **Notion:** Settings → Export all workspace content → Markdown & CSV, unzip
  it, and choose the folder. The long ids Notion adds to every name are
  removed, and links between pages are rewritten so they still work. Database
  tables (CSV) are skipped, with the reason shown.
- Everything goes into one folder of its own (`Imported/Obsidian` or
  `Imported/Notion` unless you change it), and nothing already in the notebook
  is overwritten. Pictures, PDFs and recordings are copied; other files, and
  anything over 3 MB, are listed as left out.

## Sync and GitHub

- **Local first.** Every keystroke is saved in the browser; a background queue
  pushes commits to GitHub. **⌘S** pushes now.
- **Clean history.** Rapid edits are combined into one commit rather than
  hundreds.
- **Offline.** Changes wait and are sent when you reconnect.
- **Conflicts.** When a note changed here and on GitHub, you choose what to keep.
- **Branches.** Switch the branch from the status bar.
- **Propose changes.** For a repository you cannot push to, ForkLeaf forks it
  and opens a pull request.
- **Review a pull request.** ⌘K → **Review this note as a pull request**:
  comments beside the paragraphs they are about, replies and merge.
- **A file too big to send.** Click the sync status → **Resize** or **Remove**.
- **Several repositories.** Connect as many as you like from the sidebar and
  switch between them.

## Publishing and exporting

| Feature                        | How to use it                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Publish a note**             | ⌘K → **Publish this note as a page…**. Commits a page to `docs/` and switches on GitHub Pages. |
| **Publish a folder as a book** | Right-click a folder → **Publish as book…**. Contents page, one page per note, working links.  |
| **Suggestions from readers**   | Published pages carry **Suggest an edit**; ⌘K → **See what other people have suggested**.      |
| **Export**                     | **⌘⇧E**: PDF, Word, HTML, Markdown, plain text or JSON, made in your browser.                  |

## Desktop

Install ForkLeaf from the browser's address bar. On Linux, run
`./desktop/install-linux.sh` and `xdg-mime default forkleaf.desktop text/markdown`
to make it open `.md` files.

## Keyboard shortcuts

| Shortcut         | Does                             |
| ---------------- | -------------------------------- |
| **⌘K**           | Search notes, or run any command |
| **/**            | Insert menu                      |
| **⌘S**           | Push to GitHub now               |
| **⇧⌘S**          | Save as a file on this computer  |
| **⌘⇧N**          | New note                         |
| **⌘⇧D**          | Dashboard                        |
| **⌘⇧E**          | Export                           |
| **⌘⇧L**          | Lock or unlock the note          |
| **⌘⇧F**          | Focus mode                       |
| **⌘1 / ⌘2 / ⌘3** | Rich, Split and Source views     |
| **⌘\\**          | Show or hide the sidebar         |
| **⌘⇧?**          | Help                             |
| **Esc**          | Close a dialog                   |
