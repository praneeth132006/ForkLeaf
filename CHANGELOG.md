# Changelog

Notable changes to ForkLeaf. Dates are the release date; the git history is the
full record.

## Unreleased

### Notebook health badge

A README badge for a notes repository — broken links, stale notes and the
flashcard review streak — served by `/api/badge` for public repositories and
added to a note with `/` → **Notebook health badge**. It never shows as a broken
image: a repository it cannot read gets a grey badge saying why.

### Decision notes

`/` → **Decision** lays out options with weighed pros and cons and a score for
each, then keeps the chosen option with a dated history of every choice and
change of mind — as plain lines in a ` ```decision ` block in the note.

### Claim checker

⌘K or `/` → **Check claims in this note** underlines, as you write, sentences
that state something nothing in your other notes, saved sources or highlights
backs — and says which note and line backs the ones that are. On per note,
remembered on this device, and the note's text is never touched.

### Map this note

`/` → **Map this note** builds a canvas of the note and every note it links with
— links out on the right, links in on the left, arrows following each link — laid
out automatically and placed in the note, one or two links deep.

### Hands-free review

`/` → **Hands-free review** reads a note's cards aloud, listens for the answer,
says the right one when it was missed, and grades each card — with "repeat",
"skip", "I don't know" and "stop" by voice — for studying while walking.

### Decks you can fork

`/` → **Shared deck** shares a note's cards as a public GitHub repository
(after asking, and with only the card lines), copies someone's shared deck into
a note, and later pulls in a newer version — adding, changing and removing
cards while keeping any card you rewrote or added. Progress stays private in
your own schedule.

### A folder as a course

`/` → **Course from a folder** turns a folder's notes into lessons ordered by how
they link, with an index note first, ticks for what is done, a progress bar and
the next lesson, flashcards counted per lesson, and a quiz at the end drawn from
all of them — in the note, with progress kept in the note's ` ```course `
block.

### The editor no longer slides sideways in a narrow column

With both side panels open, a wide window still leaves a narrow column for the
note, but the header chose its labels by the window's width. Search and All
tools were drawn in full, the last buttons were pushed past the edge, the open
note tabs shrank to nothing, and the whole column scrolled sideways whenever a
button in it took focus. The header now sizes its labels by its own width.

### Writing below a card, a board or a diagram at the end of a long note

A note that ended in a canvas, a flashcard, a spaced-reading block or a diagram
had nowhere to type after it once it was taller than the screen: the space
under the last block belongs to the page around the editor, and clicks there
were never seen. Clicking below the last block now puts a line there, and
clicking below text puts the caret at its end.

### Spaced reading

Highlights were made and never seen again. `/` → **Spaced reading** puts a
block in the note that brings back a few passages a day — PDF highlights, saved
quotes, and highlights on saved pages — on the flashcard schedule, in your own
repository. Each is sent back soon, later, or never, and says when it returns.

### Explain it back

⌘K or `/` → **Explain it back** hides the note where it was and asks for what
you remember of it, then compares the two side by side: each sentence of the
note marked remembered, partly or missed, the words left out named, a score for
the key ideas recalled, and anything written that the note does not support
flagged. Stemmed word matching on the device — no account, no upload.

### Flashcards and canvases where you write them

A `Question :: Answer` line stayed a line of text, with nothing to say it was a
card or how to study it. It now turns into a card the moment Enter is pressed —
and every such line is drawn as one when a note opens. Click to turn it over,
grade it in place, and it says when it is next due; the grade goes into the same
`reviews/flashcards.md` the review session uses. **Edit** changes it in place.
The file keeps the plain line. The preview draws the same lines as cards that
open to their answer. `Use std::vector here` is no longer read as a card.

A canvas made from `/` opened in a window over the note and left nothing on the
page, so a diagram you drew could not be seen where you were writing. `/` →
**Canvas** now draws the board in the note itself, stored as a ` ```canvas `
block of JSON Canvas. A board's Delete and Enter keys only act while the board
has focus, so they no longer take Backspace from the paragraph below.
`.canvas` files still open on their own.

### A flashcards home you can start from

Flashcards opened straight into a review with no explanation, so there was no
way to tell what a card was, how to make one, or why cards came back. `/` →
**Flashcards** now opens a home: how many cards are waiting, a three-step **How
flashcards work**, **Add a card** with question and answer fields (no syntax),
**Cards from this note** — definitions the open note already holds, ticked and
added under `## Flashcards` — and **Decks**, one per note, each studied or
practised on its own. Grades say what they mean (Forgot it, Barely, Knew it,
Too easy) and when the card comes back, and a session ends with a way back.

### Canvas cards can be edited again

Double-clicking a card made a new empty card under it instead of opening the
card: pressing a card captures the pointer on the board so it can be dragged,
and the browser then sends the double-click to the board. Double presses are
now timed on the card itself, so double-clicking writes in a card or renames a
group, double-clicking empty space adds one, and a selected card also opens with
Enter or the new **Edit** button.

### Canvases

`/` → **New canvas** opens a board for placing cards, notes, links and groups
freely and joining them with arrows. Cards are added from the toolbar or by
double-clicking, moved by dragging (Shift-click for several), resized from the
corner, connected by dragging a card's edge dot onto another, coloured with the
six JSON Canvas presets, and deleted with their arrows; a group carries the
cards inside it. The board pans and zooms around the cursor, and **Fit** shows
all of it. `.canvas` files open from the sidebar and ⌘K.

Boards are saved a moment after each change as JSON Canvas 1.0, tab-indented as
Obsidian writes it, keeping fields this app does not read. A file that is not a
canvas is reported and never opened as an empty board, so it cannot be
overwritten.

The store now saves and opens files that are not markdown exactly as written:
it used to stamp `updated` and `generator` front matter onto every file, which
would have put YAML at the top of a JSON file. The GitHub tree lists `.canvas`
files beside notes and PDFs.

### Dialogs keep focus where you put it

Every dialog moved focus back to its first field whenever the page behind it
re-rendered — after a save, a sync, a grade in a flashcard review — because it
treated each new close handler as a new dialog. It now sets focus once, when it
opens, and still closes with the newest handler.

### Save to ForkLeaf in Firefox

The extension now loads in Firefox 121 and later, from the same folder as in
Chrome: `about:debugging` → **Load Temporary Add-on…** → `manifest.json`. The
manifest declares both `background.service_worker` (Chrome) and
`background.scripts` (Firefox), which each browser ignores the other of, and a
Gecko add-on id. It still asks for no access to any site; a test holds the
manifest to all three.

### Ask your notebook

`/` or ⌘K → **Ask your notebook** answers a question with the passages in your
notes that answer it: paragraphs and list items, ranked by how much of the
question they cover with rare words counting for more (BM25-style), quoted with
the note, the heading and the line, matching words highlighted, at most two
from one note. **Open at line N** opens the note there — the line in Split and
Source, the paragraph in Rich text. No model writes anything, so it cannot say
what your notes do not, and nothing leaves the device.

### Meeting notes

`/` → **Start meeting notes** makes a dated note in `meetings/`. **Pull out
decisions and to-dos** reads the notes — or a voice note's transcript — for
`Decision:`, "we agreed", `Action:`, "@Sam will", "Leo will review", `Question:`
and speaker labels, and writes a Summary at the end: decisions, action items as
to-dos with owner and date, and open questions. The summary sits under its own heading, so running it again replaces it, and it is never read back in.

### Flashcards that work the way they are written

Cards written in the rich editor came out wrong. The editor escapes what it
saves, so `2 * 3 :: 6` was asked as "2 \* 3", `[[links]]` kept escaped
brackets, formatting marks showed raw, and every line ending inside a paragraph
left a backslash on its answer. `Question::Answer` without spaces made no card.

Cards are now shown as a person reads them, and the spellings Obsidian's
spaced-repetition plugin reads all work: `::` with or without spaces (a tight
card needs a question that reads like one, so `std::vector` stays code), `:::`
for a card each way, a line holding only `?` or `??` to split a card over
several lines, and `==highlights==` as fill-in-the-blank cards in notes tagged
`flashcards`. `::` inside inline code is not a separator, a card written twice
is asked once, and the review keeps multi-line answers' line breaks and says
when a card is reversed or a blank.

### Worth revisiting

A few older notes come back each day — in the document panel and through `/` →
**Open a note worth revisiting** — each with the reason it was chosen: linked to
the open note and untouched for a month, written on this day in an earlier year,
or among the longest forgotten. The choice holds for the day. Templates, the
flashcard schedule and encrypted notes are never suggested.

### Stale notes in the weekly review

The weekly review runs the notebook check over the same notes and adds **Worth
a look**: notes pointing at files or notes that no longer exist, then notes it
thinks have gone out of date, each with the reason. Notes that are merely old
are left out, so the section stays short enough to read.

### Everything in the `/` menu, input for code, a repository for saves, and one-step MCP

- **The `/` menu holds every feature.** Blocks and the app's tools are listed
  together under headings — Text, Lists, Insert, Study, Plan, Templates,
  Capture, See, Protect, History, Help, Formatting — and one search covers all
  of them, by name, keyword or group. Flashcards, dated to-dos, voice notes,
  the graph, board and table, encryption and history were reachable only
  through ⌘K before. A tool appears only when its command can run, and running
  it is running the command, so the two cannot disagree. A flashcard and a
  dated to-do are typed straight in. The same list works in Source view.
- **The menu no longer covers what is being typed.** It was positioned against
  the editor's box while drawn inside a padded container, so it landed a line
  too high, over the `/` it was answering. It is now fixed at the caret — below
  the line, or above it near the bottom of the window — follows scrolling, and
  repeats the query at the top.
- **Code that asks for input works.** A run's standard input comes from a
  file written beside the script, so `input()`, `read` and `process.stdin` get
  answers instead of an immediate end-of-file. Pressing Run on a program that
  reads input opens a **Program input** box first; a run that still stops for
  want of input reopens it and says why. The interpreter and script reach bash
  as arguments, never as shell text. The input is not written into the note.
- **Saves have their own repository.** The extension, bookmarklet and share
  sheet now open `/save`, which files each save into a private
  `forkleaf-saves` repository — `pages/`, `quotes/`, `links/`, `images/`, each
  by year and month, with the date first in every name — and rewrites
  `INDEX.md` (by month and kind, newest first) and `index.json` in the same
  commit. Saving the same page twice says when it was saved before. Signed out,
  the page offers to sign in (the request survives the trip) or to keep the
  save in this device's inbox. **Everything I saved** shows both, and opens a
  repository save on GitHub. An old `/editor?save=1` address redirects.
- **Connecting an AI assistant is one address and a sign-in.** `/api/mcp` is a
  remote MCP server (Streamable HTTP) with OAuth 2.1: the assistant registers
  itself, opens a ForkLeaf page where the person chooses the repository —
  optionally a folder, a branch and read-only — and gets tokens it keeps and
  renews. Nothing is stored on the server: registrations, codes and tokens are
  sealed with the session secret and carry their purpose, and each assistant
  gets a GitHub grant of its own, since GitHub refresh tokens can be spent only
  once. Codes need the PKCE verifier and last five minutes. **All tools →
  Connect an AI assistant** has a copy-ready step for Claude Code, Claude
  Desktop and claude.ai, Cursor and VS Code. The local `packages/mcp` server
  remains for people who want to run it themselves.
- **A documentation page for every feature**, in a new _Everyday features_
  section: the `/` menu, templates and journal, to-dos, flashcards, views,
  saving from the web, running code with input, voice notes, encrypted notes
  and importing. The MCP and extension guides are rewritten for the above.
- `future-implementations.md` tracks what is done and what is next.
- The All tools button and the extension and MCP guides, which were pushed
  after #69 was merged, are included here.

### Every tool as a button, and setup guides for the extension and MCP

- **All tools** in the editor header opens every command as a clickable button,
  grouped, filterable, with its shortcut beside it. Until now many features were
  reachable only through ⌘K or a shortcut, which is invisible to anyone who has
  not read about them. It is the same list the palette runs, so nothing can be
  in one and missing from the other.
- **/docs/browser-extension** and **/docs/mcp**, under a new _Connect_ section
  of the documentation: installing Save to ForkLeaf step by step, and connecting
  Claude Code, Claude Desktop or Cursor with a fine-grained token, including
  what to do when it does not connect. Reachable from All tools, ⌘K, and a
  _Step-by-step setup_ link on both cards of the features page.

### Import from Obsidian and Notion

⌘K → **Import notes from Obsidian or Notion** reads a folder picked from disk,
shows what will come across — how many notes and files, how many links were
updated, what was left out and why — and imports only when asked, into a folder
of its own so a mistaken import is one folder to delete.

- **Obsidian vaults** keep their folders and front matter. `![[picture.png]]`
  embeds, which Obsidian resolves by filename anywhere in the vault, become
  ordinary markdown images pointing at where the picture landed, so they
  render here and on github.com; `![[Note]]` embeds become `[[Note]]` links.
  `.obsidian`, `.trash` and other hidden folders are left behind.
- **Notion exports** (Markdown & CSV, unzipped) lose the 32-character id Notion
  appends to every page and folder name, and their URL-encoded relative links
  are rewritten to the cleaned paths. Database tables come out of Notion as CSV
  and are skipped with that reason.

Nothing already in the notebook is overwritten. Pictures, PDFs and recordings
are copied through the same queue as a pasted image; anything else, and any
file over the 3 MB a commit carries, is listed as left out. Up to 2,000 notes
at a time. The notes are saved and then added to the sidebar in one step — one
update per note would have kept only the last of them.

### Voice notes

⌘K → **Record a voice note** records in the browser, lets the recording be heard
back and redone, and **Add to note** saves it in `assets/` beside the note — like
a pasted picture, so it goes through the same queue, the same commit and the
same history — with a **Listen to the recording** link at the end of the note.

That link is the whole format. A paragraph that is only a link to a recording in
the repository now renders as an audio player in the preview and on published
pages, and stays a plain link to the file on github.com. Only repository files
play: a link to audio on another site stays a link, because playing it would
mean the page fetching from that site. The player is built after sanitising,
from a link the sanitiser has already passed, and a recording that is not on this
device stays a link rather than becoming a broken player.

Recordings are WebM or Ogg with Opus where the browser can, MP4 in Safari, and
stop at ten minutes, which keeps them inside the 3 MB a single commit carries.
Audio joins the allowlist the commit and raw-file routes share, and the content
security policy gains `media-src 'self' blob:` so a recording not yet pushed can
play from this device.

A transcript is optional, off by default, and says before it is switched on that
the browser does it — Chrome sends the audio to Google. Refusing microphone
permission is explained rather than failing silently, and a failed save keeps
the recording. Recording is not offered in an encrypted note, whose audio would
be stored in the clear.

### Your notebook, from an AI assistant

`packages/mcp` is a Model Context Protocol server. Added to Claude Code, Claude
Desktop or another MCP client, it lets the assistant search the notebook
(`search_notes`), list notes (`list_notes`), read one with the notes that link to
it (`read_note`), create or replace a note (`write_note`) and add to today's
journal note (`append_to_daily_note`).

It reads and commits to the notes repository with a GitHub token the person
gives it, directly — nothing passes through ForkLeaf. Writes are ordinary
commits marked `forkleaf:`, so each one is in the history. It refuses anything
that is not a `.md` or `.mdx` note, anything in a hidden folder such as
`.github`, any path that climbs out with `..` (checked before normalising, which
would otherwise quietly drop it), and anything outside `FORKLEAF_DIR` when that
is set. Encrypted notes are neither shown nor overwritten — the server has no
passphrase, so writing one could only destroy it. `FORKLEAF_READ_ONLY=true`
removes the two writing tools entirely. Configuration mistakes are reported as a
sentence naming the variable to set.

The protocol is written by hand, like the GitHub client: newline-delimited
JSON-RPC over stdio, with a malformed request answered as a JSON-RPC error and a
tool that could not do what it was asked answered with `isError`, so the
assistant can read why.

### Notebook check on every pull request

The stale-notes check that lived only in the editor now runs in CI.
`docs/workflows/notebook-check.yml` is a workflow to copy into a notes
repository: on a pull request it asks ForkLeaf to read the notes at that
commit, puts the report in the job summary, marks each broken reference on its
file, and fails the check when a note points at a file that is not there or a
`[[link]]` matches no note. Notes whose claims may have aged are listed as worth
re-reading and never fail anything. If ForkLeaf is unreachable the step warns
and passes, so an outage elsewhere does not block a merge.

Behind it is `GET /api/gh/notebook-check?owner=&repo=&ref=`, which reads every
markdown file at one commit — so a push landing mid-check cannot produce a
report mixing two versions — runs the same survey as the editor, and returns
the findings and a ready-made markdown report. It answers without signing in for
public repositories. A private repository needs a token: the signed-in session,
or an explicit `Authorization: Bearer` header, which the workflow sends only when
`FORKLEAF_SEND_TOKEN` is `true` and which is used for that request's reads and
nothing else. It reads at most 400 notes and skips any over 512 KB, saying how
many it skipped, and is rate limited.

Shipped as a template in `docs/` rather than switched on for this repository:
enabling it here would fail ForkLeaf's own pull requests against a production
deployment that does not have the route yet.

### Encrypted notes

⌘K → **Encrypt this note…** seals a note so that only its passphrase can read
it — in ForkLeaf, on github.com, in a clone on somebody else's machine. The
words, the title and the tags all go inside; the file keeps nothing about the
note but the fields ForkLeaf stamps on every note. It is still one ordinary
`.md` file, which explains on github.com what it is and carries the sealed
text, with the parameters needed to open it written beside it: AES-256-GCM,
the key derived from the passphrase with PBKDF2-SHA256 at 600,000 iterations.

Opening an encrypted note shows a passphrase box where the editor would be, so
the sealed text is never on screen as if it were the note. Once opened it edits
like any other note until the tab closes or ⌘K → **Lock this encrypted note**;
typing is sealed again after a short pause, reusing the key derived when it was
opened, with a fresh IV every save. **Remove encryption from this note** writes
it back as plain text, after asking. A passphrase that is wrong, and a file that
has been tampered with, both fail rather than showing garbage.

What it does not hide, said before encrypting: the filename. What it cannot do:
recover a forgotten passphrase — nobody holds a copy, ForkLeaf included. If a
newer version of an open note arrives from another device, the note locks
again instead of this tab overwriting it with what it remembered.

### A browser extension, and everything you saved in one place

- **Save to ForkLeaf**, a Chromium extension in `apps/extension`. The toolbar
  button (or Alt+Shift+S) saves the page, or the selection as a quote; the
  right-click menu saves a page, a selection, a link or an image. It opens
  ForkLeaf's save address in a new tab rather than writing anything itself, so
  it needs no account, holds no token, asks for no host permissions, and every
  save still goes through ForkLeaf's confirmation. A selection too long for an
  address is cut to fit and marked as cut. The decisions — what to save for each
  menu, which addresses count, where ForkLeaf is — are plain modules with tests.

- **Everything you saved.** ⌘K → **Show everything I saved** lays the inbox out
  as a grid of what each thing is: quotes set as quotes, pictures shown, links
  with their site and date. Filter by kind, search across titles, text, sites
  and tags, open the note, or open the original. Pictures are fetched through
  ForkLeaf's image proxy rather than by the browser, so browsing the inbox does
  not tell every site in it that you looked; one that will not load is hidden
  rather than drawn broken.

### Save from anywhere

Things worth keeping are mostly found somewhere other than a notes app. There
are now three ways to send them here, and all of them arrive the same way.

- **The share sheet.** Installed ForkLeaf registers as a share target, so
  **Share → ForkLeaf** works from any app on a phone.
- **A bookmarklet.** ⌘K → **Copy the Save to ForkLeaf bookmarklet** gives a
  bookmark that saves the page you are on, or the text you selected as a quote.
- **An address**, `/editor?save=1&kind=…&url=…&title=…&text=…`, for anything
  else — the browser extension will use the same one.

What is saved is a note in `inbox/` — a blockquote with its source for a quote,
a link for a page, the picture for an image — with `type`, `url`, `site` and
`saved` as properties. Nothing is fetched to make it; the words are the ones
that were shared.

**It always asks first.** A link to that address can be put on any website, so
arriving at it is not consent to write into somebody's repository. A dialog
shows exactly what will be saved, with Save focused so it is still one tap from
the share sheet; declining writes nothing. The address is cleared afterwards, so
a reload cannot save twice. Only `http` and `https` addresses are kept —
`javascript:` and `data:` are dropped — control characters are stripped, lengths
are capped, and parentheses in an address are escaped so they cannot break the
link. Saving the same link again says where the first copy is.

### This week, written down

⌘K → **Write this week's review** makes `journal/2026-w37.md`: the notes started
this week (and how many words they came to), the notes worked on, the notes
deleted, the to-dos that are overdue and the ones due in the next seven days —
each with a link to its note — and an empty **Looking back** heading for the part
only you can write. Running it again the same week opens the note rather than
writing a second one.

Read from the notes themselves — their `created` dates and when they were last
saved — so it works offline and in a notebook with no repository. On a
connected repository, notes deleted this week are found the same way **Bring
back a deleted note** finds them. To-dos are copied as plain lines rather than
boxes, so a review does not add a second copy of every task to the to-do list.
Weeks are ISO weeks, starting on Monday.

### Flashcards

A line written `Question :: Answer` in any note is a flashcard, and ⌘K →
**Review flashcards** goes through the ones due today: the question, the answer
when asked for, then **Again**, **Hard**, **Good** or **Easy** (or 1–4 on the
keyboard). The gap before a card returns grows as it is remembered — SM-2, the
schedule most flashcard apps descend from — and each button says what that gap
will be. A forgotten card comes round again before the session ends.

The schedule lives in `reviews/flashcards.md` as a table, one row per card, and
each grade is written to it straight away: it syncs, it has history, and
deleting a row starts that card over. A card is identified by its note and its
question, so editing the answer or the rest of the note keeps its progress.
`::` in code blocks, indented code, tables, headings and inline code is never
read as a card. The spelling is the one Obsidian's spaced-repetition plugin
reads, so the cards are not a ForkLeaf format.

### A graph of the notebook, and a folder as a board or a table

- **Graph.** ⌘K → **Show the graph of my notes** draws every note as a dot and
  every `[[link]]` between two notes as a line. It opens on the notes within two
  links of the one you are in; **Whole notebook** shows everything, and notes
  with no links are hidden until asked for. Scroll to zoom, drag to move, point
  at a note to light up its neighbours, type to find one, click to open it. The
  layout is computed here rather than by a library, and is deterministic — the
  same notebook draws the same picture every time, so where things are can be
  learned.

- **Board.** ⌘K → **Show this folder as a board** puts the folder's notes in
  columns by their `status` property — or any other property you pick. Drag a
  card, or use the menu on it, and that note's `status` changes; moving it to
  **No status** removes the property. Columns come from the values the notes
  already use, with To do / Doing / Done offered when the folder uses those or
  nothing yet.

- **Table.** ⌘K → **Show this folder as a table** lists the folder's notes with
  a column for every property they have. Click a header to sort (numbers as
  numbers, empty cells last), type to filter, click a cell to edit it. A
  property keeps the shape it had: a list stays a list and a number a number.
  **Add** gives every note a new, empty property column to fill in.

Neither view stores anything of its own. The board and the table are rebuilt
from the notes' front matter each time they open, so they cannot disagree with
the files, and every change is an ordinary edit to one note. A note locked on
this device is not changed, and the view says so.

### Fixed

- ⌘⇧F in the source view entered focus mode _and_ opened the editor's
  find-and-replace bar underneath it. The shortcut is now taken before the
  editor sees it.
- The **Leave focus** button sat under the "only on this device" banner. The
  banner steps away in focus mode with everything else.
- A new day's note began with an empty `- [ ]`, which the rich editor showed
  as a bullet reading "[ ]". It begins with the headings alone now.

### Bring back a deleted note

⌘K → **Bring back a deleted note** compares the notebook as it stood a week, a
month, three months or a year ago with the notebook now, and lists the notes
that have gone. Each can be read before deciding, and **Bring it back** writes
it at the path it had, properties included, as an ordinary new change. When a
file with the same name has appeared elsewhere since, the row says the note was
probably moved rather than deleted. Nothing new on the server: the comparison is
the time machine's read of an earlier day. When something new already lives at
the old path, the note comes back beside it instead of over it.

### Everyday writing: templates, today's note, to-dos and focus

Four things every notes app is expected to do, which ForkLeaf did not. Each one
is ordinary files and ordinary markdown, so nothing here works only inside
ForkLeaf.

- **Templates are files in `templates/`.** Every markdown file there appears in
  ⌘K as **New note from template**, and **Save this note as a template** makes
  one from what you have open. `{{title}}`, `{{date}}`, `{{time}}`,
  `{{weekday}}`, `{{yesterday}}` and `{{tomorrow}}` are filled in; any other
  braces are left alone, in case they are yours. A template's tags come along;
  its own title and creation date do not, or every meeting note would claim to
  have been written the day the template was.

- **Today's note.** ⌘K → **Open today's note** opens `journal/2026-09-12.md`,
  making it first if needed — from `templates/daily.md` when there is one, and a
  plain dated page with a to-do list when there is not. "Today" is the writer's
  own day, not UTC's.

- **Every open to-do, in one list.** A `- [ ]` written in Tuesday's meeting
  note was invisible from Wednesday's. ⌘K → **Show every open to-do** lists
  every unticked box in the notebook, soonest due first, and ticking one there
  ticks it in its note — one character, synced and in history like any edit.
  Due dates are `📅 2026-09-14` (the Obsidian Tasks spelling) or
  `due: 2026-09-14`. Boxes inside code blocks and templates are not tasks. When
  a note has changed since the list was read and the line cannot be found
  unambiguously, nothing is ticked and the list reads again.

- **Focus mode.** ⌘⇧F puts away the file tree, the tabs, the document panel and
  the status bar, and brings back exactly the layout you had when pressed again.

### Comparing two things, side by side

Three places in ForkLeaf could tell you that something had changed and then
leave you to work out _how_ on your own. All three can now show you.

- **A rewrite, beside the original.** Trying a rewrite already gave you a copy
  to work in and two buttons — keep it, throw it away — with nothing in between
  to base the choice on. The bar now has a third: **Compare** puts the two
  versions in two columns with the changed words picked out.

  Compared against the commit the rewrite grew from rather than the original's
  current tip. If anything landed on the original while the rewrite was being
  written, comparing against the tip would report that work as something the
  rewrite deletes — and talk you out of keeping a rewrite that deletes nothing.
  When the original has moved on, it says so instead.

- **Two versions of a paper, page beside page.** Comparing two versions of a
  PDF said which pages changed, compared as words rather than bytes. Picking
  one of those pages now draws it from both files at once, so "page 12 changed"
  becomes the paragraph that changed. The arrow beside it still takes the
  reader there.

- **A suggestion, read where you accept it.** A correction sent back from a
  published page could be accepted here but only read on github.com — three
  context switches to approve the one-word fixes that most of them are. The
  note before and after is now in the list itself. **Discuss on GitHub** stays,
  for the half that genuinely belongs there: replying to whoever sent it.

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

### A document's text, kept beside it

Two problems with one answer.

A scan is a photograph of a page. There is no text in it, so there is nothing
to search, nothing to quote and nothing to check a citation against — the
reader said so honestly and then there was nowhere to go. And a paper that
_does_ carry its text still had it extracted from scratch on every device,
every time, and thrown away at the end.

The reader now looks for `<name>.text.md` beside a document and uses it when
the document has nothing of its own. Recognise a scan's words once — with
`ocrmypdf`, `tesseract`, or anything else — commit the file, and search,
quotations, highlights and the citation check all start working on it, on every
device. For a paper that already has text, ⌘K → **Keep this document's text
beside it** writes the same file from what has already been read.

Markdown with a `## Page 1` heading per page, deliberately: somebody will make
these by hand and will want to correct a mangled line when they find one, which
means the format has to be something a person can open and read. Correcting a
line there corrects it everywhere.

A document's own text always wins. A file beside a paper never silently
replaces what the paper actually says.

**Recognising the words inside ForkLeaf is still not possible**, and that is a
decision rather than an omission — see `docs/ideas.md`.

### Fixed — renaming a folder duplicated it, and broke every picture in it

Three faults in one action, which together made renaming a folder unsafe.

**The links to the pictures were repointed at the old folder.** A note's links
are relative to where the note sits, so moving one is normally accompanied by
rewriting them — but when the whole folder moves, the pictures move with it,
and `assets/chart.png` was being rewritten to `../../old-folder/assets/chart.png`,
which no longer exists. Every image in a renamed folder broke immediately, and
the note looked fine until somebody opened it. Links that point _out_ of the
folder are still rewritten, because those files did not move.

**The old folder stayed on screen beside the new one.** The sidebar corrects
the repository's file list with whatever has not been pushed yet, and it knew
about renames and deletions but not about _moves_ — which is how everything
that is not a note travels, a PDF included. So a folder holding a paper
appeared twice.

**An open tab kept pointing at the old path.** The next keystroke in it saved
the note back to where it used to be, recreating the folder that had just been
renamed with one note inside it. Tabs now follow the rename, and so do the
locks on the notes in them.

Between them these explain the duplicate folder people were left deleting — and
why deleting it took real files with it: the duplicate was not a copy, it was
the original.

### Borrow a note from somebody else's notebook

When a friend writes a good note, what people do is copy and paste it. Now
there are two copies, one is already out of date, and neither of you can tell
which. Installing a library solved this for code thirty years ago and nobody
has solved it for the things people know.

⌘K → **Borrow a note from another notebook** takes a repository as
`owner/name`, lists the notes in it, and writes a link into yours —
`[[repo:ada/notes:runbook.md@a1b2c3d]]` — pinned to the revision you read.
Theirs stays theirs, nothing is copied here, and the link keeps working after
they change it, because it names the version you actually read rather than
&ldquo;whatever is there now&rdquo;. Unpin it if following along is what you
wanted.

### See what changed between two versions of a document

A paper in your repository has every version of itself kept beside it, which no
other reading app can say. ⌘K → **See what changed in this document** picks an
earlier version and reports which pages changed — and whether one of them is a
page you quoted.

Compared as text, not as bytes: a paper re-exported from the same source
differs in every byte while saying exactly the same thing, and a comparison
that reported four hundred changed pages every time somebody re-saved it would
be one nobody reads twice. Hyphenation across a line break, ligatures and runs
of spaces are not edits.

Whether the words you quoted survived is a different question, and one **Check
my citations against their documents** already answers.

### Publish your reading, not just your notes

A note written from a paper is commentary with the passages set into it, each
linked back to the page it came from. That is the thing worth sharing — not
&ldquo;here is a PDF&rdquo; and not &ldquo;here is an opinion&rdquo;, but the
argument with its receipts.

It did not survive publishing. A citation is written relative to the note,
which is right in the repository and reaches nothing from a page served out of
`docs/` — so every quotation on a published reading page was a dead link,
silently, which is worse than no link at all because it looks like there is a
source behind it.

Citations are now rewritten on the way out, to the document in your repository,
fragment and all. Only the published copy changes: the note keeps its relative
links, because that is what makes it readable on github.com and in any other
editor.

### Highlights that are just text files

Everybody else locks a highlight inside the PDF — a binary annotation only a
PDF reader can see — or inside their own app, where you can never get it out.
Both mean the marks you made on a paper are worth nothing away from the tool
you made them in, which is a strange fate for the part that is actually yours.

Select a passage and press **Highlight**. It becomes a line in
`attention.highlights.md`, committed beside the document, and is drawn in green
over the page when you read it. The file renders on github.com, opens in
Notepad, greps and diffs.

The PDF is never touched. And because each line records the words rather than a
page number, a highlight made against last year's version of a paper is still
drawn in the right place after the author adds a figure to page 4 — one that has
genuinely gone is simply not drawn, rather than drawn somewhere wrong.

### Try a rewrite without losing what you had

Rewriting a note you care about is a small act of courage: the old version goes
into the history, where you have to know it exists and how to get it back. In
practice people either do not try, or paste the original into a second note
called `runbook-old.md`.

⌘K → **Try a rewrite of this note** gives you a copy of the notebook to
experiment in, and a bar at the top that says so and never goes away. **Keep
it** puts the rewrite back onto the branch it came from as one change; **Throw
it away** deletes the experiment and leaves the original exactly as it was.

It is a git branch — named `try/<branch>/<what>`, so the name itself says what
it is and where it has to land, and a second device picks the experiment up
knowing both. Nothing is written down anywhere else, because anything written
down anywhere else is the thing that gets lost.

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
