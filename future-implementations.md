# Future implementations

What ForkLeaf could do next, and what has already moved from here into the app.
Shipped features, and how to use each one, are in [features.md](features.md).

When something on this list ships, tick it, add the date, and describe it in
`features.md`, `CHANGELOG.md` and the features page (`apps/web/src/lib/feature-catalog.ts`).

## Done

- [x] Templates, today's note, every open to-do, focus mode
- [x] Deleted notes, graph, board and table views
- [x] Flashcards with spaced repetition, weekly review
- [x] Save from anywhere (share sheet, bookmarklet) and the browser extension
- [x] Everything you saved, as a grid
- [x] Encrypted notes
- [x] Notebook check on every pull request
- [x] MCP server for AI assistants
- [x] Voice notes
- [x] Import from Obsidian and Notion
- [x] All tools as clickable buttons, and setup guides for the extension and MCP
- [x] Every tool and feature grouped in the `/` menu, which opens beside the line being typed (2026-09-13)
- [x] Program input for runnable code blocks, so code that reads input works (2026-09-13)
- [x] Saves from the extension go to their own repository, sorted automatically (2026-09-13)
- [x] One-step MCP setup: paste one address, sign in with GitHub (2026-09-13)
- [x] A documentation page for every feature (2026-09-13)

## Next

### Thinking with your notes

- [x] **Ask your notebook.** _(done 2026-09-13)_ Ask a question and get an answer written from your
      own notes, with every sentence linked to the lines it came from.
- [x] **Daily resurfacing.** _(done 2026-09-13)_ Each morning, one older note or highlight related to
      what you are writing now.
- [x] **Stale-note alerts.** _(done 2026-09-13)_ A weekly list of notes that point at code or files
      that have changed since the note was written.

### Capturing

- [ ] **Highlights on any web page.** Highlight text with the extension; it is
      kept in a note for that page, and shown again when you come back to it.
- [x] **Meeting mode.** _(done 2026-09-13)_ Record, transcribe, and pull the decisions and to-dos out
      of the transcript into the note.
- [ ] **Email to notebook.** Forward an email to a personal address and it arrives
      in your saves repository.

### Seeing and sharing

- [ ] **Timeline replay for the whole notebook.** Drag back through the history
      and watch notes appear, grow and link up.
- [ ] **Digital garden.** Publish a folder as a website with backlinks and a
      graph, from your own repository.
- [ ] **Shared notebooks with review.** A friend's edit arrives as a suggestion
      you accept, like a pull request, instead of overwriting the note.
- [x] **Canvas.** _(done 2026-09-13)_ Place notes, pictures and PDFs freely on a board, saved as a
      plain file in the repository.

### Distribution

- [ ] **Chrome Web Store listing** for Save to ForkLeaf, so it installs in one
      click instead of from a copy of the repository. Needs a developer account
      and a store review.
- [x] **Firefox** version of the extension _(done 2026-09-13)_.
- [ ] **Safari** version of the extension (needs Xcode to convert and sign).
- [ ] **`npx @forkleaf/mcp`** on npm, for people who want the local server
      without cloning the repository.
