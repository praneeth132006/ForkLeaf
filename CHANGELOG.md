# Changelog

Notable changes to ForkLeaf. Dates are the release date; the git history is the
full record.

## Unreleased

### Fixed — another account could read this browser's notebook

Signing out and signing in as a different GitHub account on the same browser
left the previous account's workspaces and notes in place: their repository
names, their folder structure, the full text of every note they had opened,
and an editor willing to let the new arrival type into them.

GitHub itself was never exposed — every request is authorised server-side by
the session cookie, which is why a repository the new account could not read
reported "Not Found" rather than handing over its contents. What leaked was the
local cache, which is where the words are.

A repository workspace now records the account that connected it and is listed
for nobody else, across the editor, the dashboard and the profile page. Nothing
is deleted: a notebook is hidden from other accounts and comes back intact when
its own account signs in. Being offline is treated as "could not ask" rather
than "signed out", so a notebook still opens without a network.

### Reading PDFs

ForkLeaf opens PDFs, beside the note you are writing from them.

- A reader in its own pane: page rendering, the document's own table of
  contents, and find-across-the-document that matches through line breaks,
  hyphenation and ligatures — so searching for "find" matches a page that
  really contains "ﬁnd"
- Open one by dragging it onto the window, from the command palette, from a
  `.pdf` in the repository file tree, from an ordinary markdown link in a note,
  or from the operating system's "Open with" list
- **Quote into note** turns a selected passage into a blockquote and a link.
  Nothing bespoke lands in the file: `[On Attention, p. 12](paper.pdf#page=12…)`
  renders on github.com and opens the right page in every other PDF reader
- Citations record the sentence, not the page. Clicking one finds those words
  in the document as it is now — so a citation still points at the right
  paragraph after the author adds a figure to page 4, and says so plainly when
  the passage has genuinely gone
- Nothing is ever written back to the PDF. The file in your repository stays
  exactly as it was committed

### Reading PDFs — in the window you are already in

- Clicking a PDF in the file tree now opens it **here**, in the middle of the
  editor, with the document's contents pinned open on the right. It used to
  throw you into a second browser tab, which is a strange thing for a notes
  app to do with a file that lives in the notebook you are looking at
- The contents column is a real column: **Contents** and **Find** as two tabs
  of it, and a seam you can drag. Documents with no table of contents of their
  own say so rather than showing an empty list
- Where PDFs open is now a choice of three rather than a toggle — in this
  window, beside the note, or in a browser tab — and the command palette shows
  all three with the current one marked, so it answers "where do they open
  now?" as well as changing it

### Readers can suggest a change to your notes

Programmers have had &ldquo;here is a fix for what you wrote&rdquo; for twenty
years and call it a pull request. Nobody has ever offered it to people writing
notes: a published page is something you read, and that is where it ends.

- Every page you publish now carries **Suggest an edit**. A reader who spots a
  mistake follows it, fixes the note in GitHub's own editor, and their change
  becomes a suggestion — GitHub does the forking and the pull request, and
  neither of you has to say those words
- ⌘K → **See what other people have suggested** lists what has come in: who,
  what, and when. **Read what changed** opens the diff and the conversation on
  GitHub, which is a thing GitHub does very well; **Accept** merges it into your
  notes from here, and the next sync brings it down to this device

The link points at the note in the repository it came from, never at the
published copy — a suggestion against a copy is one you could not accept
without hand-copying it back.

### The paper and the note stay on the same page

Read a document beside a note and the two follow each other: move the cursor
past a citation and the document turns to that page; turn to a page and the
note scrolls to what you wrote about it. This is what people open two windows
to fake.

Nothing is guessed. Every citation already records the page it came from, so
the mapping is the notebook's own. Above the first citation nothing follows —
a cursor in a heading is not a statement about any page. ⌘K → **Stop the
document following the note** switches it off; it works in Split and Source
view, where there is a cursor to follow.

### The citation format, written down

A ForkLeaf citation was always an ordinary Markdown link — a relative path plus
the `#page=` fragment every PDF reader has understood for twenty years, with the
W3C Web Annotation text selector spelled into a query string. That is only
useful to anybody else if it is written down, so it now is:
[the citation link format](/docs/citation-links), field by field, with what a
tool has to do to read one.

**Copy link** on a selected passage puts exactly that form on the clipboard, for
pasting into anything that is not ForkLeaf.

### Help knows about all of it

Ten features have gone in lately and the help dialog had not heard of any of
them. It now covers every one, in the same three beats: what it is in one line,
the exact words to press, and what happens when you do. Two new topics —
**Papers & PDFs** and **Checks & history** — and the existing ones gained the
resizable columns, the search that weighs what you are working on, diagram boxes
that are notes, and what to do about an image too big to send.

### Your notebook, on a day you choose

**Show me my notebook as it was on…** in the palette takes the whole notebook
back to a date: the files that existed that day, and any of them readable as it
stood. The per-note history answers "how did this page come to be?"; this
answers "what did I know when I made that decision?", which is a question about
the shape of the notebook rather than about one file in it.

Read-only, deliberately. Restoring one note is something the history panel does
well; a button that rolled a whole notebook back to March would be the most
dangerous control in the app.

Nothing new is stored. Git already holds every version of every file — a tree
read at an old commit is the same call as a tree read at the newest one.

### What a paragraph used to say

Pointing at a paragraph in the blame view now shows the wording it replaced,
taken from the revision before the commit that last changed it. A paragraph you
rewrote in March is one you changed your mind about, and what you changed it
_from_ is usually the most interesting thing on the page.

Nothing is shown for a paragraph that was added rather than rewritten, or for a
change older than the history that can be read — those are different facts, and
inventing a previous wording for them would be a lie.

### A diagram can be a map of your notebook

Write a `[[wikilink]]` in a box's label — `A["[[Deploy runbook]]"]` — and the
box becomes the way to that note. The label reads as the words you wrote, and
clicking it in the preview opens the note.

It stays plain text in the file: an ordinary mermaid label, so the diagram
still renders on github.com and in every other mermaid tool, showing the
brackets exactly as a `[[wikilink]]` in prose does there. Aliases work
(`[[deploy/runbook|The runbook]]`), and so do anchors.

In the rich editor a click on a diagram still opens it for editing, which is
what a click there has always meant — but the labels read correctly there too,
and in exports and published pages.

### What has gone stale, across the whole notebook

The freshness panel beside a note answers the question for the note you happen
to have open. **Check which of my notes have gone stale** answers it for all of
them: notes pointing at a file that is not in the repository, `[[links]]`
matching no note, and datable claims — version numbers, CVEs,
&ldquo;currently&rdquo; — in a note nobody has touched in a long time.

The first two are facts and are labelled as such; the third is an inference and
is reported as one. Nothing is changed: every row opens the note and gets out
of the way. **It is fine** takes a note off the list until it is edited again.

### Start a note from a paper

**Write about this** in the reader makes a note that is already about the
document: its title, its author and the date it was published in the
frontmatter, and its own table of contents as the note's headings — each one
linked to the page that section starts on. The document then moves aside and
sits beside the note you are writing.

Nothing is invented. A paper with no contents list of its own gets a single
"Notes" heading rather than a structure somebody would have to argue with.

### Search knows what you are working on

⌘K now weighs which notes are connected to the one you are in. Searching
"setup" in the middle of a project finds that project's setup rather than the
other five. A note you linked to and a note that linked to you count the same,
and the effect fades with distance — but it never beats a better kind of match,
so a note actually called what you typed still wins.

### Citations that check themselves

Every other tool stores a page number, and a page number quietly stops being
true: the author adds a figure to page 4 and every citation after it points one
page short. Nothing tells you. A ForkLeaf citation records the sentence, so the
question has an answer — and now there is somewhere to ask it.

- **Check my citations against their documents** in the palette reads every
  paper you have quoted and reports what it found: quotations that have moved
  to another page, quotations that matched only loosely, and the ones that are
  no longer in the document at all
- A moved quotation can have its page number corrected in place, one press per
  citation. The words, the context and the path are left exactly as they were —
  it is the page hint beside them that had gone stale
- A document that could not be read is reported as unread, never as a document
  full of broken citations

### ⌘K searches inside your documents

The reader has always extracted every page's text — that is what makes
find-in-document work through hyphenation and ligatures — and then threw it
away when the document closed. It is now kept beside the notebook, so ⌘K
searches the papers as well as the notes and jumps straight to the page. A
document is indexed the first time it is opened, and by the citation check.

### A picture too big to send can be resized instead of deleted

When an image cannot be pushed — a screenshot is larger than GitHub will take
in one request — the panel offered exactly one way out: remove it. The picture
was fine; there was simply more of it than the wire would carry.

- **Resize** now sits beside Remove for any PNG, JPEG or WebP that is stuck.
  Pick how small — as large as will still send, 1 MB, or 500 KB — and the
  picture is re-encoded, replaces the copy on this device, and is pushed again.
  Your notes keep showing it, at the same path, in the same format
- Quality comes down before size does, so a photograph stays full-size where it
  can; a screenshot comes down in scale, which is what actually makes it small
- Animated GIFs are not offered: a canvas holds one frame, so "resizing" one
  would silently throw away every frame but the first

### Fixed — removing a stuck image left the note pointing at nothing

**Remove** took the file out of the queue and off this device and left the
markdown in place, so a note that used to show a chart showed a broken-image
icon instead — with no file left anywhere to put back. It now takes the image
out of every note that used it, in every form a reference can take. A link to
the file keeps its words and loses the link; a line that held nothing but the
image goes with it.

### Everything you have written about a paper, on the paper

Open a PDF from your repository and the contents column has a third tab:
every note that quotes this document, each one showing the passage it took and
the page it came from, in the document's own order. Click the passage to go to
that page, or the note to open it.

Nothing new is stored to make this work. ForkLeaf already writes a citation as
an ordinary markdown link, so the notebook always knew which notes quote which
paper — it had no way of being asked. Months after reading something, that
list is the useful artefact: your own argument, assembled out of notes written
weeks apart, with the paper's words set into it.

### The columns are the width you want them

Every panel in the editor was a width somebody chose once. Each seam between
panels is now a handle: drag it and the column follows, double-click it and it
goes back to where it started. The widths are remembered on this device.

The handles are real separator widgets, so arrow keys move them, shift moves
them further, and Home and End take them to their limits. Nothing moves for
anyone who never touches a seam — the defaults are the widths the panels
already had.

### Reading PDFs — a tab of their own

- A PDF from your repository now opens in **its own tab**, full width. Half a
  laptop screen is not a width anybody reads a typeset page at. The tab is a
  real link — bookmark it, open two side by side, or send it to somebody with
  access to the same repository
- Reading _beside_ the note is still there and is now a choice rather than the
  only option: **Open beside this note** on a PDF in the sidebar for once, or
  **Open PDFs beside the note instead** in the palette for good
- **Save to notebook** commits a PDF opened from your desktop into a `papers/`
  folder beside the note you are reading it with, so its citations become real
  links. Documents too large for a browser commit say so rather than failing
- Opening a PDF has a button beside **New Note** — it used to be reachable only
  from the command palette, which meant only by people who already knew
- The reader's contents and find panels now slide over the page in a narrow
  window instead of taking a column from it, which had left about a hundred and
  sixty pixels for the document
- The header wraps rather than pushing **Close** off its own right edge
- Fitting to width uses the document's most common page size rather than its
  widest, so one fold-out no longer shrinks every ordinary page to suit it

## 1.0.0 — 2026-08-26

The first release.

ForkLeaf is a local-first Markdown workspace whose storage is a GitHub
repository you already own. Every note is a plain `.md` file committed to your
repo: real version history, no database to be locked out of, and nothing to
export because there was never anything to import.

### Writing

- Three editing modes per note — rich text, split source/preview, raw markdown
- Slash commands, a command palette (`⌘K`), and a properties panel that edits
  the note's YAML frontmatter directly
- Enter makes a line, not a paragraph, so the rich and source views agree about
  what the file contains
- Code blocks with syntax highlighting and a language picker; pasted code is
  detected and fenced with the language it appears to be in
- Document outline, word count, reading time, task progress

### Links and search

- `[[Wikilinks]]` in the Obsidian dialect, resolved by path, filename or title
- Backlinks that quote the line they were written on
- Full-text BM25 search across every note, in the browser, offline

### Diagrams

- A Mermaid studio: pick a diagram type, drag shapes onto a canvas, or write
  the source with autocomplete and plain-language errors
- 14 templates; six types drawable rather than typed
- Stored as ordinary ` ```mermaid ` blocks, so they render on github.com too

### Sync and history

- Local-first: edits land in IndexedDB immediately and push in the background
- Rapid edits coalesce into one commit rather than a thousand autosaves
- Offline-safe queue, conflict prompts, branch switching from the status bar
- Every version of every note read from the repository's own commit log
- Propose changes as a pull request against a repository you cannot push to
- Notes refresh themselves when someone else commits, without a reload

### Sharing and export

- Publish a note as a self-contained page committed to `docs/` and served by
  GitHub Pages
- Export to PDF, Word, HTML, Markdown, plain text or JSON — one note or the
  whole workspace, rendered in the browser

### Desktop

- Installs as an app and registers as a Markdown editor: `xdg-open note.md`
  opens it, and `⌘S` writes back to the file it came from

### Known limits

- No real-time multiplayer editing
- Editing files on your machine needs a Chromium-based browser (File System
  Access API); everything else works everywhere
