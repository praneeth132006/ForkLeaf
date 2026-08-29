# Changelog

Notable changes to ForkLeaf. Dates are the release date; the git history is the
full record.

## Unreleased

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
