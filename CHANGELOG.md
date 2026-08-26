# Changelog

Notable changes to ForkLeaf. Dates are the release date; the git history is the
full record.

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
